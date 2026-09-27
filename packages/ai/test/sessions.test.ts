import { describe, expect, it } from 'vitest';
import { CourseStore, cmd, orderedLessons, project } from '@folio/core';
import { courseBackground, courseFromOutline, generateSection, OutlineDraft, outlinePrompt, sectionPrompt } from '../src';
import { fakeInference, smallCourse } from './fake';

const sessions = [
  { kind: 'lecture' as const, minutes: 50 },
  { kind: 'seminar' as const, minutes: 50 },
];

function twoSessionCourse() {
  const store = new CourseStore(smallCourse());
  store.apply([cmd('course.update', { shape: { sessions, minutesPerLesson: 100 } })], { label: { key: 't' }, source: 'teacher' });
  return store;
}

describe('lessons that meet more than once', () => {
  it('asks for a lecture and a seminar, each timed and each for what it is', () => {
    const course = twoSessionCourse().getState();
    const lesson = orderedLessons(course)[0]!;
    expect(courseBackground(course)).toContain('Each lesson meets 2 times: a 50-minute lecture, then a 50-minute seminar.');
    expect(courseBackground(course)).toContain('a seminar runs on discussion of the reading, led by the students, without slides');
    expect(sectionPrompt(course, lesson, 'plan')).toContain('"session" set to 1 for the lecture (50 minutes), 2 for the seminar (50 minutes)');
    expect(sectionPrompt(course, lesson, 'slides')).toContain('The slides are for the lecture; the other sessions run without them.');
    expect(sectionPrompt(course, lesson, 'discussions')).toContain('They are for the seminar');
    const outline = outlinePrompt({ brief: 'b', lessonCount: 4, minutesPerLesson: 100, sessions, level: '', language: 'en', sources: [] });
    expect(outline).toContain('Each lesson meets 2 times: a 50-minute lecture, then a 50-minute seminar.');
  });

  it('keeps a course that meets once exactly as before', () => {
    const course = smallCourse();
    expect(courseBackground(course)).toContain(`Each lesson lasts ${course.shape.minutesPerLesson} minutes.`);
    expect(sectionPrompt(course, orderedLessons(course)[0]!, 'plan')).toContain(`whose minutes add up to ${course.shape.minutesPerLesson}`);
  });

  it('files each segment under its session, times each session on its own, and prints a table per session', async () => {
    const store = twoSessionCourse();
    const lesson = orderedLessons(store.getState())[0]!;
    const seg = (session: number, minutes: number, title: string) => ({ kind: 'teach', session, title, minutes, description: 'd', teacherNotes: '' });
    const draft = { keyIdeas: ['a', 'b'], segments: [seg(1, 30, 'Lecture part'), seg(1, 20, 'Questions'), seg(2, 20, 'Seminar opening'), seg(2, 10, 'Short close'), seg(3, 5, 'Stray')], vocabulary: [] };
    const inf = fakeInference(() => draft);
    const result = await generateSection(inf, store.getState(), lesson.id, 'plan');
    store.apply(result.commands, { label: { key: 'b' }, source: 'ai' });
    const after = store.getState().lessons[lesson.id]!;
    expect(after.segments.map((s) => s.session)).toEqual([0, 0, 1, 1, 1]);
    // The seminar's 35 minutes of 50 is flagged; the lecture's 50 of 50 is not.
    expect(after.gen.plan!.flags).toEqual([{ code: 'minutesMismatch', values: { total: 35, target: 50 } }]);
    const text = JSON.stringify(project(store.getState(), 'plan', { audience: 'teacher' }));
    expect(text).toContain('Lecture · 50 min');
    expect(text).toContain('Seminar · 50 min');
  });

  it('takes the sessions from the request into the new course', () => {
    const draft = OutlineDraft.parse({ title: 'T', summary: 'S.', subject: 'P', level: 'U', lessons: [{ title: 'L', summary: 's', objectives: ['o'] }] });
    const course = courseFromOutline({ brief: 'b', lessonCount: 1, minutesPerLesson: 50, sessions, quizSize: 5, level: '', language: 'en', materials: ['plan'], sources: [] }, draft);
    expect(course.shape).toMatchObject({ minutesPerLesson: 100, sessions });
  });
});
