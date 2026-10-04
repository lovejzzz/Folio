import 'fake-indexeddb/auto';
import { createCourse, createSource, type Course } from '@folio/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { versionOf } from './db';
import { takeJournal, writeJournal } from './journal';

const book = 'A chapter of the textbook. '.repeat(40_000);

function withSources(course: Course, ...sources: ReturnType<typeof createSource>[]): Course {
  return { ...course, sources: Object.fromEntries(sources.map((s) => [s.id, s])), sourceOrder: sources.map((s) => s.id) };
}

describe('the copy of unsaved work kept as the page closes', () => {
  beforeEach(() => {
    const items = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => items.get(k) ?? null, setItem: (k: string, v: string) => void items.set(k, v), removeItem: (k: string) => void items.delete(k), items });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('leaves out the text of sources unchanged since the save, and has it back from the saved copy', () => {
    const saved = withSources(createCourse({ title: 'Ecology' }), createSource('Textbook', book, 'file'));
    const added = createSource('Notes', 'Bring the field guides.', 'text');
    const edited: Course = { ...saved, title: 'Ecology II', revision: saved.revision + 1, sources: { ...saved.sources, [added.id]: added }, sourceOrder: [...saved.sourceOrder, added.id] };
    writeJournal(edited, versionOf(saved), [], saved.sources);
    const stored = [...(localStorage as unknown as { items: Map<string, string> }).items.values()][0]!;
    expect(stored.length).toBeLessThan(10_000);
    expect(stored).toContain('Bring the field guides.');
    const back = takeJournal(saved)!;
    expect(back.course.title).toBe('Ecology II');
    expect(back.course.sources).toEqual(edited.sources);
    expect(back.course.sourceOrder).toEqual(edited.sourceOrder);
  });

  it('is kept when the save that was on its way as the page left has landed', () => {
    const saved = createCourse({ title: 'Ecology' });
    const landing: Course = { ...saved, title: 'Ecology II', revision: saved.revision + 1 };
    const typed: Course = { ...landing, title: 'Ecology III', revision: landing.revision + 1 };
    // The tab had saved `saved`, was writing `landing`, and held `typed` when it closed.
    writeJournal(typed, versionOf(saved), [], {}, versionOf(landing));
    expect(takeJournal(landing)?.course.title).toBe('Ecology III');
    // And when that save never landed, the copy still fits the version the tab had saved.
    writeJournal(typed, versionOf(saved), [], {}, versionOf(landing));
    expect(takeJournal(saved)?.course.title).toBe('Ecology III');
  });

  it('is dropped when it was built on another version than the one saved', () => {
    const saved = createCourse({ title: 'Ecology' });
    writeJournal({ ...saved, title: 'Later' }, 'some other version');
    expect(takeJournal(saved)).toBeNull();
  });
});
