import type { HistoryEntry } from '@folio/core';
import { describe, expect, it } from 'vitest';
import { en } from '../../i18n/en';
import { historyLabel } from './ChangesDrawer';

const entry = (key: string, values?: Record<string, string | number>) => ({ id: 'h1', label: { key, values } }) as unknown as HistoryEntry;

describe('a line of the history', () => {
  it('names the part a build wrote', () => {
    expect(historyLabel(entry('built', { kind: 'slides', n: 2 }), en)).toBe('Wrote the slides for lesson 2');
  });

  it('names the facts settled for a lesson written without a plan, which are no material', () => {
    // It read "Wrote the undefined for lesson 1".
    expect(historyLabel(entry('built', { kind: 'facts', n: 1 }), en)).toBe('Wrote the facts for lesson 1');
  });

  it('never shows a part or a lesson it cannot name', () => {
    for (const values of [undefined, { kind: 'something-new', n: 1 }, { kind: 'slides' }]) expect(historyLabel(entry('built', values as never), en)).not.toContain('undefined');
  });
});
