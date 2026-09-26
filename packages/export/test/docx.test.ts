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
