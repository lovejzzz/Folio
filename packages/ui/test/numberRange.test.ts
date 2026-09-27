import { describe, expect, it } from 'vitest';
import { fitsRange } from '../src/primitives/numberRange';

describe('fitsRange', () => {
  it('accepts whole numbers in range, and nothing typed', () => {
    expect(fitsRange('1', 1, 600)).toBe(true);
    expect(fitsRange(' 600 ', 1, 600)).toBe(true);
    expect(fitsRange('', 1, 600)).toBe(true);
  });

  it('flags what the field would change: out of range, too precise, not a number', () => {
    expect(fitsRange('99999', 1, 600)).toBe(false);
    expect(fitsRange('0', 1, 600)).toBe(false);
    expect(fitsRange('-5', 1, 600)).toBe(false);
    expect(fitsRange('2.5', 1, 600)).toBe(false);
    expect(fitsRange('abc', 1, 600)).toBe(false);
  });

  it('allows the decimals it is given, with a comma or a point', () => {
    expect(fitsRange('2.5', 0, 100, 1)).toBe(true);
    expect(fitsRange('2,5', 0, 100, 1)).toBe(true);
    expect(fitsRange('2.25', 0, 100, 1)).toBe(false);
  });
});
