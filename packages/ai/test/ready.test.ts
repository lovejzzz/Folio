import { readFileSync } from 'node:fs';
import { checklistLines, lessonChecklist, lessonReady, orderedLessons, parseCourse, project, readyLines } from '@folio/core';
import { describe, expect, it } from 'vitest';
import { readyKept } from '../src/handouts';

/**
 * What a teacher must have on hand, from two lessons Folio really wrote (the frozen batch at 96e0492, kept in
 * test/fixtures): readers found the quiz papers and the copies only inside the segments that used them.
 */
const course = (name: string) => parseCourse(JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8')) as unknown);

describe('what to have ready before a lesson', () => {
  it('lists the sheets to copy with how many, and the paper sat in the meeting', () => {
    const c = course('batch1-calculus');
    const first = orderedLessons(c)[0]!;
    const list = lessonReady(c, first);
    expect(list.copies).toHaveLength(first.handouts.length);
    expect(list.copies[0]).toEqual({ title: 'A table for sin x / x', copies: 'One per student' });
    // The brief does not say the quiz is taken online: a paper for every student.
    expect(list.papers).toEqual(['Weekly recitation quizzes: Tangent lines, velocity and the limit of a function']);
    // The weekly homework is handed in online and is no paper to print.
    expect(readyLines(list).join('\n')).not.toContain('Weekly online homework');
    expect(readyLines(list)[1]).toBe('Sat in this lesson, a paper for every student: “Weekly recitation quizzes: Tangent lines, velocity and the limit of a function”.');
  });

  it('is in the checklist and at the head of the teacher\'s plan, and not in the student\'s', () => {
    const c = course('batch1-data-structures');
    const second = orderedLessons(c)[1]!;
    const lines = checklistLines(lessonChecklist(c, second)).ready;
    expect(lines[0]).toBe('Copies to make: “Find and fix the bug in the bracket checker” (One per student).');
    expect(lines.some((l) => l.startsWith('Sat in this lesson, a paper for every student: “Quizzes'))).toBe(true);
    const plan = (teacher: boolean) => JSON.stringify(project(c, 'plan', { audience: teacher ? 'teacher' : 'student', lessonIds: [second.id] }));
    expect(plan(true)).toContain('To have ready');
    expect(plan(false)).not.toContain('To have ready');
    expect(plan(false)).not.toContain('a paper for every student');
  });

  it('carries what the sheets\' writer listed beside them, and says nothing where a lesson holds nothing', () => {
    const c = course('batch1-calculus');
    const first = orderedLessons(c)[0]!;
    expect(readyLines(lessonReady(c, { ...first, ready: ['Students bring a calculator.'] })).at(-1)).toBe('Students bring a calculator.');
    expect(readyLines(lessonReady(c, { ...first, handouts: [], homework: { kind: 'none', toward: '' }, also: [], ready: [] }))).toEqual([]);
  });

  it('keeps of the writer\'s list only what no rule lists already (as a first run of four real courses gave it)', () => {
    const given = ['Students bring a calculator, set to degree mode', 'Teacher: the printed paper for Quizzes, written separately', 'Teacher: the question for the first prediction activity ready to put on the screen', ' '];
    expect(readyKept(given)).toEqual(['Students bring a calculator, set to degree mode']);
  });
});
