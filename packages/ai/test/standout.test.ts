import { answerStandsOut, CourseStore, orderedLessons } from '@folio/core';
import { describe, expect, it } from 'vitest';
import { generateSection } from '../src';
import { fakeInference, quizDraft, smallCourse } from './fake';

const q = (choices: string[], answer = choices[0]!) => ({ format: 'choice' as const, prompt: 'Which?', choices, answer, explanation: '', difficulty: 2, expression: null, objective: 1, sourcePassage: null });

describe('a right answer that gives itself away by length', () => {
  it('is spotted when it is clearly longer than every wrong choice', () => {
    expect(answerStandsOut(q(['Chlorophyll absorbs red and blue light and reflects green light', 'Leaves are green', 'Sunlight is green', 'Water is green']))).toBe(true);
    expect(answerStandsOut(q(['正确答案写得非常详细而且很长很长', '错误一', '错误二', '错误三']))).toBe(true);
  });

  it('is not flagged when the choices are of a similar length', () => {
    expect(answerStandsOut(q(['Carbon dioxide', 'Oxygen gas', 'Nitrogen gas', 'Water vapour']))).toBe(false);
    expect(answerStandsOut(q(['Glucose', 'Oxygen', 'Nitrogen', 'Salt']))).toBe(false);
    expect(answerStandsOut({ ...q(['True', 'False']), format: 'truefalse' })).toBe(false);
  });
});

describe('quizzes', () => {
  const long = { choices: ['Plants make glucose from carbon dioxide and water using light', 'Soil', 'Water', 'Air'], answer: 'Plants make glucose from carbon dioxide and water using light' };
  const even = { choices: ['Glucose from carbon dioxide and water', 'Minerals drawn up from the soil', 'Water taken in by the roots', 'Heat absorbed from sunlight'], answer: 'Glucose from carbon dioxide and water' };

  it('asks once for wrong choices as long as the right one, and takes the fix', async () => {
    const course = smallCourse();
    const lesson = orderedLessons(course)[0]!;
    const inf = fakeInference((_req, call) => quizDraft(3, { 0: call === 0 ? long : even }));
    const result = await generateSection(inf, course, lesson.id, 'quiz');
    expect(inf.calls).toHaveLength(2);
    expect(inf.calls[1]!.prompt).toContain('Item 1: The right answer is noticeably longer');
    const store = new CourseStore(course);
    store.apply(result.commands, { label: { key: 'b' }, source: 'ai' });
    const first = store.getState().tasks[store.getState().lessons[lesson.id]!.taskIds[0]!]!;
    expect(first.kind === 'question' && first.choices.map((c) => c.text).sort()).toEqual([...even.choices].sort());
    expect(first.flags).toEqual([]);
  });

  it('never bothers the teacher with it if the repair leaves it', async () => {
    const course = smallCourse();
    const lesson = orderedLessons(course)[0]!;
    const inf = fakeInference(() => quizDraft(3, { 0: long }));
    const result = await generateSection(inf, course, lesson.id, 'quiz');
    expect(inf.calls).toHaveLength(2);
    expect(result.flagged).toBe(0);
  });
});

describe('true/false balance', () => {
  it('tells the model the order, starting true and false in turn across lessons', async () => {
    const { sectionPrompt } = await import('../src/prompts');
    const course = smallCourse();
    const firsts = orderedLessons(course).map((l) => sectionPrompt(course, l, 'quiz').match(/make the first statement (true|false)/)?.[1]);
    // One true/false question per quiz is common, so the course only balances if lessons alternate.
    expect(firsts).toEqual(firsts.map((_, i) => (i % 2 === 0 ? 'true' : 'false')));
    expect(firsts.length).toBeGreaterThan(1);
  });
});
