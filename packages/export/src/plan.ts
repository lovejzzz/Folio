import { docLabels, project, type Audience, type Course, type MaterialKind } from '@folio/core';
import { zipFiles } from './bundle';
import { renderCsv } from './csv';
import { renderDocx } from './docx';
import { slugFilename } from './filenames';
import { writeFolio } from './folioFile';
import { exportLabels } from './labels';
import { renderPptx } from './pptx';
import { quizRows, renderXlsx } from './xlsx';
import { ExportError } from './errors';

export type ExportFormat = 'docx' | 'pptx' | 'xlsx' | 'csv' | 'zip' | 'folio';

export interface ExportRequest {
  course: Course;
  kinds: MaterialKind[];
  audience: Audience;
  lessonIds?: string[];
  format: ExportFormat;
}

export interface ExportFile {
  name: string;
  mime: string;
  bytes: Uint8Array;
}

export const MIME: Record<ExportFormat, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv;charset=utf-8',
  zip: 'application/zip',
  folio: 'application/zip',
};

/** A file the export will produce: its name now, its bytes on demand. */
interface Planned {
  name: string;
  mime: string;
  make: () => Promise<Uint8Array>;
}

function audienceLabel(req: ExportRequest): string {
  const l = docLabels(req.course.language);
  return req.audience === 'teacher' ? l.teacherCopy : l.studentCopy;
}

/** "Lesson 2 · Samples and bias" when the export covers one lesson, so its files are not named like the whole course's. */
function scopeName(req: ExportRequest): string {
  const [only, ...more] = req.lessonIds ?? [];
  const lesson = only && !more.length ? req.course.lessons[only] : undefined;
  if (!lesson) return '';
  return `${docLabels(req.course.language).lesson(req.course.lessonOrder.indexOf(lesson.id) + 1)} · ${lesson.title}`;
}

/** "Syllabus", "Syllabus, Quiz & exam bank", or "Course materials" for longer picks. */
function partName(req: ExportRequest): string {
  const x = exportLabels(req.course.language);
  const names = req.kinds.map((k) => docLabels(req.course.language).materials[k]);
  return names.length && names.length <= 3 ? names.join(x.join) : x.materials;
}

function projectOne(req: ExportRequest, kind: MaterialKind) {
  return project(req.course, kind, { audience: req.audience, ...(req.lessonIds ? { lessonIds: req.lessonIds } : {}) });
}

function docxFile(req: ExportRequest, kinds: MaterialKind[], part: string): Planned {
  return {
    name: slugFilename(req.course.title, part, audienceLabel(req), 'docx', scopeName(req)),
    mime: MIME.docx,
    make: () => renderDocx(kinds.map((k) => projectOne(req, k)), { courseTitle: req.course.title }),
  };
}

function pptxFile(req: ExportRequest): Planned {
  const part = docLabels(req.course.language).materials.slides;
  return {
    name: slugFilename(req.course.title, part, audienceLabel(req), 'pptx', scopeName(req)),
    mime: MIME.pptx,
    make: () => renderPptx(projectOne(req, 'slides')),
  };
}

function quizFile(req: ExportRequest, format: 'xlsx' | 'csv'): Planned {
  const part = docLabels(req.course.language).materials.quiz;
  return {
    name: slugFilename(req.course.title, part, audienceLabel(req), format, scopeName(req)),
    mime: MIME[format],
    make: async () => {
      const rows = quizRows(projectOne(req, 'quiz'));
      return format === 'csv' ? renderCsv(rows) : renderXlsx([{ name: part, rows }]);
    },
  };
}

function folioFile(req: ExportRequest): Planned {
  return {
    name: slugFilename(req.course.title, '', '', 'folio'),
    mime: MIME.folio,
    make: async () => writeFolio(req.course),
  };
}

/** Everything that goes inside the zip bundle. */
function zipContents(req: ExportRequest): Planned[] {
  const l = docLabels(req.course.language);
  const files = req.kinds.map((k) => docxFile(req, [k], l.materials[k]));
  if (req.kinds.includes('slides')) files.push(pptxFile(req));
  if (req.kinds.includes('quiz')) files.push(quizFile(req, 'csv'));
  // A .folio is the whole course with every answer: only a whole-course teacher copy carries one.
  if (req.audience === 'teacher' && !req.lessonIds) files.push(folioFile(req));
  return files;
}

function plan(req: ExportRequest): Planned {
  switch (req.format) {
    case 'docx':
      return docxFile(req, req.kinds, partName(req));
    case 'pptx':
      return pptxFile(req);
    case 'xlsx':
    case 'csv':
      return quizFile(req, req.format);
    case 'folio':
      if (req.audience !== 'teacher') throw new ExportError('folioIsTeacherCopy', 'A Folio file holds the whole course with answers, so it is always a teacher copy.');
      return folioFile(req);
    case 'zip': {
      const contents = zipContents(req);
      return {
        name: slugFilename(req.course.title, partName(req), audienceLabel(req), 'zip', scopeName(req)),
        mime: MIME.zip,
        make: async () => {
          const files = await Promise.all(contents.map(async (f) => ({ name: f.name, bytes: await f.make() })));
          return zipFiles(files);
        },
      };
    }
  }
}

/**
 * Produce the file for an export request. Word holds the chosen materials in
 * order; pptx is always the slide deck; xlsx and csv are the quiz bank; zip
 * bundles one file per material plus a .folio backup; folio is the course.
 */
export async function exportCourse(req: ExportRequest): Promise<ExportFile> {
  if (req.format === 'docx' && !req.kinds.length) throw new ExportError('noMaterials', 'Choose at least one material to export.');
  const planned = plan(req);
  return { name: planned.name, mime: planned.mime, bytes: await planned.make() };
}

/**
 * The names an export would produce, without rendering anything: `files` is
 * what gets downloaded, `contents` lists what is inside a zip (else empty).
 */
export function describeExport(req: ExportRequest): { files: string[]; contents: string[] } {
  return {
    files: [plan(req).name],
    contents: req.format === 'zip' ? zipContents(req).map((f) => f.name) : [],
  };
}
