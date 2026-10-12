import { describe, expect, it } from 'vitest';
import { forReader } from '../src/review';

describe('an on-screen item as the plan\'s reader is shown it', () => {
  it('says of a demonstration that its name and numbers are Folio\'s terms for a picture, not the lesson\'s code', () => {
    // A reader left "the screen still names selectionSort and supplies a target, but the Python function is selection_sort(values)".
    const said = forReader('Demonstration: selectionSort, values = [29, 10, 14, 37, 13], target = 0');
    expect(said).toContain('Demonstration: selectionSort, values = [29, 10, 14, 37, 13], target = 0');
    expect(said).toContain('a picture Folio draws on the slide');
    expect(said).toContain('are not the lesson\'s code or names');
  });

  it('leaves every other item as it is', () => {
    for (const item of ['`def selection_sort(values):`', 'Table: a | b / 1 | 2', 'Steps: read → sort → check']) expect(forReader(item)).toBe(item);
  });
});
