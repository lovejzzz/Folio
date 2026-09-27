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

  it('bundles one Word file per material, the deck, the quiz csv and a backup', async () => {
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
        'Reading the world with data.folio',
      ].sort(),
    );
    expect(describeExport(req).contents.sort()).toEqual(names);
    const folio = unzipSync(file.bytes)['Reading the world with data.folio'];
    expect(folio && readFolio(folio)).toEqual(course);
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

  it('names a one-lesson export after the lesson, and a whole-course one after the course only', () => {
    const lessonId = course.lessonOrder[1] ?? '';
    const kinds = ['plan', 'slides', 'assignments', 'rubrics'] as const;
    const one: ExportRequest = { ...base, kinds: [...kinds], lessonIds: [lessonId], audience: 'student', format: 'docx' };
    expect(describeExport(one).files).toEqual(['Reading the world with data — Lesson 2 · Picturing a distribution — Course materials (Student copy).docx']);
    expect(describeExport({ ...one, format: 'pptx' }).files).toEqual(['Reading the world with data — Lesson 2 · Picturing a distribution — Slide decks (Student copy).pptx']);
    expect(describeExport({ ...one, format: 'zip' }).contents).toContain('Reading the world with data — Lesson 2 · Picturing a distribution — Rubrics (Student copy).docx');
    expect(describeExport({ ...one, lessonIds: undefined }).files).toEqual(['Reading the world with data — Course materials (Student copy).docx']);
    expect(describeExport({ ...one, format: 'folio' }).files).toEqual(['Reading the world with data.folio']);
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

  it('puts a scope such as one lesson between the course and the part, shortening a long one', () => {
    expect(slugFilename('Stats', 'Syllabus', 'Student copy', 'docx', 'Lesson 2 · Samples: and bias?')).toBe('Stats — Lesson 2 · Samples and bias — Syllabus (Student copy).docx');
    const name = slugFilename('Stats', 'Quiz', 'Teacher copy', 'csv', `Lesson 1 · ${'y'.repeat(200)}`);
    expect(name.endsWith('… — Quiz (Teacher copy).csv')).toBe(true);
    expect(name.startsWith('Stats — Lesson 1 · y')).toBe(true);
  });

  it('shortens long titles and keeps the part and extension', () => {
    const name = slugFilename('x'.repeat(300), 'Syllabus', 'Student copy', 'docx');
    expect(name.endsWith('— Syllabus (Student copy).docx')).toBe(true);
    expect(Array.from(name).length).toBeLessThanOrEqual(125);
  });
});
