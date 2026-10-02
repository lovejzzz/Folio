import { describe, expect, it } from 'vitest';
import { fitSize, linesFor, splitToFit } from '../src/fit';

describe('fitting text to a box', () => {
  it('wraps at word boundaries, and counts each line break', () => {
    expect(linesFor('short', 5, 22)).toBe(1);
    expect(linesFor('one\ntwo', 5, 22)).toBe(2);
    expect(linesFor('word '.repeat(200), 5, 22)).toBeGreaterThan(20);
  });

  it('keeps the largest size that fits, and says when none does', () => {
    expect(fitSize(['A short line'], { w: 10, h: 1 }, 32)).toBe(32);
    const long = Array.from({ length: 8 }, () => 'A sentence long enough to wrap onto a second line on a wide slide, if not a third.');
    const size = fitSize(long, { w: 11, h: 4.6, gap: 10 }, 22);
    expect(size).not.toBeNull();
    expect(size!).toBeLessThan(22);
    expect(fitSize(Array.from({ length: 40 }, () => long[0]!), { w: 11, h: 4.6, gap: 10 }, 22)).toBeNull();
  });

  it('splits a list in order, each part fitting', () => {
    const items = Array.from({ length: 30 }, (_, i) => `Item ${i} with a few more words to fill the line a little`);
    const runs = splitToFit(items, { w: 11, h: 4.6, gap: 10 }, 18);
    expect(runs.flat()).toEqual(items);
    expect(runs.length).toBeGreaterThan(1);
    // As even as they can be: no part much shorter than the rest.
    const lengths = runs.map((r) => r.length);
    expect(Math.max(...lengths) - Math.min(...lengths)).toBeLessThanOrEqual(1);
  });
});
