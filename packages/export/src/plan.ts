import { MEDIA_FOLDER, courseLabels, localMediaRef, mediaFileNames, pageMediaRefs, project, type Audience, type Course, type MaterialKind } from '@folio/core';
import { MIME } from './mime';
import { zipFiles } from './bundle';
import { renderCsv } from './csv';
import { renderDocx } from './docx';
import { slugFilename } from './filenames';
import { courseMediaIds, writeFolio, type FolioMedia } from './folioFile';
import { exportLabels } from './labels';
import type { MediaResolver } from './media';
import { hasNotebook, weekNotebook } from './notebook';
import { renderQti } from './qti';
import { renderPptx } from './pptx';
import { quizRows, renderXlsx } from './xlsx';
import { ExportError } from './errors';

export type ExportFormat = 'docx' | 'pptx' | 'xlsx' | 'csv' | 'qti' | 'zip' | 'folio';

export interface ExportRequest {
  course: Course;
  kinds: MaterialKind[];
  audience: Audience;
  lessonIds?: string[];
  format: ExportFormat;
}

/** What an export needs from whoever asks for it, beyond the course. */
export interface ExportOptions {
  /** Turns a reference to a picture, clip or file into its bytes. Without it, exports carry none. */
  media?: MediaResolver;
}

export interface ExportFile {
  name: string;
  mime: string;
  bytes: Uint8Array;
}

export { MIME } from './mime';

/** A file the export will produce: its name now, its bytes on demand. */
interface Planned {
  name: string;
  mime: string;
  make: () => Promise<Uint8Array>;
}

function audienceLabel(req: ExportRequest): string {
  const l = courseLabels(req.course);
  return req.audience === 'teacher' ? l.teacherCopy : l.studentCopy;
}

/** "Lesson 2 · Samples and bias" when the export covers one lesson, so its files are not named like the whole course's. */
function scopeName(req: ExportRequest): string {
  const [only, ...more] = req.lessonIds ?? [];
  const lesson = only && !more.length ? req.course.lessons[only] : undefined;
  if (!lesson) return '';
  return `${courseLabels(req.course).lesson(req.course.lessonOrder.indexOf(lesson.id) + 1)} · ${lesson.title}`;
}

/** "Syllabus", "Syllabus, Quiz & exam bank", or "Course materials" for longer picks. */
function partName(req: ExportRequest): string {
  const x = exportLabels(req.course.language);
  const names = req.kinds.map((k) => courseLabels(req.course).materials[k]);
  return names.length && names.length <= 3 ? names.join(x.join) : x.materials;
}

function projectOne(req: ExportRequest, kind: MaterialKind) {
  return project(req.course, kind, { audience: req.audience, ...(req.lessonIds ? { lessonIds: req.lessonIds } : {}) });
}

function docxFile(req: ExportRequest, kinds: MaterialKind[], part: string, opts: ExportOptions): Planned {
  return {
    name: slugFilename(req.course.title, part, audienceLabel(req), 'docx', scopeName(req)),
    mime: MIME.docx,
    make: () => renderDocx(kinds.map((k) => projectOne(req, k)), { courseTitle: req.course.title, ...(opts.media ? { media: opts.media } : {}) }),
  };
}

function pptxFile(req: ExportRequest): Planned {
  const part = courseLabels(req.course).materials.slides;
  return {
    name: slugFilename(req.course.title, part, audienceLabel(req), 'pptx', scopeName(req)),
    mime: MIME.pptx,
    make: () => renderPptx(projectOne(req, 'slides')),
  };
}

/** The quizzes as a package Canvas imports: questions with their keys, so the teacher's copy only. */
function qtiFile(req: ExportRequest): Planned {
  const name = `${courseLabels(req.course).materials.quiz} for Canvas (QTI)`;
  return { name: slugFilename(req.course.title, name, '', 'zip', scopeName(req)), mime: MIME.qti, make: async () => renderQti(req.course, req.lessonIds) };
}

function quizFile(req: ExportRequest, format: 'xlsx' | 'csv'): Planned {
  const part = courseLabels(req.course).materials.quiz;
  return {
    name: slugFilename(req.course.title, part, audienceLabel(req), format, scopeName(req)),
    mime: MIME[format],
    make: async () => {
      const rows = quizRows(projectOne(req, 'quiz'));
      return format === 'csv' ? renderCsv(rows) : renderXlsx([{ name: part, rows }]);
    },
  };
}

/** The pictures, clips and files a backup carries: all the course still uses that this device has. */
async function folioMedia(course: Course, resolve: MediaResolver | undefined): Promise<FolioMedia[]> {
  const out: FolioMedia[] = [];
  if (!resolve) return out;
  for (const id of courseMediaIds(course)) {
    const found = await resolve(localMediaRef(id), 'file').catch(() => null);
    if (found) out.push({ id, name: found.name ?? id, type: found.type, bytes: found.bytes });
  }
  return out;
}

