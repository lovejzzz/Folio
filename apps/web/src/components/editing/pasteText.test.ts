import { describe, expect, it } from 'vitest';
import { normalisePaste } from './pasteText';

describe('normalisePaste', () => {
  it('keeps paragraphs in a multi-line field, without the trailing line break', () => {
    expect(normalisePaste('First line\n\nSecond line\n', true)).toBe('First line\n\nSecond line');
    expect(normalisePaste('First line\n\nSecond line\n\n\n', true)).toBe('First line\n\nSecond line');
  });

  it('turns Windows and old Mac line endings into \\n', () => {
    expect(normalisePaste('One\r\n\r\nTwo\r\n', true)).toBe('One\n\nTwo');
    expect(normalisePaste('One\rTwo', true)).toBe('One\nTwo');
  });

  it('drops trailing spaces and no-break spaces', () => {
    expect(normalisePaste('One  \nTwo\u00a0words\t\n', true)).toBe('One\nTwo words');
  });

  it('joins lines with spaces in a single-line field', () => {
    expect(normalisePaste('A title\r\n\r\nthat wrapped\n', false)).toBe('A title that wrapped');
    expect(normalisePaste('  padded  ', false)).toBe('padded');
  });

  it('leaves ordinary text alone', () => {
    expect(normalisePaste('Mean, median and mode', false)).toBe('Mean, median and mode');
    expect(normalisePaste('  indented code', true)).toBe('  indented code');
  });
});
