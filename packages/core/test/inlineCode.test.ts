import { describe, expect, it } from 'vitest';
import { hasCode, hasMarks, plainText, storedOffset, textRuns } from '../src/inlineCode';

describe('inline code', () => {
  const text = 'Run `lm(log(wage) ~ educ)` then `summary()`.';

  it('splits text into code and plain runs', () => {
    expect(textRuns(text)).toEqual([
      { text: 'Run ', code: false },
      { text: 'lm(log(wage) ~ educ)', code: true },
      { text: ' then ', code: false },
      { text: 'summary()', code: true },
      { text: '.', code: false },
    ]);
    expect(hasCode(text) && textRuns(text).length).toBe(5);
    expect(textRuns('plain')).toEqual([{ text: 'plain', code: false }]);
    expect(textRuns('')).toEqual([{ text: '', code: false }]);
  });

  it('leaves a lone backtick and an empty pair alone', () => {
    expect(hasCode('it`s')).toBe(false);
    expect(hasCode('``')).toBe(false);
    expect(hasCode(text)).toBe(true);
    expect(plainText('a `b` c')).toBe('a b c');
  });

  it('maps a caret on the page to the stored text', () => {
    const shown = plainText(text);
    for (const letter of ['R', 'l', '~', 't', 's', '.']) {
      const i = shown.indexOf(letter);
      expect(text[storedOffset(text, i)]).toBe(letter);
    }
    expect(storedOffset(text, shown.length)).toBe(text.length);
  });
});

describe('sub- and superscripts', () => {
  it('sets a named subscript and a braced one, and leaves snake_case alone', () => {
    expect(textRuns('se(β̂_educ) is small')).toEqual([
      { text: 'se(', code: false, math: true },
      { text: 'β', code: false, math: true, accent: '\u0302', tall: true },
      { text: 'educ', code: false, script: 'sub', math: true },
      { text: ') is small', code: false },
    ]);
    expect(textRuns('t ~ t_{n−k−1}')).toEqual([
      { text: 't ~ t', code: false },
      { text: 'n−k−1', code: false, script: 'sub' },
    ]);
    expect(textRuns('100 × (e^{0.092} − 1) and R^2.')).toEqual([
      { text: '100 × (e', code: false },
      { text: '0.092', code: false, script: 'sup' },
      { text: ' − 1) and R', code: false },
      { text: '2', code: false, script: 'sup' },
      { text: '.', code: false },
    ]);
    expect(textRuns('100(e^β̂₁ − 1)')[1]).toEqual({ text: 'β̂₁', code: false, script: 'sup' });
    for (const plain of ['log_wage and problem_set_2', 'a lone _ here', 'wage1$educ']) expect(textRuns(plain)).toEqual([{ text: plain, code: false }]);
  });

  it('leaves marks inside code alone', () => {
    expect(textRuns('Run `x_new <- x^2` then x_i')).toEqual([
      { text: 'Run ', code: false },
      { text: 'x_new <- x^2', code: true },
      { text: ' then x', code: false },
      { text: 'i', code: false, script: 'sub' },
    ]);
  });

  it('maps a caret past a subscript to the stored text', () => {
    const text = 'se(β̂_educ) = 0.007';
    const shown = textRuns(text).map((r) => r.text).join('');
    expect(shown).toBe('se(βeduc) = 0.007');
    for (const letter of ['e', ')', '7']) {
      const i = shown.lastIndexOf(letter);
      expect(text[storedOffset(text, i)]).toBe(letter);
    }
    expect(hasMarks(text)).toBe(true);
    expect(hasMarks('plain text')).toBe(false);
  });
});

describe('Unicode sub- and superscripts and maths words', () => {
  it('draws x₁, xᵢ, R² and X⁻¹ as sub- and superscripts of plain letters', () => {
    expect(textRuns('x₁ and xᵢ, R² and X⁻¹')).toEqual([
      { text: 'x', code: false },
      { text: '1', code: false, script: 'sub' },
      { text: ' and x', code: false },
      { text: 'i', code: false, script: 'sub' },
      { text: ', R', code: false },
      { text: '2', code: false, script: 'sup' },
      { text: ' and X', code: false },
      { text: '−1', code: false, script: 'sup' },
    ]);
  });

  it('sets a word with Greek or a hat in the maths face, its script with it', () => {
    expect(textRuns('so β̂₁ = 1.9 and x̄ = 2.5')).toEqual([
      { text: 'so ', code: false },
      { text: 'β', code: false, math: true, accent: '\u0302', tall: true },
      { text: '1', code: false, script: 'sub', math: true },
      { text: ' = 1.9 and ', code: false },
      { text: 'x̄', code: false, math: true },
      { text: ' = 2.5', code: false },
    ]);
  });

  it('keeps a caret on its letter across Unicode scripts', () => {
    const text = 'Σ(xᵢ − x̄)² = 5';
    const shown = textRuns(text).map((r) => r.text).join('');
    for (const letter of ['−', '5', '=']) expect(text[storedOffset(text, shown.indexOf(letter))]).toBe(letter);
    expect(hasMarks('x₁')).toBe(true);
  });
});
