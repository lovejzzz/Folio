import { orderedLessons, type Course } from '@folio/core';
import { describe, expect, it } from 'vitest';
import { checklistLines, lessonChecklist } from '../src/checklist';
import { smallCourse } from './fake';

describe('what a teacher is told was checked, and what is theirs to look at', () => {
  it('is made from what the lesson holds: facts, a line each, and nothing when there is nothing to say', () => {
    const course = smallCourse();
    const lesson = orderedLessons(course)[0]!;
    expect(lessonChecklist(course, lesson)).toEqual({ checked: [], look: [] });
    const base = { lessonId: lesson.id, objectiveIds: [], sourceRefs: [], origin: 'ai' as const, edited: false };
    const q = (id: string, more: object) => ({ ...base, id, kind: 'question' as const, format: 'short' as const, prompt: 'Find the mean of 3, 4, 5 and 8.', choices: [], correct: null, answer: '5', explanation: '20 / 4 = 5', flags: [], ...more });
    const sheet = (id: string, title: string, key: string, keyChecked?: 'held' | 'fixed') => ({ id, title, kind: 'worksheet' as const, usedIn: 'Practice', copies: '', blocks: [], key, supports: false, ...(keyChecked ? { keyChecked } : {}) });
    const full: Course = {
      ...course,
      brief: `${course.brief} Textbook: OpenStax Statistics, chapter 2.`,
      tasks: { t_1: q('t_1', { checked: true }), t_2: q('t_2', {}), t_3: q('t_3', { flags: [{ code: 'duplicateChoices' }] }) } as never,
      lessons: { ...course.lessons, [lesson.id]: { ...lesson, taskIds: ['t_1', 't_2', 't_3'], readings: ['OpenStax Statistics, chapter 2', 'Read ch. 3 (to confirm); then, sections 2.1–2.5 (to confirm)', 'See OpenStax Statistics, ch. 3 (to confirm)', 'Read pp. 40–44 (to confirm)'], handouts: [sheet('x_1', 'Secants', '1.05171, 1.00502, 1.00050, 0.99950', 'fixed'), sheet('x_2', 'Spread', 'SD 2.16; variance 4.67; range 5; IQR 3'), sheet('x_3', 'Reflection', 'Accept any reasoned answer.')] } },
    };
    const lines = checklistLines(lessonChecklist(full, full.lessons[lesson.id]!));
    expect(lines.checked).toEqual(['1 answer in the quiz and graded work worked out by a program, as written.', '1 sheet key worked out by a program; corrected in “Secants”.']);
    expect(lines.look).toEqual(['1 note from Folio on this lesson, at the top of the part each is about.', 'Answers no program worked out: “Find the mean of 3, 4, 5 and 8.”.', 'Sheet keys no program worked out: “Spread”.', 'Not in your brief or files, to confirm: OpenStax Statistics, ch. 3; sections 2.1–2.5; pp. 40–44.']);
  });
});
