import { describe, expect, it } from 'vitest';
import { en } from './en';
import { zh } from './zh';

function shape(value: unknown): unknown {
  if (typeof value === 'function') return 'fn';
  if (Array.isArray(value)) return 'array';
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v)]));
  return typeof value;
}

describe('message catalogues', () => {
  it('have the same keys and kinds in English and Chinese', () => {
    expect(shape(zh)).toEqual(shape(en));
  });

  it('never use emoji or the words the design rules out', () => {
    const text = JSON.stringify(en);
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(text.toLowerCase()).not.toMatch(/\b(pipeline|artifact|deliverable|compiler|scion|genome|ledger)\b/);
  });

  it('word plural forms correctly', () => {
    expect(en.common.questions(1)).toBe('1 question');
    expect(en.build.readyLook(2)).toBe('Course ready. 2 items need a look.');
    expect(zh.build.progress(3, 6)).toBe('正在生成第 3 课，共 6 课');
  });
});
