import { readFileSync } from 'node:fs';
import { MATERIAL_KINDS, orderedLessons, parseCourse, project, type Course } from '@folio/core';
import { describe, expect, it } from 'vitest';
import { renderDocx, renderPptx } from '../src';
import { unzipText } from './helpers';

/**
 * A course Folio really wrote (two lessons of calculus, as generated at 4cf47e3), exported for students: nothing that is
 * the teacher's may be in the file. The small sample course proves the switch works; this proves it on everything a real
 * lesson holds: sheet keys, the keys and running notes of graded work, quiz answers and explanations, teacher's notes.
 */
const course: Course = parseCourse(JSON.parse(readFileSync(new URL('./fixtures/f12-calculus-two-lessons.json', import.meta.url), 'utf8')));
const lessons = orderedLessons(course).slice(0, 2);

const plain = (xml: string) => xml.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/\s+/g, ' ');
const squash = (text: string) => text.replace(/[`*_]/g, '').replace(/\s+/g, ' ').trim();
/** Sentences of a teacher-only text long enough to be told from anything students are given. */
const telling = (text: string) => squash(text).split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length >= 40);

function teachersOnly(): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = [];
  for (const lesson of lessons) {
    for (const seg of lesson.segments) for (const text of telling(seg.teacherNotes)) out.push({ where: `notes of "${seg.title}"`, text });
    for (const sheet of lesson.handouts) for (const text of telling(sheet.key)) out.push({ where: `key of "${sheet.title}"`, text });
    for (const slide of lesson.slides) for (const text of telling(slide.notes ?? '')) out.push({ where: `notes of slide "${slide.title}"`, text });
    for (const id of lesson.taskIds) {
      const task = course.tasks[id]!;
      if (task.kind === 'assignment') for (const text of telling(task.answerKey)) out.push({ where: `key of "${task.title}"`, text });
      if (task.kind === 'question') for (const text of telling(task.explanation)) out.push({ where: `explanation of "${task.prompt.slice(0, 40)}"`, text });
    }
  }
  return out;
}

/** What a student is given says the same thing in its own right: a sentence of a key that is also printed on the sheet is not a leak. */
function studentsOwn(): string {
  return squash(JSON.stringify(lessons.map((l) => [l.handouts.map((h) => h.blocks), l.slides.map(({ notes: _notes, ...slide }) => slide), l.study, l.taskIds.map((id) => { const t = course.tasks[id]!; return t.kind === 'assignment' ? [t.prompt, t.steps] : t.kind === 'question' ? [t.prompt, t.choices] : t; })])));
}

describe('a real course, exported for students', () => {
  const secrets = teachersOnly();
  const own = studentsOwn();
  const leaks = (text: string) => secrets.filter((s) => !own.includes(s.text.slice(0, 60)) && text.includes(s.text.slice(0, 60)));

  it('has teacher-only text to keep out, in every place a lesson keeps it', () => {
    const places = new Set(secrets.map((s) => s.where.split(' of ')[0]));
    expect([...places].sort()).toEqual(['explanation', 'key', 'notes']);
    expect(secrets.length).toBeGreaterThan(60);
  });

  it('keeps all of it out of the Word file, material by material', async () => {
    // The lesson plan is the one material that is the teacher's own page: a teacher who ticks it for a student copy hands
    // out what each segment does, which the slide notes say again. It is checked apart, below.
    for (const kind of MATERIAL_KINDS.filter((k) => k !== 'plan')) {
      const doc = project(course, kind, { audience: 'student', lessonIds: lessons.map((l) => l.id) });
      const text = plain(unzipText(await renderDocx([doc], { courseTitle: course.title })).text('word/document.xml'));
      expect(leaks(squash(text)).map((s) => `${kind}: ${s.where}: ${s.text.slice(0, 60)}`)).toEqual([]);
    }
  });

  it('gives a student copy of the plan no teacher\'s notes and no key, though it carries what each segment does', async () => {
    const doc = project(course, 'plan', { audience: 'student', lessonIds: lessons.map((l) => l.id) });
    const text = squash(plain(unzipText(await renderDocx([doc], { courseTitle: course.title })).text('word/document.xml')));
    const found = leaks(text).filter((s) => !s.where.startsWith('notes of slide'));
    expect(found.map((s) => `${s.where}: ${s.text.slice(0, 60)}`)).toEqual([]);
  });

  it('keeps all of it out of the deck, speaker notes included', async () => {
    const doc = project(course, 'slides', { audience: 'student', lessonIds: lessons.map((l) => l.id) });
    const files = unzipText(await renderPptx(doc));
    const text = squash(files.names.filter((n) => /^ppt\/(slides|notesSlides)\/.*\.xml$/.test(n)).map((n) => plain(files.text(n))).join(' '));
    expect(leaks(text).map((s) => `${s.where}: ${s.text.slice(0, 60)}`)).toEqual([]);
  });

  it('and the teacher\'s copy has them', async () => {
    const docs = MATERIAL_KINDS.map((kind) => project(course, kind, { audience: 'teacher', lessonIds: lessons.map((l) => l.id) }));
    const text = squash(plain(unzipText(await renderDocx(docs, { courseTitle: course.title })).text('word/document.xml')));
    const found = secrets.filter((s) => text.includes(s.text.slice(0, 60))).length;
    expect(found / secrets.length).toBeGreaterThan(0.8);
  });
});
