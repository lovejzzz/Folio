import { readFileSync } from 'node:fs';
import { orderedLessons, parseCourse, type Task } from '@folio/core';
import { nodeRunner } from '@folio/run/node';
import { describe, expect, it } from 'vitest';
import { checkAnswers } from '../src/answerCheck';
import { gradingIn } from '../src/gradingIn';
import { unsaidWays } from '../src/pieceFacts';
import { placedWork } from '../src/placement';
import { announced } from '../src/sections';
import type { PlanDraft } from '../src/schemas';
import { fakeInference } from './fake';

/**
 * Four faults found in lessons Folio really wrote, each kept here as it was written (test/fixtures, cut down to the
 * lessons concerned): from the reading of thirty-two lessons at 4cf47e3 and from a later pair of lessons. They are the
 * material a teacher would have been given.
 */
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8')) as unknown;
const draftOf = (segments: { kind: string; session: number; title: string; minutes: number; description: string; teacherNotes: string }[]): PlanDraft => ({ keyIdeas: ['a', 'b'], vocabulary: [], segments: segments.map((s) => ({ ...s, session: s.session + 1 })) }) as PlanDraft;

describe('a test sat next time, announced in the lesson before', () => {
  it('is said to cover what was taught so far, never the lesson it is sat in', () => {
    const course = parseCourse(fixture('f12-data-structures'));
    const [first, second] = orderedLessons(course);
    // As the plan stood before Folio's sentence was added to it.
    const plan = draftOf(first!.segments.map((s) => ({ ...s, description: s.description.split('\n').filter((line) => !/next time they sit/i.test(line)).join('\n') })));
    const said = announced(plan, course, first!).segments.at(-1)!.description.split('\n').at(-1)!;
    expect(said).toMatch(/next time they sit/);
    // The paper is on lists and linked lists (lesson 1); the lesson it is sat in teaches stacks and queues.
    expect(second!.title).toBe('Stacks and queues');
    expect(said.toLowerCase()).not.toContain('stacks and queues');
    expect(said).toBe('Before students leave, tell them that next time they sit a graded test ("Quizzes").');
  });
});

describe('papers collected at the end of a test', () => {
  it('are not a way of handing in another piece that the brief left open', () => {
    const course = parseCourse(fixture('f12-data-structures'));
    const second = orderedLessons(course)[1]!;
    // "Collect every paper at the end of the time." in the quiz's own segment, which also says a problem set is due now.
    expect(second.segments.some((s) => /Collect every paper at the end of the time/.test(s.description))).toBe(true);
    expect(unsaidWays(second.segments, course, second)).toEqual([]);
  });
});

describe('a quiz every week, in a course whose lesson is a week of several meetings', () => {
  it('is held by the first lesson too: its recitation can sit one on that week\'s lectures', () => {
    const course = parseCourse(fixture('f12-calculus'));
    const first = orderedLessons(course)[0]!;
    // As written: the plan ran a "Recitation quiz" of 12 points with its questions in the teacher's notes, and the lesson
    // held no test, so no paper was written for students.
    expect(first.segments.some((s) => s.title === 'Recitation quiz' && /Questions, answers and points/.test(s.teacherNotes))).toBe(true);
    expect([first.homework, ...first.also].some((p) => p.kind === 'test')).toBe(false);
    const placed = placedWork(gradingIn(course.brief), course.lessonOrder.length, true, course.shape.sessions.length > 1);
    expect(placed[0]!.filter((p) => p.kind === 'test').map((p) => p.toward)).toEqual(['Weekly recitation quizzes']);
    // In a course that meets once a lesson, nothing can be asked on reading nobody was told to do: from the second lesson.
    expect(placedWork(gradingIn(course.brief), course.lessonOrder.length, true, false)[0]!.some((p) => p.kind === 'test')).toBe(false);
  });
});

