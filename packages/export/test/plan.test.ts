import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { sampleCourse } from '@folio/core/sample';
import { describeExport, exportCourse, readFolio, slugFilename, type ExportFormat, type ExportRequest } from '../src';

const course = sampleCourse();
const base: Omit<ExportRequest, 'format'> = { course, kinds: ['quiz'], audience: 'teacher' };

describe('exportCourse', () => {
  const expected: Record<ExportFormat, [string, string]> = {
    docx: ['Reading the world with data — Quiz & exam bank (Teacher copy).docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    pptx: ['Reading the world with data — Slide decks (Teacher copy).pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    xlsx: ['Reading the world with data — Quiz & exam bank (Teacher copy).xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    csv: ['Reading the world with data — Quiz & exam bank (Teacher copy).csv', 'text/csv;charset=utf-8'],
    zip: ['Reading the world with data — Quiz & exam bank (Teacher copy).zip', 'application/zip'],
    folio: ['Reading the world with data.folio', 'application/zip'],
  };

  for (const [format, [name, mime]] of Object.entries(expected) as [ExportFormat, [string, string]][]) {
    it(`names and types a ${format} export`, async () => {
      const file = await exportCourse({ ...base, format });
      expect(file.name).toBe(name);
      expect(file.mime).toBe(mime);
      expect(file.bytes.length).toBeGreaterThan(100);
      expect(describeExport({ ...base, format }).files).toEqual([name]);
    });
  }

  it('bundles one Word file per material, the deck and the quiz csv; a student copy has no backup', async () => {
    const req: ExportRequest = { ...base, kinds: ['syllabus', 'slides', 'quiz'], audience: 'student', format: 'zip' };
    const file = await exportCourse(req);
    const names = Object.keys(unzipSync(file.bytes)).sort();
    expect(names).toEqual(
      [
        'Reading the world with data — Syllabus (Student copy).docx',
        'Reading the world with data — Slide decks (Student copy).docx',
        'Reading the world with data — Quiz & exam bank (Student copy).docx',
        'Reading the world with data — Slide decks (Student copy).pptx',
        'Reading the world with data — Quiz & exam bank (Student copy).csv',
      ].sort(),
    );
    expect(describeExport(req).contents.sort()).toEqual(names);
  });

  it('adds the .folio backup only to a whole-course teacher copy', async () => {
    const teacher = await exportCourse({ ...base, kinds: ['quiz'], format: 'zip' });
    const folio = unzipSync(teacher.bytes)['Reading the world with data.folio'];
    expect(folio && readFolio(folio)).toEqual(course);
    const oneLesson = await exportCourse({ ...base, kinds: ['quiz'], lessonIds: [course.lessonOrder[0]!], format: 'zip' });
    expect(Object.keys(unzipSync(oneLesson.bytes)).some((n) => n.endsWith('.folio'))).toBe(false);
  });

  it('refuses a student copy of a Folio file, which always holds the answers', async () => {
    await expect(exportCourse({ ...base, audience: 'student', format: 'folio' })).rejects.toThrow(/teacher copy/);
  });

  it('never puts an answer, explanation or teacher note anywhere in a student zip', async () => {
    const secrets = teacherOnlyText(course);
    expect(secrets.length).toBeGreaterThan(10);
    const kinds = ['map', 'syllabus', 'plan', 'slides', 'assignments', 'rubrics', 'discussions', 'quiz', 'study', 'faq'] as const;
    const file = await exportCourse({ ...base, kinds: [...kinds], audience: 'student', format: 'zip' });
    const text = allText(file.bytes);
    for (const secret of secrets) expect(text, secret).not.toContain(secret);
    // The same scan finds them in a teacher copy, so it can see a leak.
    const teacher = allText((await exportCourse({ ...base, kinds: [...kinds], format: 'zip' })).bytes);
    expect(secrets.filter((x) => !teacher.includes(x))).toEqual([]);
  });

  it('exports slides for the chosen lessons even when slides are not picked', async () => {
    const lessonId = course.lessonOrder[0] ?? '';
    const file = await exportCourse({ ...base, kinds: ['plan'], lessonIds: [lessonId], format: 'pptx' });
    const slides = Object.keys(unzipSync(file.bytes)).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
    expect(slides.length).toBe(course.lessons[lessonId]?.slides.length);
  });

  it('writes several materials into one Word file in the order given', async () => {
    const file = await exportCourse({ ...base, kinds: ['quiz', 'syllabus'], format: 'docx' });
    expect(file.name).toBe('Reading the world with data — Quiz & exam bank, Syllabus (Teacher copy).docx');
    const xml = strFromU8(unzipSync(file.bytes)['word/document.xml'] ?? new Uint8Array());
    expect(xml.indexOf('Quiz &amp; exam bank')).toBeLessThan(xml.indexOf('Syllabus'));
  });

  it('refuses a Word export with nothing chosen', async () => {
    await expect(exportCourse({ ...base, kinds: [], format: 'docx' })).rejects.toThrow('Choose at least one material');
  });
});

describe('slugFilename', () => {
  it('keeps CJK and strips characters file systems refuse', () => {
    expect(slugFilename('统计：用数据/读世界?', '测验与题库', '教师版', 'docx')).toBe('统计：用数据-读世界 — 测验与题库 (教师版).docx');
    expect(slugFilename('A "big" <idea>: part\u0007two', 'Quiz', '', '.csv')).toBe('A big idea part two — Quiz.csv');
  });

  it('shortens long titles and keeps the part and extension', () => {
    const name = slugFilename('x'.repeat(300), 'Syllabus', 'Student copy', 'docx');
    expect(name.endsWith('— Syllabus (Student copy).docx')).toBe(true);
    expect(Array.from(name).length).toBeLessThanOrEqual(125);
  });
});

/** Text only a teacher may see: explanations, model answers, teacher and speaker notes. */
function teacherOnlyText(c: ReturnType<typeof sampleCourse>): string[] {
  const out: string[] = [];
  for (const task of Object.values(c.tasks)) {
    if (task.kind !== 'question') continue;
    out.push(task.explanation);
    if (task.format === 'short' || task.format === 'numeric') out.push(task.answer);
  }
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object')
      for (const [k, x] of Object.entries(v)) {
        if ((k === 'teacherNotes' || k === 'notes') && typeof x === 'string') out.push(x);
        else walk(x);
      }
  };
  walk(c.lessons);
  // Long enough to be unmistakable; short ones ("12") could appear legitimately.
  return out.map((x) => x.trim()).filter((x) => x.length >= 16);
}

/** Every piece of text in a zip, looking inside Office files too. */
function allText(zip: Uint8Array): string {
  const decode = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
  return Object.entries(unzipSync(zip))
    .map(([name, bytes]) => (/\.(docx|pptx|xlsx|folio)$/.test(name) ? Object.values(unzipSync(bytes)).map((b) => decode(strFromU8(b))).join('\n') : strFromU8(bytes)))
    .join('\n');
}
