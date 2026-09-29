import { describe, expect, it } from 'vitest';
import { finishedRows, type LiveRow } from './live';

const row = (key: string, ended: number, fixes: string[] = []): LiveRow => ({ key, lessonId: key, kind: 'plan', stage: 'done', fixes, notes: 0, checked: true, started: 0, ended });

describe('the card’s finished rows', () => {
  it('are the latest ones', () => {
    const rows = Object.fromEntries([row('a', 1), row('b', 2), row('c', 3)].map((r) => [r.key, r]));
    expect(finishedRows(rows, 2).map((r) => r.key)).toEqual(['c', 'b']);
  });

  it('keep the last plan the check corrected, below the latest one', () => {
    const rows = Object.fromEntries([row('plan', 1, ['Ice water fogs in a minute or two.']), row('b', 2), row('c', 3)].map((r) => [r.key, r]));
    expect(finishedRows(rows, 2).map((r) => r.key)).toEqual(['c', 'plan']);
  });
});
