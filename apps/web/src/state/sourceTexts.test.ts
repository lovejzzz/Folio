import { CourseStore, cmd, createSource } from '@folio/core';
import { sampleCourse } from '@folio/core/sample';
import { describe, expect, it } from 'vitest';
import { MissingTextError, dryCourse, dryEntry, neededTexts, wetCourse, wetEntry } from './sourceTexts';

const book = 'A chapter of the textbook. '.repeat(20_000);

function withFiles() {
  const store = new CourseStore(sampleCourse());
  const a = createSource('Textbook', book, 'file');
  const b = createSource('Notes', 'Bring the field guides.', 'text');
  store.apply([cmd('source.add', { source: a })], { label: { key: 't' }, source: 'teacher' });
  store.apply([cmd('source.add', { source: b })], { label: { key: 't' }, source: 'teacher' });
  store.apply([cmd('source.remove', { sourceId: b.id })], { label: { key: 't' }, source: 'teacher' });
  return { store, a, b };
}

describe('keeping a course’s file texts apart', () => {
  it('takes every text out of a course and puts it back exactly', () => {
    const { store, a } = withFiles();
    const course = store.getState();
    const { body, texts } = dryCourse(course);
    expect(JSON.stringify(body).length).toBeLessThan(JSON.stringify(course).length - book.length + 1000);
    expect(texts[a.id]).toBe(course.sources[a.id]!.text);
    expect(wetCourse(body, texts)).toEqual(course);
  });

  it('dries the files in history, a file added and one removed, and wets them back', () => {
    const { store, a, b } = withFiles();
    for (const entry of store.exportHistory()) {
      const dried = dryEntry(entry);
      expect(JSON.stringify(dried.entry)).not.toContain('A chapter of the textbook');
      expect(JSON.stringify(dried.entry)).not.toContain('Bring the field guides');
      expect(wetEntry(dried.entry, { [a.id]: a.text, [b.id]: b.text })).toEqual(entry);
    }
    const needs = new Set(store.exportHistory().flatMap((e) => [...neededTexts(dryEntry(e).entry)]));
    expect([...needs].sort()).toEqual([a.id, b.id].sort());
  });

  it('refuses to open a course whose text is missing, rather than leave its file empty', () => {
    const { store } = withFiles();
    const { body } = dryCourse(store.getState());
    expect(() => wetCourse(body, {})).toThrow(MissingTextError);
  });

  it('leaves a course without files, or stored before texts were kept apart, as it is', () => {
    const course = sampleCourse();
    const { body, texts } = dryCourse({ ...course, sources: {}, sourceOrder: [] });
    expect(texts).toEqual({});
    expect(wetCourse(course, {})).toBe(course);
    expect(wetCourse(body, {})).toBe(body);
  });
});
