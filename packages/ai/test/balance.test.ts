import type { Question } from '@folio/core';
import { describe, expect, it } from 'vitest';
import { balanceChoices, stripTrueFalsePrefix } from '../src/balance';

let n = 0;
function q(choices: string[], correct = 0, extra: Partial<Question> = {}): Question {
  const ids = choices.map(() => `c${n++}`);
  return {
    id: `t${n++}`, kind: 'question', lessonId: 'l', objectiveIds: [], sourceRefs: [], origin: 'ai', edited: false, flags: [],
    format: 'choice', prompt: 'Which?', choices: choices.map((text, i) => ({ id: ids[i]!, text })), correct: ids[correct]!,
    answer: '', explanation: 'Because.', difficulty: 2, ...extra,
  };
}
const position = (x: Question) => x.choices.findIndex((c) => c.id === x.correct);
const seeded = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

describe('balancing answer positions', () => {
  it('spreads correct answers that all came back first over every position', () => {
    const quiz = Array.from({ length: 8 }, () => q(['Right', 'Wrong one', 'Wrong two', 'Wrong three']));
    const out = balanceChoices(quiz, seeded(7));
    expect(out.map(position).sort()).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    for (const [i, x] of out.entries()) {
      expect(x.choices.find((c) => c.id === x.correct)?.text).toBe('Right');
      // The wrong answers keep their order.
      expect(x.choices.filter((c) => c.id !== x.correct).map((c) => c.text)).toEqual(['Wrong one', 'Wrong two', 'Wrong three']);
      expect(x.id).toBe(quiz[i]!.id);
    }
  });

  it('keeps number choices in numeric order', () => {
    const out = balanceChoices([q(['7', '5', '9', '6.5'], 0)], seeded(3));
    expect(out[0]!.choices.map((c) => c.text)).toEqual(['5', '6.5', '7', '9']);
    expect(out[0]!.choices[position(out[0]!)]!.text).toBe('7');
  });

  it('leaves "none of the above" last and letter references alone', () => {
    const none = q(['Right', 'Wrong', 'None of the above'], 0);
    const lettered = q(['Right', 'Wrong', 'Other'], 0, { explanation: 'Option B confuses mass with weight.' });
    const out = balanceChoices([none, lettered], () => 0.99);
    expect(out[0]!.choices.map((c) => c.text)).toEqual(['Right', 'Wrong', 'None of the above']);
    expect(out[1]!.choices.map((c) => c.text)).toEqual(['Right', 'Wrong', 'Other']);
  });

  it('leaves true/false and ungraded questions as they are', () => {
    const tf = q(['True', 'False'], 1, { format: 'truefalse' });
    const short = q([], 0, { format: 'short', correct: null, choices: [] });
    expect(balanceChoices([tf, short])).toEqual([tf, short]);
  });
});

describe('true/false prompts', () => {
  it('drops a redundant "True or false" lead-in', () => {
    expect(stripTrueFalsePrefix('True or false: plants take in oxygen at night.')).toBe('Plants take in oxygen at night.');
    expect(stripTrueFalsePrefix('True or False? The median is always a data value.')).toBe('The median is always a data value.');
    expect(stripTrueFalsePrefix('判断：《望岳》写于安史之乱中。')).toBe('《望岳》写于安史之乱中。');
    expect(stripTrueFalsePrefix('Truly, this stays.')).toBe('Truly, this stays.');
  });
});
