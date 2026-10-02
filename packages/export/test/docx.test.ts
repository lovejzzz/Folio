import { describe, expect, it } from 'vitest';
import { project, type Course } from '@folio/core';
import { sampleCourse } from '@folio/core/sample';
import { renderDocx } from '../src';
import { unzipText } from './helpers';

const course = sampleCourse();
const EXPLANATION = 'Only the sleep question expects different answers';

async function documentXml(c: Course, kinds: Parameters<typeof project>[1][], audience: 'student' | 'teacher') {
  const docs = kinds.map((k) => project(c, k, { audience }));
  const bytes = await renderDocx(docs, { courseTitle: c.title });
  return unzipText(bytes).text('word/document.xml');
}

describe('renderDocx', () => {
  it('puts answers and the answer key in the teacher quiz', async () => {
    const xml = await documentXml(course, ['quiz'], 'teacher');
    expect(xml).toContain('Answer key');
    expect(xml).toContain(EXPLANATION);
    expect(xml).toContain('Teacher copy');
  });

  it('keeps answers out of the student quiz', async () => {
    const xml = await documentXml(course, ['quiz'], 'student');
    expect(xml).not.toContain(EXPLANATION);
    expect(xml).not.toContain('Answer key');
    expect(xml).toContain('Student copy');
    expect(xml).toContain('Which of these is a statistical question?');
  });

  it('uses real heading styles, numbering and flagged table header rows', async () => {
    const xml = await documentXml(course, ['syllabus', 'plan', 'slides'], 'teacher');
    expect(xml).toContain('w:val="Heading1"');
    expect(xml).toContain('w:val="Heading2"');
    expect(xml).toContain('w:val="Heading3"');
    expect(xml).toContain('<w:tblHeader/>');
    expect(xml).toContain('<w:numPr>');
    expect(xml).toMatch(/Slide 1 · /);
  });

  it('sets out the syllabus reading column and the grading table', async () => {
    const c: Course = structuredClone(course);
    const first = c.lessons[c.lessonOrder[0]!]!;
    first.readings = ['Freedman, Statistics, ch. 1', 'A news article of your choice'];
    c.grading = [
      { id: 'g1', item: 'Problem sets', weight: 30 },
      { id: 'g2', item: 'Final exam', weight: 70 },
    ];
    const xml = await documentXml(c, ['syllabus'], 'student');
    for (const text of ['Reading', 'Freedman, Statistics, ch. 1', 'A news article of your choice', 'Component', 'Weight', 'Problem sets', '30%', 'Total', '100%']) {
      expect(xml).toContain(`>${text}</w:t>`);
    }
    // The grading table is two columns, the component about three times as wide as its weight.
    const pairs = [...xml.matchAll(/<w:tblGrid><w:gridCol w:w="(\d+)"\/><w:gridCol w:w="(\d+)"\/><\/w:tblGrid>/g)].map((m) => Number(m[1]) / Number(m[2]));
    expect(pairs.some((ratio) => Math.abs(ratio - 76 / 24) < 0.01)).toBe(true);
  });

  it('sets code marked with backticks in Consolas, without the marks', async () => {
    const c: Course = structuredClone(course);
    const first = c.lessons[c.lessonOrder[0]!]!;
    first.readings = ['Run `summary(wage1)` before class', 'Read se(β̂_educ)'];
    const xml = await documentXml(c, ['syllabus'], 'student');
    expect(xml).toMatch(/<w:rFonts w:ascii="Consolas"[^>]*\/>.*?<w:t xml:space="preserve">summary\(wage1\)<\/w:t>/s);
    expect(xml).toContain('>Run </w:t>');
    expect(xml).toMatch(/<w:vertAlign w:val="subscript"\/>.*?<w:t xml:space="preserve">educ<\/w:t>/s);
    expect(xml).not.toContain('`');
  });

  it('writes the course title into the document properties', async () => {
    const bytes = await renderDocx([project(course, 'map', { audience: 'student' })], { courseTitle: course.title });
    expect(unzipText(bytes).text('docProps/core.xml')).toContain(course.title);
  });

  it('labels and sets East Asian fonts for Chinese courses', async () => {
    const zh: Course = { ...structuredClone(course), language: 'zh-CN' };
    const xml = await documentXml(zh, ['quiz'], 'teacher');
    expect(xml).toContain('测验与题库');
    expect(xml).toContain('教师版');
    expect(xml).toMatch(/w:eastAsia="SimSun"/);
  });

  it('refuses an empty selection', async () => {
    await expect(renderDocx([], { courseTitle: 'x' })).rejects.toThrow();
  });
});

describe('a Word file in Pages as in Word', () => {
  it('makes Normal the default style, and ends each material on a hairline', async () => {
    const course = sampleCourse();
    const zip = unzipText(await renderDocx([project(course, 'map', { audience: 'student' }), project(course, 'syllabus', { audience: 'student' })], { courseTitle: course.title }));
    // A paragraph with no style of its own is Normal, not the heading before it.
    expect(zip.text('word/styles.xml')).toContain('<w:style w:type="paragraph" w:default="1" w:styleId="Normal">');
    // The paragraph holding a material's page settings can't spill onto a blank page.
    const document = zip.text('word/document.xml');
    expect(document).not.toContain('<w:p><w:pPr><w:sectPr>');
    expect(document).toContain('w:line="20" w:lineRule="exact"/><w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr><w:sectPr>');
  });
});
