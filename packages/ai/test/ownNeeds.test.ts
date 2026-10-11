import { cellState, cmd, CourseStore, lessonReady, MATERIAL_KINDS, orderedLessons, ownEverywhere, ownNeeds, parseCourse, readyLines, type Course, type MaterialKind } from '@folio/core';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ownToWrite } from '../src/build';

/**
 * A deck Folio really wrote alone (sociology, two lessons; readiness/batch4-partial/slides-only-2, kept in
 * test/fixtures/partial-slides-only.json): its slides say "the quiz is the teacher's own paper", the map called both
 * decks ready, and an export said nothing.
 */
const real = parseCourse(JSON.parse(readFileSync(new URL('./fixtures/partial-slides-only.json', import.meta.url), 'utf8')) as unknown);
const [first, second, third] = orderedLessons(real);
const withAll = (kinds: MaterialKind[]): Course => ({ ...real, materials: Object.fromEntries(MATERIAL_KINDS.map((k) => [k, { enabled: kinds.includes(k), options: {} }])) as Course['materials'] });

describe('graded work a course leans on and Folio did not write', () => {
  it('is in the real deck: a slide says the quiz is the teacher\'s own', () => {
    expect(real.materials.slides.enabled && !real.materials.assignments.enabled && !real.materials.rubrics.enabled).toBe(true);
    expect(JSON.stringify(second!.slides)).toContain('teacher’s own paper');
  });

  it('is named lesson by lesson, by the pieces the lessons set, and not taken for in hand', () => {
    const needs = ownNeeds(real, [first!.id, second!.id]);
    expect(needs.map((n) => `${n.lesson}:${n.piece}:${n.confirmed}`)).toEqual(['1:Participation in discussion:false', '2:Reading quizzes:false', '2:Participation in discussion:false']);
  });

  it('marks the written deck on the map as needing a look, where it was called ready', () => {
    expect(cellState(real, first!, 'slides')).toBe('attention');
    expect(cellState(real, second!, 'slides')).toBe('attention');
  });

  it('is in the lesson\'s list of what to have ready, and in what the teacher is told before a build', () => {
    expect(readyLines(lessonReady(real, second!))).toContain('Yours to bring, not written by Folio: the paper, the instructions and the scoring for “Reading quizzes”; “Participation in discussion”.');
    expect(ownToWrite(real, [second!.id])).toEqual([{ lesson: 2, pieces: ['Reading quizzes', 'Participation in discussion'] }]);
  });

  const said = (c: Course, lessonId: string, pieces: string[]) => {
    const store = new CourseStore(c);
    store.apply([cmd('lesson.own', { lessonId, pieces })], { label: { key: 't' }, source: 'teacher' });
    return store.getState();
  };

  it('is settled by the teacher saying they have it for that lesson, and can be taken back', () => {
    const have = said(real, second!.id, ['Reading quizzes', 'Participation in discussion']);
    expect(ownNeeds(have, [second!.id]).every((n) => n.confirmed)).toBe(true);
    expect(cellState(have, have.lessons[second!.id]!, 'slides')).toBe('ready');
    expect(ownToWrite(have, [first!.id, second!.id]).map((x) => x.lesson)).toEqual([1]);
    // Still listed to bring: having it is not the same as it being in the files.
    expect(readyLines(lessonReady(have, have.lessons[second!.id]!)).join(' ')).toContain('Yours to bring');
    const back = said(have, second!.id, ['Participation in discussion']);
    expect(cellState(back, back.lessons[second!.id]!, 'slides')).toBe('attention');
  });

  it('is of that lesson only: the next lesson\'s quiz paper is not in hand because this one\'s is (as it was found in the browser)', () => {
    const have = said(real, second!.id, ['Reading quizzes', 'Participation in discussion']);
    const next = ownNeeds(have, [third!.id]);
    expect(next.length).toBeGreaterThan(0);
    expect(next.every((n) => !n.confirmed)).toBe(true);
    expect(cellState(have, have.lessons[first!.id]!, 'slides')).toBe('attention');
  });

  it('reaches every lesson that uses a piece only when the teacher says so in as many words', () => {
    const all = ownEverywhere(real, ['Participation in discussion']);
    expect(all.length).toBeGreaterThan(2);
    const store = new CourseStore(real);
    store.apply(all.map((x) => cmd('lesson.own', x)), { label: { key: 't' }, source: 'teacher' });
    const have = store.getState();
    expect(ownNeeds(have).filter((n) => n.piece === 'Participation in discussion').every((n) => n.confirmed)).toBe(true);
    // The quiz papers were not spoken of.
    expect(ownNeeds(have).filter((n) => n.piece === 'Reading quizzes').some((n) => n.confirmed)).toBe(false);
  });

  it('lapses when the lesson\'s work changes, and when the piece\'s terms change', () => {
    const have = said(real, second!.id, ['Reading quizzes', 'Participation in discussion']);
    const store = new CourseStore(have);
    store.apply([cmd('course.update', { grading: have.grading.map((g) => (g.item === 'Reading quizzes' ? { ...g, weight: g.weight + 5 } : g)) })], { label: { key: 't' }, source: 'teacher' });
    expect(ownNeeds(store.getState(), [second!.id]).map((n) => `${n.piece}:${n.confirmed}`)).toEqual(['Reading quizzes:false', 'Participation in discussion:true']);
    store.apply([cmd('lesson.homework', { lessonId: second!.id, homework: { kind: 'assignment', toward: 'Participation in discussion' } })], { label: { key: 't' }, source: 'teacher' });
    expect(ownNeeds(store.getState(), [second!.id]).every((n) => !n.confirmed)).toBe(true);
  });

  it('is nothing where graded work is written, or where a lesson sets none', () => {
    expect(ownNeeds(withAll(['slides', 'assignments']))).toEqual([]);
    expect(ownNeeds(withAll(['slides', 'rubrics']))).toEqual([]);
    expect(cellState(withAll(['slides', 'assignments']), first!, 'slides')).not.toBe('attention');
  });
});
