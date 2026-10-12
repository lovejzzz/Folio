// @vitest-environment jsdom
import { binarySearch, cellState, describeStart, figureFaults, orderedLessons, project, type Course, type Slide } from '@folio/core';
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
const course = deck({ kind: 'figure', figure: 'binarySearch', look: 'cabinet', values: LIST, target: 40 });
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
    const files = unzip(await renderPptx(docOf(deck({ kind: 'figure', figure: 'binarySearch', look: 'cabinet', values: [9, 3, 5], target: 3 }), 'teacher')));
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

describe('a demonstration the picture cannot hold, or that is not finished', () => {
  const long = deck({ kind: 'figure', figure: 'binarySearch', look: 'cabinet', values: Array.from({ length: 20 }, (_, i) => i * 5), target: 35 });
  const draft = deck({ kind: 'figure', figure: 'binarySearch', look: 'cabinet', values: LIST, target: 40, entered: { values: '1, nope, 3' } });

  it('is told in words and in the table when it is searched and cannot be drawn: no picture, and the reason', async () => {
    const word = unzip(await renderDocx([docOf(long, 'student')], { courseTitle: long.title }));
    const xml = strFromU8(word['word/document.xml']!);
    expect(pngs(word, /^word\/media\//)).toHaveLength(0);
    expect(xml).toContain('The picture holds only so many numbers');
    expect(xml).toContain('35 was found at position 8');
    expect(xml).toContain('What follows');
    const slides = text(unzip(await renderPptx(docOf(long, 'student'))), /^ppt\/slides\/slide\d+\.xml$/);
    expect(slides).toContain('The picture holds only so many numbers');
    expect(slides).toContain('35 was found at position 8');
    expect(slides).toContain('<a:tbl>');
  });

  it('is exported as unfinished, with what was typed, and never as the numbers it had before', async () => {
    const xml = strFromU8(unzip(await renderDocx([docOf(draft, 'teacher')], { courseTitle: draft.title }))['word/document.xml']!);
    expect(xml).toContain('This demonstration is not finished');
    expect(xml).toContain('1, nope, 3');
    expect(xml).not.toContain('Searching for 40');
    expect(xml).not.toContain('What follows');
    const files = unzip(await renderPptx(docOf(draft, 'teacher')));
    const slides = text(files, /^ppt\/slides\/slide\d+\.xml$/);
    expect(slides).toContain('This demonstration is not finished');
    expect(slides).not.toContain('Searching for 40');
    expect(pngs(files, /^ppt\/media\//)).toHaveLength(0);
  });
});

describe('where a course says a demonstration is not ready', () => {
  const draft = deck({ kind: 'figure', figure: 'binarySearch', look: 'cabinet', values: LIST, target: 40, entered: { target: 'forty' } });

  it('is one list for the map and for an export, from the check the slide uses: the lesson, the slide and the reason', () => {
    expect(figureFaults(draft)).toEqual([{ lessonId: lesson.id, lesson: 1, slide: 1, title: 'Halving the search', problem: 'unfinished' }]);
    expect(figureFaults(course)).toEqual([]);
    expect(figureFaults(deck({ kind: 'figure', figure: 'binarySearch', look: 'cabinet', values: [9, 3], target: 3 }))[0]).toMatchObject({ problem: 'unsorted' });
    // Only the lessons asked for, and a list the picture cannot hold is no fault: it is searched and told in words.
    expect(figureFaults(draft, ['another-lesson'])).toEqual([]);
    expect(figureFaults(deck({ kind: 'figure', figure: 'binarySearch', look: 'cabinet', values: [1e-8, 1], target: 1 }))).toEqual([]);
  });

  it('marks the deck on the map as needing a look', () => {
    const state = (c: Course) => cellState(c, c.lessons[lesson.id]!, 'slides');
    expect(state(draft)).toBe('attention');
    expect(state(course)).toBe('ready');
  });
});

