import { readFileSync } from 'node:fs';
import { orderedLessons, parseCourse, type Course, type Lesson } from '@folio/core';
import { describe, expect, it } from 'vitest';
import { askedLengths, lengthClash, otherLength, planOtherLength } from '../src/askedLength';

/**
 * A lesson Folio really wrote (the reading before 0.0.39), kept as it was: the plan and its slide ask a paragraph "in about
 * six sentences", the piece and its rubric "of about three".
 */
const course = parseCourse(JSON.parse(readFileSync(new URL('./fixtures/r39-english-composition.json', import.meta.url), 'utf8')) as unknown);
const lesson = orderedLessons(course)[0]!;
const writing = lesson.also.find((p) => p.toward === 'Short in-class writing')!;
/** The lesson as the writer of one of its pieces is given it. */
const forPiece: Lesson = { ...lesson, homework: writing, also: [] };
const piece = Object.values(course.tasks).find((t) => t.kind === 'assignment' && t.title.startsWith('Short in-class writing'))!;
const rubric = course.rubrics[(piece as { rubricId: string }).rubricId]!;
const draft = (prompt: string, steps: string[], descriptors: string[] = []) => ({ prompt, steps, rubric: { criteria: [{ descriptors }] } });
const asWritten = piece.kind === 'assignment' ? draft(piece.prompt, piece.steps, rubric.criteria.flatMap((c) => Object.values(c.descriptors))) : draft('', []);

describe('lengths read from a text', () => {
  it('reads figures, words for numbers and ranges', () => {
    expect(askedLengths('Write alone for six minutes, in about six sentences.')).toEqual([{ low: 6, high: 6, unit: 'sentence' }]);
    expect(askedLengths('Write five or six sentences.')).toEqual([{ low: 5, high: 6, unit: 'sentence' }]);
    expect(askedLengths('A response of 150 to 200 words, on one page.')).toEqual([{ low: 150, high: 200, unit: 'word' }, { low: 1, high: 1, unit: 'page' }]);
    expect(askedLengths('Work for six minutes with a partner.')).toEqual([]);
  });

  it('finds a clash only where one length is said and the other cannot meet it', () => {
    expect(lengthClash('in about six sentences', 'about three sentences')).not.toBeNull();
    expect(lengthClash('in about six sentences', 'five or six sentences')).toBeNull();
    expect(lengthClash('in about six sentences', 'one paragraph')).toBeNull();
    // Two lengths in one segment are two things asked: neither is the piece's for certain.
    expect(lengthClash('one sentence each, then a paragraph of six sentences', 'three sentences')).toBeNull();
  });
});

describe('a piece written in class and the plan that runs it', () => {
  it('is asked once more where it says another length, and the teacher is told if it stays', () => {
    const [problem] = otherLength(asWritten, course, forPiece);
    expect(JSON.stringify(problem!.flag)).toContain('students write 6 sentences');
    expect(JSON.stringify(problem!.flag)).toContain('says 3 sentences');
    expect(problem!.left!.code).toBe('reviewNote');
  });

  it('is let be where a part of it has a length of its own beside the plan\'s', () => {
    const parts = draft('Work alone for six minutes. Write about six sentences.', ['Name the moment in one sentence.']);
    expect(otherLength(parts, course, forPiece)).toEqual([]);
  });

  it('is let be where it says the plan\'s length, or none', () => {
    expect(otherLength(draft('Write about six sentences.', ['Name the moment.']), course, forPiece)).toEqual([]);
    expect(otherLength(draft('Write a short paragraph.', ['Name the moment.']), course, forPiece)).toEqual([]);
  });

  it('is not held to a plan that is not there, nor a piece of the term to one meeting', () => {
    expect(otherLength(asWritten, course, { ...forPiece, segments: [] })).toEqual([]);
    expect(otherLength(asWritten, course, { ...forPiece, homework: { ...writing, standing: true } })).toEqual([]);
  });
});

describe('a plan written again where the piece already stands', () => {
  const segments = lesson.segments.map((s) => ({ title: s.title, description: s.description, minutes: s.minutes }));

  it('is asked to say the piece\'s length, and the piece is not touched', () => {
    const before = JSON.stringify(course.tasks);
    const [problem] = planOtherLength(segments, course, lesson);
    expect(JSON.stringify(problem!.flag)).toContain('asks for 3 sentences; the plan says 6 sentences');
    expect(JSON.stringify(course.tasks)).toBe(before);
  });

  it('is let be where it agrees, and where no piece is written yet', () => {
    const agreed = segments.map((s) => ({ ...s, description: s.description.replace('about six sentences', 'about three sentences') }));
    expect(planOtherLength(agreed, course, lesson)).toEqual([]);
    const bare: Course = { ...course, tasks: {} };
    expect(planOtherLength(segments, bare, { ...lesson, taskIds: [] })).toEqual([]);
  });
});
