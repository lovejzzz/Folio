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
      { text: 'se(β̂', code: false },
      { text: 'educ', code: false, script: 'sub' },
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
    const shown = 'se(β̂educ) = 0.007';
    for (const letter of ['e', ')', '7']) {
      const i = shown.lastIndexOf(letter);
      expect(text[storedOffset(text, i)]).toBe(letter);
    }
    expect(hasMarks(text)).toBe(true);
    expect(hasMarks('plain text')).toBe(false);
  });
});
