// @vitest-environment jsdom
import { binarySearch, describeStart, orderedLessons, project, type Course, type Slide } from '@folio/core';
import { sampleCourse } from '@folio/core/sample';
import { keyframes } from '@folio/figures';
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { renderDocx, renderPptx } from '../src';

const LIST = [3, 8, 12, 17, 23, 31, 42, 56, 71];
const base = sampleCourse();
const lesson = orderedLessons(base)[0]!;
const deck = (visual: Slide['visual']): Course => ({
  ...base,
  lessons: { ...base.lessons, [lesson.id]: { ...lesson, slides: [{ id: 's1', layout: 'bullets', title: 'Halving the search', bullets: [], notes: 'Ask which half can be set aside before each step.', visual }] } },
});
const course = deck({ kind: 'figure', figure: 'binarySearch', values: LIST, target: 40 });
const model = binarySearch({ values: LIST, target: 40 });
const frames = keyframes(model);
const docOf = (c: Course, audience: 'teacher' | 'student') => project(c, 'slides', { audience, lessonIds: [lesson.id] });
const unzip = (bytes: Uint8Array) => unzipSync(bytes);
const text = (files: Record<string, Uint8Array>, test: RegExp) => Object.entries(files).filter(([name]) => test.test(name)).map(([, data]) => strFromU8(data)).join('');
const pngs = (files: Record<string, Uint8Array>, test: RegExp) => Object.entries(files).filter(([name, data]) => test.test(name) && data[0] === 137 && data[1] === 80);
const broken = (xml: string) => new DOMParser().parseFromString(xml, 'text/xml').getElementsByTagName('parsererror').length > 0;

describe('a slide with a demonstration, in a deck', () => {
  it('is a slide for every picture of the search, each a PNG with its sentence, and a last slide with the table of steps', async () => {
    const files = unzip(await renderPptx(docOf(course, 'teacher')));
    const slides = Object.keys(files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name));
    expect(slides).toHaveLength(frames.length + 1);
    for (const name of slides) expect(broken(strFromU8(files[name]!)), name).toBe(false);
    expect(pngs(files, /^ppt\/media\//)).toHaveLength(frames.length);
    const all = text(files, /^ppt\/slides\/slide\d+\.xml$/);
    for (const f of frames) expect(all).toContain(f.caption.replace(/&/g, '&amp;'));
    expect(all).toContain('<a:tbl>');
    expect(all).toContain('nothing left: not in the list');
    expect(all).toContain(`Halving the search (1/${frames.length})`);
  });

  it('keeps the teacher\'s notes for the teacher: a student\'s deck has the same pictures and no notes', async () => {
    const teacher = unzip(await renderPptx(docOf(course, 'teacher')));
    const student = unzip(await renderPptx(docOf(course, 'student')));
    expect(text(teacher, /notesSlide/)).toContain('Ask which half can be set aside');
    expect(text(student, /./).includes('Ask which half can be set aside')).toBe(false);
    expect(pngs(student, /^ppt\/media\//).map(([, d]) => d.length)).toEqual(pngs(teacher, /^ppt\/media\//).map(([, d]) => d.length));
  });

  it('says why, on one slide, when the list cannot be searched', async () => {
    const files = unzip(await renderPptx(docOf(deck({ kind: 'figure', figure: 'binarySearch', values: [9, 3, 5], target: 3 }), 'teacher')));
    expect(Object.keys(files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))).toHaveLength(1);
    expect(text(files, /^ppt\/slides\//)).toContain('needs its list in ascending order');
    expect(pngs(files, /^ppt\/media\//)).toHaveLength(0);
  });
});

describe('a slide with a demonstration, in a Word file', () => {
  it('has every picture in order with its sentence under it, and then the table of steps', async () => {
    const files = unzip(await renderDocx([docOf(course, 'student')], { courseTitle: course.title }));
    const xml = strFromU8(files['word/document.xml']!);
    expect(broken(xml)).toBe(false);
    expect(pngs(files, /^word\/media\//)).toHaveLength(frames.length);
    expect(xml.match(/<w:drawing>/g)).toHaveLength(frames.length);
    const at = frames.map((f) => xml.indexOf(f.caption.slice(0, 40)));
    expect(at.every((n, i) => n > 0 && (i === 0 || n > at[i - 1]!))).toBe(true);
    expect(xml).toContain(describeStart(model).slice(0, 30));
    expect(xml).toContain('<w:tbl>');
    expect(xml).toContain('What follows');
    // Each picture says in words what it shows, for a reader who cannot see it.
    expect(xml).toContain(`descr="${frames[1]!.caption.slice(0, 30)}`);
  });

  it('is not left as a table alone: the pictures are there for the student and for the teacher', async () => {
    for (const audience of ['student', 'teacher'] as const) {
      const files = unzip(await renderDocx([docOf(course, audience)], { courseTitle: course.title }));
      expect(pngs(files, /^word\/media\//).length, audience).toBe(frames.length);
    }
  });
});
