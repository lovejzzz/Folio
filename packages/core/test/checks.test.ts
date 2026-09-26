import { describe, expect, it } from 'vitest';
import { checkMinutes, checkQuestion, createSource, duplicatePrompts, evaluate, passageText } from '../src';

describe('checkQuestion', () => {
  const base = { format: 'choice' as const, prompt: 'Pick one', choices: ['a', 'b', 'c'], answer: 'b' };
  it('passes a well-formed question', () => expect(checkQuestion(base)).toEqual([]));
  it('requires the answer among the choices', () =>
    expect(checkQuestion({ ...base, answer: 'd' })).toContain('The answer is not one of the choices.'));
  it('requires distinct choices', () =>
    expect(checkQuestion({ ...base, choices: ['a', 'A ', 'b'] })).toContain('Two of the choices are the same.'));
  it('recomputes arithmetic answers', () => {
    const q = { format: 'numeric' as const, prompt: 'Mean?', choices: [], answer: '7', expression: '(4+5+9)/3' };
    expect(checkQuestion(q)[0]).toMatch(/does not match the working \(6\)/);
    expect(checkQuestion({ ...q, answer: '6' })).toEqual([]);
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
    expect(checkMinutes([10, 10], 50)[0]).toMatch('20 minutes, not 50');
  });
  it('splits sources into citable passages', () => {
    const s = createSource('Notes', 'First para.\n\nSecond para\nstill second.\n\n\nThird.');
    expect(s.passages).toHaveLength(3);
    expect(passageText(s, s.passages[1]!.id)).toBe('Second para\nstill second.');
  });
});
