import { lessonPieces, type Course, type Lesson } from '@folio/core';
import type { Problem } from './jobs';

/**
 * The length a piece done in class is asked at, held to one figure across the plan that runs it and the piece itself.
 * A reading of sixteen fresh lessons found a paragraph the plan and its slide asked "in about six sentences" and the
 * piece and its rubric "of about three": each was written from the other's words, and nothing compared them.
 */

const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const N = `(\\d{1,3}(?:,\\d{3})+|\\d{1,5}|${Object.keys(WORDS).join('|')})`;
const UNIT = '(sentence|word|paragraph|page)s?';
const ASKED = new RegExp(`(?<![\\d.,])\\b(?:${N}\\s*(?:-|–|to|or)\\s*)?${N}[- ](?:(?:short|full|complete|whole)[- ])?${UNIT}\\b`, 'gi');

export type LengthUnit = 'sentence' | 'word' | 'paragraph' | 'page';
export interface AskedLength { low: number; high: number; unit: LengthUnit }

const number = (text: string) => WORDS[text.toLowerCase()] ?? Number(text.replace(/,/g, ''));

/** Every length a text asks writing at: "about six sentences", "five or six sentences", "150 to 200 words", "one page". */
export function askedLengths(text: string): AskedLength[] {
  return [...text.matchAll(ASKED)].map((m) => {
    const high = number(m[2]!);
    const low = m[1] ? Math.min(number(m[1]), high) : high;
    return { low, high, unit: m[3]!.toLowerCase() as LengthUnit };
    // A few words are a thing to mark or to say, not a length to write at: "underline one word" stood against a reflection of 60 to 90.
  }).filter((x) => x.unit !== 'word' || x.high >= 10);
}

export const lengthWords = (a: AskedLength) => `${a.low === a.high ? a.high : `${a.low} to ${a.high}`} ${a.unit}${a.high === 1 ? '' : 's'}`;

const UNITS = ['sentence', 'word', 'paragraph', 'page'] as const;
const outside = (x: AskedLength, one: AskedLength) => x.high < one.low || x.low > one.high;
/** The one length a text says in a unit, where it says one. */
const sole = (text: string, unit: LengthUnit) => {
  const said = askedLengths(text).filter((x) => x.unit === unit);
  return said[0] && said.every((x) => x.low === said[0]!.low && x.high === said[0]!.high) ? said[0] : undefined;
};

/** A piece as its parts: what it asks as a whole, its steps, and what its rubric's top level describes. */
export interface PieceParts { prompt: string; steps: string[]; top: string[] }

/**
 * The length the task asks as a whole: what its opening says. A step's length is a part's ("one sentence naming it", "two
 * on why"), and is not the whole's nor a sum toward it: read as either, six worksheets and seminar briefs of 2,027 pieces
 * Folio had written were named for a step that stood beside a different activity in the plan.
 */
function taskLengths(piece: PieceParts, unit: LengthUnit): AskedLength[] {
  return askedLengths(piece.prompt).filter((x) => x.unit === unit);
}

/**
 * Where a piece asks, or its rubric scores, another length than the one it is held to. The task and the rubric are each
 * compared on their own: put together, a rubric's "six sentences" hid a task that asked three, and the reverse.
 * Held to the plan's length where the plan says one, and the rubric to the task's own where the plan says none.
 */
export function pieceClash(plan: string, piece: PieceParts): { held: AskedLength; said: AskedLength; where: 'task' | 'rubric'; by: 'plan' | 'task' } | null {
  for (const unit of UNITS) {
    const planned = sole(plan, unit);
    const task = taskLengths(piece, unit);
    if (planned && task.length && task.every((x) => outside(x, planned))) return { held: planned, said: task[0]!, where: 'task', by: 'plan' };
    const held = planned ?? (task.length === 1 ? task[0] : undefined);
    if (!held) continue;
    // Each descriptor of the top level by itself: one that says the right figure does not answer for one that does not.
    for (const text of piece.top) {
      const said = askedLengths(text).filter((x) => x.unit === unit);
      if (said.length && said.every((x) => outside(x, held))) return { held, said: said[0]!, where: 'rubric', by: planned ? 'plan' : 'task' };
    }
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

/** What the highest level of a draft's rubric says, a criterion at a time. */
function topOf(rubric: { levels?: { points: number }[]; criteria: { descriptors: string[] }[] }): string[] {
  const points = rubric.levels?.map((l) => l.points) ?? [];
  const at = points.length ? points.indexOf(Math.max(...points)) : 0;
  return rubric.criteria.map((c) => c.descriptors[at] ?? '').filter(Boolean);
}

/**
 * A piece that asks, or whose rubric scores, another length than it is held to: asked once more, and said to the teacher
 * if it stays. A piece done in class is held to the plan that runs it; any piece's rubric to what the piece itself asks.
 */
export function otherLength(v: { prompt: string; steps: string[]; rubric: { levels?: { points: number }[]; criteria: { descriptors: string[] }[] } }, course: Course, lesson: Lesson): Problem[] {
  const plan = inClass(lesson) ? segmentsFor(course, lesson, lesson.segments).map((s) => s.description).join('\n') : '';
  const clash = pieceClash(plan, { prompt: v.prompt, steps: v.steps, top: topOf(v.rubric) });
  if (!clash) return [];
  const [held, said] = [lengthWords(clash.held), lengthWords(clash.said)];
  const holder = clash.by === 'plan' ? 'The plan has students write' : 'The piece asks for';
  const part = clash.where === 'task' ? 'the piece asks for' : 'its rubric\'s top level describes';
  return [{
    index: null,
    flag: { code: 'schemaIssue', values: { path: clash.where === 'task' ? 'steps' : 'rubric', issue: `${holder} ${held}, and ${part} ${said}: the task and every level of its rubric keep to ${held}` } },
    left: { code: 'reviewNote', values: { where: lesson.homework.toward, text: `${holder} ${held}, and ${part} ${said}. Students should be asked and scored on one length: change one of them.` } },
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
    const said2 = segmentsFor(course, one, segments).map((s) => s.description).join('\n');
    // What the piece asks as a whole, as it is read when the piece is the one being checked.
    const clash = UNITS.map((unit) => ({ whole: taskLengths({ prompt: piece.prompt, steps: piece.steps, top: [] }, unit), plan: askedLengths(said2).filter((x) => x.unit === unit) }))
      .find(({ whole, plan }) => whole.length === 1 && plan.length > 0 && plan.every((x) => outside(x, whole[0]!)));
    if (!clash) return [];
    const [set, said] = [lengthWords(clash.whole[0]!), lengthWords(clash.plan[0]!)];
    return [{
      index: null,
      flag: { code: 'schemaIssue', values: { path: 'segments', issue: `"${piece.title}" is already written and asks for ${set}; the plan says ${said}: the segment that runs it asks the piece's length` } },
      left: { code: 'reviewNote', values: { where: toward, text: `"${piece.title}" asks for ${set} and this plan for ${said}. Students should be asked one length: change the plan's segment or the piece.` } },
    }];
  });
}