function folioFile(req: ExportRequest, opts: ExportOptions): Planned {
  return {
    name: slugFilename(req.course.title, '', '', 'folio'),
    mime: MIME.folio,
    make: async () => writeFolio(req.course, undefined, await folioMedia(req.course, opts.media)),
  };
}

/**
 * The media folder of a zip: each picture, clip and file the exported weeks' pages use, under a name that says
 * where it goes, for uploading to wherever the course is taught. Only with the pages themselves.
 */
function mediaFiles(req: ExportRequest, opts: ExportOptions): Planned[] {
  if (!req.kinds.includes('plan')) return [];
  const names = mediaFileNames(req.course);
  const lessons = req.lessonIds ?? req.course.lessonOrder;
  const refs = new Set(lessons.flatMap((id) => pageMediaRefs(req.course.lessons[id]?.page ?? [])));
  return [...refs].flatMap((ref) => {
    const name = names.get(ref);
    if (!name) return [];
    // One this device does not hold is left out: an empty file would pass for the real one.
    return [{ name: `${MEDIA_FOLDER}/${name}`, mime: '', make: async () => (await opts.media?.(ref, 'file').catch(() => null))?.bytes ?? new Uint8Array() }];
  });
}

/** Where a zip keeps the weeks' notebooks. */
const NOTEBOOK_FOLDER = 'notebooks';

/**
 * A notebook for each exported week whose page has Python: the week ready to run, in place of typing it out.
 * The teacher's copy shows what each cell printed. Only with the pages themselves.
 */
function notebookFiles(req: ExportRequest): Planned[] {
  if (!req.kinds.includes('plan')) return [];
  const l = courseLabels(req.course);
  return (req.lessonIds ?? req.course.lessonOrder).flatMap((id) => {
    const lesson = req.course.lessons[id];
    if (!lesson || !hasNotebook(lesson)) return [];
    const n = req.course.lessonOrder.indexOf(id) + 1;
    return [{ name: `${NOTEBOOK_FOLDER}/${slugFilename(l.lesson(n), lesson.title, '', 'ipynb')}`, mime: 'application/x-ipynb+json', make: async () => weekNotebook(lesson, req.audience === 'teacher') }];
  });
}

/** Everything that goes inside the zip bundle. */
function zipContents(req: ExportRequest, opts: ExportOptions): Planned[] {
  const l = courseLabels(req.course);
  const files = req.kinds.map((k) => docxFile(req, [k], l.materials[k], opts));
  if (req.kinds.includes('slides')) files.push(pptxFile(req));
  if (req.kinds.includes('quiz')) files.push(quizFile(req, 'csv'));
  // With the quiz bank, the same questions as Canvas takes them in: only where the answers may go.
  if (req.kinds.includes('quiz') && req.audience === 'teacher') files.push(qtiFile(req));
  // A .folio is the whole course with every answer: only a whole-course teacher copy carries one.
  if (req.audience === 'teacher' && !req.lessonIds) files.push(folioFile(req, opts));
  return [...files, ...notebookFiles(req), ...mediaFiles(req, opts)];
}

function plan(req: ExportRequest, opts: ExportOptions): Planned {
  switch (req.format) {
    case 'docx':
      return docxFile(req, req.kinds, partName(req), opts);
    case 'pptx':
      return pptxFile(req);
    case 'xlsx':
    case 'csv':
      return quizFile(req, req.format);
    case 'qti':
      return qtiFile(req);
    case 'folio':
      if (req.audience !== 'teacher') throw new ExportError('folioIsTeacherCopy', 'A Folio file holds the whole course with answers, so it is always a teacher copy.');
      return folioFile(req, opts);
    case 'zip': {
      const contents = zipContents(req, opts);
      return {
        name: slugFilename(req.course.title, partName(req), audienceLabel(req), 'zip', scopeName(req)),
        mime: MIME.zip,
        make: async () => {
          const files = await Promise.all(contents.map(async (f) => ({ name: f.name, bytes: await f.make() })));
          return zipFiles(files.filter((f) => f.bytes.length > 0));
        },
      };
    }
  }
}

/**
 * Produce the file for an export request. Word holds the chosen materials in
 * order; pptx is always the slide deck; xlsx and csv are the quiz bank; zip
 * bundles one file per material, a .folio backup and the pages' own pictures,
 * clips and files; folio is the course with its media.
 */
export async function exportCourse(req: ExportRequest, opts: ExportOptions = {}): Promise<ExportFile> {
  if (req.format === 'docx' && !req.kinds.length) throw new ExportError('noMaterials', 'Choose at least one material to export.');
  const planned = plan(req, opts);
  return { name: planned.name, mime: planned.mime, bytes: await planned.make() };
}

/**
 * The names an export would produce, without rendering anything: `files` is
 * what gets downloaded, `contents` lists what is inside a zip (else empty).
 */
export function describeExport(req: ExportRequest): { files: string[]; contents: string[] } {
  return {
    files: [plan(req, {}).name],
    contents: req.format === 'zip' ? zipContents(req, {}).map((f) => f.name) : [],
  };
}
