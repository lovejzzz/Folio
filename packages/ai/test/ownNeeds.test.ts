import { cellState, gradingWithOwn, lessonReady, MATERIAL_KINDS, orderedLessons, ownNeeds, parseCourse, readyLines, type Course, type MaterialKind } from '@folio/core';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ownToWrite } from '../src/build';

/**
 * A deck Folio really wrote alone (sociology, two lessons; readiness/batch4-partial/slides-only-2, kept in
 * test/fixtures/partial-slides-only.json): its slides say "the quiz is the teacher's own paper", the map called both
 * decks ready, and an export said nothing.
 */
const real = parseCourse(JSON.parse(readFileSync(new URL('./fixtures/partial-slides-only.json', import.meta.url), 'utf8')) as unknown);
const [first, second] = orderedLessons(real);
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

  it('is settled only by the teacher saying they have it, and can be taken back', () => {
    const have: Course = { ...real, grading: gradingWithOwn(real, ['Reading quizzes', 'Participation in discussion'], true) };
    expect(ownNeeds(have, [second!.id]).every((n) => n.confirmed)).toBe(true);
    expect(cellState(have, second!, 'slides')).toBe('ready');
    expect(ownToWrite(have, [first!.id, second!.id])).toEqual([]);
    // Still listed to bring: having it is not the same as it being in the files.
    expect(readyLines(lessonReady(have, second!)).join(' ')).toContain('Yours to bring');
    const back: Course = { ...have, grading: gradingWithOwn(have, ['Reading quizzes'], false) };
    expect(cellState(back, second!, 'slides')).toBe('attention');
    // One piece confirmed is not the other.
    expect(cellState({ ...real, grading: gradingWithOwn(real, ['Reading quizzes'], true) }, second!, 'slides')).toBe('attention');
  });

  it('is nothing where graded work is written, or where a lesson sets none', () => {
    expect(ownNeeds(withAll(['slides', 'assignments']))).toEqual([]);
    expect(ownNeeds(withAll(['slides', 'rubrics']))).toEqual([]);
    expect(cellState(withAll(['slides', 'assignments']), first!, 'slides')).not.toBe('attention');
  });
});
