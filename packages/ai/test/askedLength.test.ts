import { readFileSync } from 'node:fs';
import { orderedLessons, parseCourse, type Course, type Lesson } from '@folio/core';
import { describe, expect, it } from 'vitest';
import { askedLengths, otherLength, pieceClash, planOtherLength } from '../src/askedLength';

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
/** A draft whose rubric has two levels, the higher first: `top` is what the higher says, `lower` the other. */
const draft = (prompt: string, steps: string[], top: string[] = [], lower = 'Thin.') => ({ prompt, steps, rubric: { levels: [{ points: 4 }, { points: 1 }], criteria: top.map((t) => ({ descriptors: [t, lower] })) } });
const best = [...rubric.levels].sort((a, b) => b.points - a.points)[0]!;
const asWritten = piece.kind === 'assignment' ? draft(piece.prompt, piece.steps, rubric.criteria.map((c) => c.descriptors[best.id] ?? '')) : draft('', []);

describe('lengths read from a text', () => {
  it('reads figures, words for numbers and ranges', () => {
    expect(askedLengths('Write alone for six minutes, in about six sentences.')).toEqual([{ low: 6, high: 6, unit: 'sentence' }]);
    expect(askedLengths('Write five or six sentences.')).toEqual([{ low: 5, high: 6, unit: 'sentence' }]);
    expect(askedLengths('A response of 150 to 200 words, on one page.')).toEqual([{ low: 150, high: 200, unit: 'word' }, { low: 1, high: 1, unit: 'page' }]);
    expect(askedLengths('Work for six minutes with a partner.')).toEqual([]);
  });

  it('reads a number with a comma whole, and a few words as no length', () => {
    expect(askedLengths('A report of about 3,000 words.')).toEqual([{ low: 3000, high: 3000, unit: 'word' }]);
    expect(askedLengths('Underline one word in your partner\'s sentence.')).toEqual([]);
  });
});

describe('the task and its rubric, each compared on its own', () => {
  const parts = (prompt: string, steps: string[] = [], top: string[] = []) => ({ prompt, steps, top });

  it('names a task that asks another length than the plan, whatever its rubric says', () => {
    // A rubric with the plan's figure answered for the task when the two were read as one text.
    expect(pieceClash('Write six sentences.', parts('Write three sentences.', [], ['Six sentences earn full credit.']))).toMatchObject({ where: 'task', by: 'plan', held: { high: 6 }, said: { high: 3 } });
    expect(pieceClash('in about six sentences', parts('Write about three sentences.', ['Use about three sentences.']))).toMatchObject({ where: 'task' });
  });

  it('names a rubric that scores another length than the task asks, with or without a plan', () => {
    expect(pieceClash('', parts('Write three sentences.', [], ['Develops the point.', 'Six sentences earn full credit.']))).toMatchObject({ where: 'rubric', by: 'task', held: { high: 3 }, said: { high: 6 } });
    expect(pieceClash('Write three sentences.', parts('Write three sentences.', [], ['Six sentences earn full credit.']))).toMatchObject({ where: 'rubric', by: 'plan' });
  });

  it('lets a step have a length of its own', () => {
    expect(pieceClash('in about six sentences', parts('Write about six sentences.', ['Name the moment in one sentence.', 'Say why in two sentences.']))).toBeNull();
    // Steps beside a plan's other activity are parts, and are not added up: six real pieces were named so.
    expect(pieceClash('Each student writes one sentence on the choice.', parts('Complete the worksheet.', ['Write two sentences on shape.', 'Explain its sign in one sentence.']))).toBeNull();
  });

  it('lets be what agrees, a range that holds the figure, and a plan that says two lengths', () => {
    expect(pieceClash('in about six sentences', parts('Write five or six sentences.', [], ['Five or six clear sentences.']))).toBeNull();
    expect(pieceClash('one sentence each, then a paragraph of six sentences', parts('Write three sentences.'))).toBeNull();
    expect(pieceClash('in about six sentences', parts('Write one paragraph.'))).toBeNull();
  });
});

describe('a piece written in class and the plan that runs it', () => {
  it('is asked once more where it says another length, and the teacher is told if it stays', () => {
    const [problem] = otherLength(asWritten, course, forPiece);
    expect(JSON.stringify(problem!.flag)).toContain('students write 6 sentences');
    expect(JSON.stringify(problem!.flag)).toContain('the piece asks for 3 sentences');
    expect(problem!.left!.code).toBe('reviewNote');
  });

  it('is asked again for its rubric alone, where the task says the plan\'s length', () => {
    const fixed = draft('Work alone for six minutes. Write about six sentences.', ['Name the moment in one sentence.'], ['Presents a paragraph of about three sentences.']);
    expect(JSON.stringify(otherLength(fixed, course, forPiece)[0]!.flag)).toContain('"path":"rubric"');
    // A lower level may describe less: only the top level is what full marks ask.
    expect(otherLength(draft('Write about six sentences.', [], ['Six clear sentences.'], 'One or two sentences.'), course, forPiece)).toEqual([]);
  });

  it('is let be where it says the plan\'s length, or none', () => {
    expect(otherLength(draft('Write about six sentences.', ['Name the moment.']), course, forPiece)).toEqual([]);
    expect(otherLength(draft('Write a short paragraph.', ['Name the moment.']), course, forPiece)).toEqual([]);
  });

  it('is not held to a plan that is not there, nor a piece of the term to one meeting', () => {
    const agreeing = draft('Write about three sentences.', [], ['A paragraph of about three sentences.']);
    expect(otherLength(agreeing, course, { ...forPiece, segments: [] })).toEqual([]);
    expect(otherLength(agreeing, course, { ...forPiece, homework: { ...writing, standing: true } })).toEqual([]);
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
