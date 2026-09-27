import { describe, expect, it } from 'vitest';
import { checkMinutes, checkQuestion, createSource, describeFlag, duplicatePrompts, evaluate, passageText } from '../src';

describe('checkQuestion', () => {
  const base = { format: 'choice' as const, prompt: 'Pick one', choices: ['a', 'b', 'c'], answer: 'b' };
  it('passes a well-formed question', () => expect(checkQuestion(base)).toEqual([]));
  it('requires the answer among the choices', () =>
    expect(checkQuestion({ ...base, answer: 'd' })).toContainEqual({ code: 'answerNotInChoices' }));
  it('requires distinct choices', () =>
    expect(checkQuestion({ ...base, choices: ['a', 'A ', 'b'] })).toContainEqual({ code: 'duplicateChoices' }));
  it('recomputes arithmetic answers', () => {
    const q = { format: 'numeric' as const, prompt: 'Mean?', choices: [], answer: '7', expression: '(4+5+9)/3' };
    expect(checkQuestion(q)).toEqual([{ code: 'answerMismatch', values: { stated: '7', computed: '6' } }]);
    expect(checkQuestion({ ...q, answer: '6' })).toEqual([]);
  });
});

describe('describeFlag', () => {
  it('words flags in English for the repair prompt, with plurals', () => {
    expect(describeFlag({ code: 'answerNotInChoices' })).toBe('The answer is not one of the choices.');
    expect(describeFlag({ code: 'questionCount', values: { got: 1, want: 5 } })).toBe('There is 1 question instead of 5.');
    expect(describeFlag({ code: 'questionCount', values: { got: 3, want: 5 } })).toBe('There are 3 questions instead of 5.');
    expect(describeFlag({ code: 'note', values: { text: 'As written.' } })).toBe('As written.');
  });
});

describe('evaluate', () => {
  it.each([
    ['1 + 2 * 3', 7],
    ['(1 + 2) * 3', 9],
    ['2 ^ 3 ^ 2', 512],
    ['sqrt(16) / -2', -2],
    ['44 ÷ 7', 44 / 7],
  ])('%s = %d', (expr, value) => expect(evaluate(expr)).toBeCloseTo(value));
  it('returns null for things it cannot read', () => {
    expect(evaluate('2 + x')).toBeNull();
    expect(evaluate('(1 + 2')).toBeNull();
  });
});

describe('other checks', () => {
  it('finds duplicate prompts', () => expect(duplicatePrompts(['A b', 'a  B', 'c'])).toEqual(['a  B']));
  it('checks lesson minutes with some slack', () => {
    expect(checkMinutes([10, 20, 18], 50)).toEqual([]);
    expect(checkMinutes([10, 10], 50)).toEqual([{ code: 'minutesMismatch', values: { total: 20, target: 50 } }]);
  });
  it('splits sources into citable passages', () => {
    const long = (label: string) => `${label} para about how leaves take in carbon dioxide through the stomata on their underside, and release oxygen back into the air around them.`;
    const second = `${long('Second')}\nstill second, on its own line.`;
    const s = createSource('Notes', `${long('First')}\n\n${second}\n\n\n${long('Third')}`);
    expect(s.passages).toHaveLength(3);
    expect(passageText(s, s.passages[1]!.id)).toBe(second);
  });
});
