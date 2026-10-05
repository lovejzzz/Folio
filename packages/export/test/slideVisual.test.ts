// @vitest-environment jsdom
import { orderedLessons, project, type Course, type Slide } from '@folio/core';
import { sampleCourse } from '@folio/core/sample';
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { renderDocx, renderPptx } from '../src';

const base = sampleCourse();
const lesson = orderedLessons(base)[0]!;
const slides: Slide[] = [
  { id: 's1', layout: 'bullets', title: 'In and out', bullets: [], notes: '', visual: { kind: 'table', columns: ['', 'Goes in', 'Comes out'], rows: [['Gas', 'CO2', 'O2']] } },
  { id: 's2', layout: 'bullets', title: 'Starch after a day', bullets: ['Which made more?'], notes: 'Ask first.', visual: { kind: 'chart', chart: 'bar', categories: ['Light', 'Dark'], series: [{ name: '', values: [8, 2] }], unit: 'mg', illustrative: true } },
];
const course: Course = { ...base, lessons: { ...base.lessons, [lesson.id]: { ...lesson, slides } } };
const doc = project(course, 'slides', { audience: 'teacher', lessonIds: [lesson.id] });
const parts = (bytes: Uint8Array) => Object.fromEntries(Object.entries(unzipSync(bytes)).map(([name, data]) => [name, /\.(xml|rels)$/.test(name) ? strFromU8(data) : '']));
const broken = (xml: string) => new DOMParser().parseFromString(xml, 'text/xml').getElementsByTagName('parsererror').length > 0;

describe('a slide with a table or a chart', () => {
  it('is a table of PowerPoint\'s own and a chart of its own, drawn from the numbers, in a file that opens', async () => {
    const files = parts(await renderPptx(doc));
    for (const [name, xml] of Object.entries(files)) if (xml) expect(broken(xml), name).toBe(false);
    const all = Object.values(files).join('');
    expect(all).toContain('<a:tbl>');
    expect(all).toContain('Goes in');
    const chart = Object.entries(files).find(([name]) => /ppt\/charts\/chart\d+\.xml$/.test(name))?.[1] ?? '';
    expect(chart).toContain('<c:barChart>');
    expect(chart).toMatch(/<c:v>8<\/c:v>[\s\S]*<c:v>2<\/c:v>/);
    // Made-up numbers are said to be so, on the slide.
    expect(all).toContain('Illustration, not real data.');
  });

  it('is a table in a Word file: the slide\'s own, or the numbers its chart is drawn from', async () => {
    const xml = parts(await renderDocx([doc], { courseTitle: course.title }))['word/document.xml']!;
    expect(broken(xml)).toBe(false);
    expect(xml.match(/<w:tbl>/g)!.length).toBeGreaterThanOrEqual(2);
    expect(xml).toContain('Goes in');
    expect(xml).toMatch(/Light[\s\S]*Dark[\s\S]*>8<[\s\S]*>2</);
  });
});
