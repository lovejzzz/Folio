import { describe, expect, it } from 'vitest';
import { after, binarySearch, binarySearchProblem, binarySearchTable, describeResult, describeStart, describeStep, sortedForSearch } from '../src/figures/binarySearch';

const LIST = [2, 5, 8, 12, 16, 23, 38, 56, 72, 91];

describe('binary search, the model', () => {
  it('closes in on a value in the middle of a list, a step at a time', () => {
    const m = binarySearch({ values: LIST, target: 23 });
    expect(m.frames.map((f) => [f.lo, f.hi, f.mid, f.value, f.compare])).toEqual([[0, 9, 4, 16, 'greater'], [5, 9, 7, 56, 'less'], [5, 6, 5, 23, 'equal']]);
    expect(m.found).toBe(5);
  });

  it('finds the first and the last', () => {
    expect(binarySearch({ values: LIST, target: 2 }).found).toBe(0);
    expect(binarySearch({ values: LIST, target: 91 }).found).toBe(9);
    expect(binarySearch({ values: [7], target: 7 }).frames).toHaveLength(1);
  });

  it('runs out when the value is not there: below all, above all, between two', () => {
    for (const target of [1, 100, 20]) {
      const m = binarySearch({ values: LIST, target });
      expect(m.found).toBeNull();
      const last = after(m.frames.at(-1)!);
      expect(last.lo).toBeGreaterThan(last.hi);
    }
    expect(binarySearch({ values: LIST, target: 20 }).frames.length).toBeLessThanOrEqual(4);
  });

  it('answers an empty list in no steps', () => {
    const m = binarySearch({ values: [], target: 3 });
    expect([m.frames.length, m.found]).toEqual([0, null]);
    expect(describeStart(m)).toBe('The list is empty, so 3 is not in it: there is nothing to compare.');
    expect(describeResult(m)).toBe('3 is not in the list.');
  });

  it('returns, of a value that stands twice, the one its midpoints reach first, and says so', () => {
    const m = binarySearch({ values: [1, 4, 4, 4, 9], target: 4 });
    expect(m.found).toBe(2);
    expect(describeResult(m)).toContain('which need not be the leftmost');
    // Not the leftmost here: position 2 of [4, 4] is reached before position 1.
    expect(binarySearch({ values: [4, 4], target: 4 }).found).toBe(0);
    expect(binarySearch({ values: [1, 2, 4, 4], target: 4 }).found).toBe(2);
  });

  it('refuses a list that is not sorted, too long, or not of numbers, and sorts only when asked', () => {
    expect(binarySearchProblem({ values: [3, 1, 2], target: 2 })).toBe('unsorted');
    expect(() => binarySearch({ values: [3, 1, 2], target: 2 })).toThrow(/unsorted/);
    // Length is no fault of a search: how many a picture holds is the picture's affair.
    expect(binarySearchProblem({ values: Array.from({ length: 16 }, (_, i) => i), target: 2 })).toBeNull();
    expect(binarySearchProblem({ values: [1, Number.NaN], target: 2 })).toBe('notNumbers');
    expect(binarySearchProblem({ values: [], target: 2 })).toBeNull();
    expect(sortedForSearch([3, 1, 2])).toEqual([1, 2, 3]);
  });

  it('agrees with a plain look through the list, for every list of up to six small numbers and every target', () => {
    const lists: number[][] = [[]];
    for (let n = 1; n <= 6; n++) for (const head of lists.filter((l) => l.length === n - 1)) for (let v = head.at(-1) ?? 0; v <= 3; v++) lists.push([...head, v]);
    let checked = 0;
    for (const values of lists) for (let target = -1; target <= 4; target++) {
      const m = binarySearch({ values, target });
      expect(m.found === null ? values.includes(target) : values[m.found] === target).toBe(m.found !== null);
      expect(m.frames.length).toBeLessThanOrEqual(Math.floor(Math.log2(Math.max(1, values.length))) + 1);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(1000);
  });
});

describe('binary search, said and tabled from the same frames', () => {
  const m = binarySearch({ values: LIST, target: 23 });
  it('says each step in a sentence', () => {
    expect(describeStart(m)).toBe('Searching for 23 in a sorted list of 10 numbers: 2, 5, 8, 12, 16, 23, 38, 56, 72, 91.');
    expect(m.frames.map((f) => describeStep(m, f))).toEqual([
      'Step 1. Positions 1 to 10 are left; the middle is position 5, which holds 16. 23 is greater than 16, so the left part is set aside and positions 6 to 10 are left.',
      'Step 2. Positions 6 to 10 are left; the middle is position 8, which holds 56. 23 is less than 56, so the right part is set aside and positions 6 to 7 are left.',
      'Step 3. Positions 6 to 7 are left; the middle is position 6, which holds 23. 23 is 23: found at position 6.',
    ]);
    expect(describeResult(m)).toBe('23 was found at position 6 after 3 comparisons.');
  });

  it('lays the whole search out as a table that reads without colour', () => {
    expect(binarySearchTable(m)).toEqual({
      columns: ['Step', 'The list at this step', 'Middle', 'Compared', 'What follows'],
      rows: [
        ['1', '2  5  8  12  *16*  23  38  56  72  91', 'position 5: 16', '23 > 16', 'keep positions 6 to 10'],
        ['2', '(2)  (5)  (8)  (12)  (16)  23  38  *56*  72  91', 'position 8: 56', '23 < 56', 'keep positions 6 to 7'],
        ['3', '(2)  (5)  (8)  (12)  (16)  *23*  38  (56)  (72)  (91)', 'position 6: 23', '23 = 23', 'found at position 6'],
      ],
    });
    expect(binarySearchTable(binarySearch({ values: LIST, target: 20 })).rows.at(-1)!.at(-1)).toBe('nothing left: not in the list');
  });
});
