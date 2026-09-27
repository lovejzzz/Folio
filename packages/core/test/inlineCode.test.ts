import { describe, expect, it } from 'vitest';
import { hasCode, plainText, storedOffset, textRuns } from '../src/inlineCode';

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