describe('what an explanation says of a wrong choice', () => {
  it('is taken out when a program cannot reproduce it and it cannot be put right: the key stands, the false account goes', async () => {
    const cart = fixture('pilot2-physics-cart-question') as Task & { explanation: string; choices: { text: string }[] };
    // As written: "uses position as velocity" for 7.0 (x(2) is 11), and "ignores the cubic position term" for 1.0 (that gives −3).
    expect(cart.explanation).toContain('uses position as velocity and velocity as acceleration');
    const wrongAt = (text: string) => cart.choices.findIndex((c) => c.text.includes(text)) + 1;
    // The forms a model would write for what the explanation says: position and velocity at 2 s; the velocity without the cubic term's part.
    const setup = 'x = lambda t: 1.0 + 5.0*t - 2.0*t**2 + 1.0*t**3\nv = lambda t: 5.0 - 4.0*t + 3.0*t**2\na = lambda t: -4.0 + 6.0*t';
    const form = (explanation: string) => ({
      checkable: true,
      setup,
      answer_expr: '[v(2.0), a(2.0)]',
      choices: cart.choices.map((c, i) => ({
        n: i + 1,
        kind: 'value',
        ...(c.text.includes('7.0') && explanation.includes('uses position as velocity') ? { origin_expr: '[x(2.0), v(2.0)]' } : {}),
        ...(c.text.includes('1.0 m/s') && explanation.includes('ignores the cubic position term') ? { origin_expr: '[(lambda t: 5.0 - 4.0*t)(2.0), a(0.0)]' } : {}),
      })),
      stated: [], verbatim: [], unchecked: [],
    });
    expect([wrongAt('7.0'), wrongAt('1.0 m/s')].every((n) => n > 0)).toBe(true);
    // The model that corrects offers nothing usable; the form is written from the item as it then stands.
    const model = fakeInference((req) => (req.task === 'folio_answer_fix' ? { changes: [] } : form(JSON.parse(req.prompt).explanation as string)));
    const out = await checkAnswers(model, nodeRunner(), [cart]);
    const fixed = out.fixed.get(cart.id) as (Task & { explanation: string }) | undefined;
    expect(fixed?.explanation).toBeDefined();
    expect(fixed!.explanation).toContain('these give 9.0 m/s and 8.0 m/s²');
    expect(fixed!.explanation).not.toContain('uses position as velocity');
    expect(fixed!.explanation).not.toContain('ignores the cubic position term');
    // What the program could reproduce is kept: dropping the constant −4.0 from the acceleration does give 12.0.
    expect(fixed!.explanation).toContain('drops the constant −4.0 m/s² from acceleration');
  }, 240_000);
});

describe('the minutes a plan gives a piece done in class', () => {
  it('are those of the segments that name it in full, not of every segment that shares a word with it', async () => {
    const { CourseStore, cmd } = await import('@folio/core');
    const { minutesFor } = await import('../src/workJobs');
    const { smallCourse } = await import('./fake');
    const store = new CourseStore({ ...smallCourse(), grading: [{ id: 'g_1', item: 'Recitation group problems', weight: 10 }] });
    const [first] = orderedLessons(store.getState());
    const seg = (title: string, minutes: number, description: string) => ({ id: `x_${title}`, session: 0, kind: 'practice' as const, title, minutes, description, teacherNotes: '' });
    const segments = [seg('Worked problem: a car braking', 12, 'The class works one problem together.'), seg('Group check', 8, 'Each group compares answers to the practice problems.'), seg('Recitation group problems', 26, 'Groups work the graded problems.')];
    store.apply([cmd('lesson.homework', { lessonId: first!.id, homework: { kind: 'inclass', toward: 'Recitation group problems', standing: false } }), cmd('section.fill', { lessonId: first!.id, kind: 'plan', flags: [], content: { segments, keyIdeas: ['k'], vocabulary: [] } })], { label: { key: 'b' }, source: 'teacher' });
    expect(minutesFor(store.getState(), store.getState().lessons[first!.id]!)).toBe(26);
  });
});

/** Two more, found in the first batch written from this branch (readiness/batch1, frozen at 96e0492). */
describe('a paper sat in a lesson that tests an earlier one', () => {
  it('is not titled with the lesson it is sat in: a quiz on lists was "Quizzes: Stacks and queues"', async () => {
    const { pieceTitle } = await import('../src/workJobs');
    const course = parseCourse(fixture('batch1-data-structures'));
    const second = orderedLessons(course)[1]!;
    // As written: the paper's own first question is on a Python list against a linked list, the lesson before.
    const paper = second.taskIds.map((id) => course.tasks[id]!).find((t) => t.kind === 'assignment' && t.toward === 'Quizzes')!;
    expect(paper.kind === 'assignment' && [paper.title, /Python list with a singly linked list/.test(paper.steps[0]!)]).toEqual(['Quizzes: Stacks and queues', true]);
    expect(pieceTitle(course, { ...second, homework: { kind: 'test', toward: 'Quizzes' }, also: [] })).toBe('Quizzes 1');
    // In a course whose lesson is a week of several meetings the quiz is on that week, and is named for it.
    const weekly = parseCourse(fixture('batch1-calculus'));
    const week = orderedLessons(weekly)[1]!;
    expect(pieceTitle(weekly, { ...week, homework: { kind: 'test', toward: 'Weekly recitation quizzes' }, also: [] })).toBe(`Weekly recitation quizzes: ${week.title}`);
  });
});

describe('the sentence Folio adds to announce a test', () => {
  it('says that a test is sat next time and claims nothing of what it covers', () => {
    // As written in a weekly course: "on what the course has taught up to today", of a quiz that is on next week's lectures.
    const weekly = parseCourse(fixture('batch1-calculus'));
    const [, week2] = orderedLessons(weekly);
    expect(week2!.segments.some((s) => /next time they sit a graded test \(“Weekly recitation quizzes”\), on what the course has taught up to today/.test(s.description))).toBe(true);
    const plan = draftOf(week2!.segments.map((s) => ({ ...s, description: s.description.split('\n').filter((line) => !/next time they sit/i.test(line)).join('\n') })));
    const said = announced(plan, weekly, week2!).segments.at(-1)!.description.split('\n').at(-1)!;
    expect(said).toBe('Before students leave, tell them that next time they sit a graded test ("Weekly recitation quizzes").');
  });
});
