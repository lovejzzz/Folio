import { lessonPieces, type Course, type Lesson } from '@folio/core';
import type { Problem } from './jobs';

/**
 * The length a piece done in class is asked at, held to one figure across the plan that runs it and the piece itself.
 * A reading of sixteen fresh lessons found a paragraph the plan and its slide asked "in about six sentences" and the
 * piece and its rubric "of about three": each was written from the other's words, and nothing compared them.
 */

const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const N = `(\\d{1,4}|${Object.keys(WORDS).join('|')})`;
const UNIT = '(sentence|word|paragraph|page)s?';
const ASKED = new RegExp(`\\b(?:${N}\\s*(?:-|–|to|or)\\s*)?${N}[- ](?:(?:short|full|complete|whole)[- ])?${UNIT}\\b`, 'gi');

export type LengthUnit = 'sentence' | 'word' | 'paragraph' | 'page';
export interface AskedLength { low: number; high: number; unit: LengthUnit }

const number = (text: string) => WORDS[text.toLowerCase()] ?? Number(text);

/** Every length a text asks writing at: "about six sentences", "five or six sentences", "150 to 200 words", "one page". */
export function askedLengths(text: string): AskedLength[] {
  return [...text.matchAll(ASKED)].map((m) => {
    const high = number(m[2]!);
    const low = m[1] ? Math.min(number(m[1]), high) : high;
    return { low, high, unit: m[3]!.toLowerCase() as LengthUnit };
  });
}

export const lengthWords = (a: AskedLength) => `${a.low === a.high ? a.high : `${a.low} to ${a.high}`} ${a.unit}${a.high === 1 ? '' : 's'}`;

/**
 * Where two texts ask the same writing at lengths that cannot both be met. Only where the first says one length in a unit:
 * a segment with "one sentence each" and "a paragraph of six sentences" in it has no single figure to hold the other to.
 */
export function lengthClash(first: string, second: string): { first: AskedLength; second: AskedLength } | null {
  const a = askedLengths(first);
  const b = askedLengths(second);
  for (const unit of ['sentence', 'word', 'paragraph', 'page'] as const) {
    const mine = a.filter((x) => x.unit === unit);
    const theirs = b.filter((x) => x.unit === unit);
    const one = mine[0];
    if (!one || !theirs.length || mine.some((x) => x.low !== one.low || x.high !== one.high)) continue;
    // Every one of them off, not any: tried on 370 pieces Folio had written, "any" named five where a part of the piece had
    // its own length (one sentence for a step, sixty words for a reply), and "every" the one real fault.
    if (theirs.every((x) => x.high < one.low || x.low > one.high)) return { first: one, second: theirs[0]! };
  }
  return null;
}

/** The words a plan would use for a component: "In-class group worksheets" is run as "the group worksheet". */
const stems = (name: string) => name.toLowerCase().split(/[^\p{L}\d]+/u).filter((w) => w.length > 2 && !['class', 'weekly', 'the', 'and'].includes(w)).map((w) => w.replace(/s$/, ''));

/** The segments in which a plan runs the lesson's piece done in class, and not the one that only lists how the course is graded. */
export function segmentsFor<S extends { title: string; description: string }>(course: Course, lesson: Lesson, segments: readonly S[]): S[] {
  const toward = lesson.homework.toward.trim();
  const others = course.grading.map((g) => g.item.trim().toLowerCase()).filter((item) => item && item !== toward.toLowerCase());
  const text = (seg: S) => `${seg.title} ${seg.description}`.toLowerCase();
  const mine = segments.filter((seg) => !others.some((item) => text(seg).includes(item)));
  const whole = mine.filter((seg) => stems(toward).every((w) => text(seg).includes(w)));
  // The longer reading wins: "Lab notebook" was tied to nine minutes of "preparing for the lab", not to the 95 of "Graded notebook".
  // And a piece run over several segments has all of them: a lab of 69 minutes in three parts was held to the 25 of its longest,
  // and its teacher told it asked too much.
  const part = mine.filter((seg) => stems(toward).some((w) => text(seg).includes(w)));
  // A segment that names the piece in full is the piece's: "Recitation group problems" was given 69 and 101 minutes, the
  // sum of every segment with the word "problem" or "group" in it.
  const named = mine.filter((seg) => text(seg).includes(toward.toLowerCase()) || text(seg).includes(toward.toLowerCase().replace(/s$/, '')));
  const sum = (list: S[]) => list.reduce((n, seg) => n + ((seg as { minutes?: number }).minutes ?? 0), 0);
  return named.length ? named : sum(whole) >= sum(part) ? whole : part;
}

const inClass = (lesson: Lesson) => lesson.homework.kind === 'inclass' && Boolean(lesson.homework.toward.trim()) && lesson.homework.standing !== true;

/** A piece done in class that asks another length than the plan that runs it: asked once more, and said to the teacher if it stays. */
export function otherLength(v: { prompt: string; steps: string[]; rubric: { criteria: { descriptors: string[] }[] } }, course: Course, lesson: Lesson): Problem[] {
  if (!inClass(lesson)) return [];
  const plan = segmentsFor(course, lesson, lesson.segments).map((s) => s.description).join('\n');
  const piece = [v.prompt, ...v.steps, ...v.rubric.criteria.flatMap((c) => c.descriptors)].join('\n');
  const clash = lengthClash(plan, piece);
  if (!clash) return [];
  const [planned, said] = [lengthWords(clash.first), lengthWords(clash.second)];
  return [{
    index: null,
    flag: { code: 'schemaIssue', values: { path: 'steps', issue: `The plan has students write ${planned} for this, and the piece or its rubric says ${said}: every part of it asks the plan's length` } },
    left: { code: 'reviewNote', values: { where: lesson.homework.toward, text: `The plan asks for ${planned} and this piece or its rubric for ${said}. Students should be asked one length: change the plan's segment or this piece.` } },
  }];
}

/**
 * A plan written again where the lesson's piece already stands: the piece is what students were given and what its rubric
 * scores, so the plan says its length. Nothing of the piece is changed from here.
 */
export function planOtherLength(segments: readonly { title: string; description: string; minutes: number }[], course: Course, lesson: Lesson): Problem[] {
  return lessonPieces(lesson).flatMap((homework): Problem[] => {
    const one = { ...lesson, homework };
    if (!inClass(one)) return [];
    const toward = homework.toward.trim();
    const piece = lesson.taskIds.map((id) => course.tasks[id]).find((t) => t?.kind === 'assignment' && t.title.toLowerCase().startsWith(toward.toLowerCase()));
    if (!piece || piece.kind !== 'assignment') return [];
    const rubric = piece.rubricId ? course.rubrics[piece.rubricId] : undefined;
    const text = [piece.prompt, ...piece.steps, ...(rubric?.criteria.flatMap((c) => Object.values(c.descriptors)) ?? [])].join('\n');
    const clash = lengthClash(text, segmentsFor(course, one, segments).map((s) => s.description).join('\n'));
    if (!clash) return [];
    const [set, said] = [lengthWords(clash.first), lengthWords(clash.second)];
    return [{
      index: null,
      flag: { code: 'schemaIssue', values: { path: 'segments', issue: `"${piece.title}" is already written and asks for ${set}; the plan says ${said}: the segment that runs it asks the piece's length` } },
      left: { code: 'reviewNote', values: { where: toward, text: `"${piece.title}" asks for ${set} and this plan for ${said}. Students should be asked one length: change the plan's segment or the piece.` } },
    }];
  });
}
