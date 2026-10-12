import { lessonPieces } from './course';
import { LENGTH_UNITS, askedLengths, lengthWords, outside, saidMinutes, saidTotals, soleLength, type AskedLength } from './saidTerms';
import type { Assignment, Course, Lesson, Rubric } from './schema';

/**
 * One piece of work done in class, and every place a lesson speaks of it: the plan's segments that run it, the slides
 * shown in those segments, the piece and its rubric. Each was written in its own call, or by the teacher, at its own
 * time; here they are read side by side as they stand, and nothing is changed.
 */

/** The words a plan would use for a component: "In-class group worksheets" is run as "the group worksheet". */
const stems = (name: string) => name.toLowerCase().split(/[^\p{L}\d]+/u).filter((w) => w.length > 2 && !['class', 'weekly', 'the', 'and'].includes(w)).map((w) => w.replace(/s$/, ''));

/** The segments in which a plan runs the lesson's piece done in class, and not the one that only lists how the course is graded. */
export function segmentsFor<S extends { title: string; description: string }>(course: Pick<Course, 'grading'>, lesson: Pick<Lesson, 'homework'>, segments: readonly S[]): S[] {
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

export interface PieceSides {
  toward: string;
  /** What the plan says in the segments that run it, and the minutes those segments have. */
  plan: string;
  planMinutes: number;
  /** What the slides of those segments say. Empty where no slide names one of them. */
  slides: string;
  /** The piece as written, where it is: what it asks as a whole, and its steps. */
  task?: { prompt: string; steps: string[] };
  /** Its rubric, where it has one: what full marks come to, and what the highest level describes, a criterion at a time. */
  rubric?: { total: number; top: string[] };
}

const slideText = (slide: Lesson['slides'][number]) => JSON.stringify([slide.title, slide.bullets]);

/** Each piece the lesson does in class at one meeting, with what each material says of it. */
export function pieceSides(course: Course, lesson: Lesson): PieceSides[] {
  return lessonPieces(lesson).filter((p) => p.kind === 'inclass' && p.toward.trim() && p.standing !== true).map((homework) => {
    const toward = homework.toward.trim();
    const segments = segmentsFor(course, { homework }, lesson.segments);
    const ids = new Set(segments.map((s) => s.id));
    const task = lesson.taskIds.map((id) => course.tasks[id]).find((t): t is Assignment => t?.kind === 'assignment' && t.title.toLowerCase().startsWith(toward.toLowerCase()));
    return {
      toward,
      plan: segments.map((s) => `${s.description}\n${(s.shown ?? []).join('\n')}`).join('\n'),
      planMinutes: segments.reduce((n, s) => n + s.minutes, 0),
      slides: lesson.slides.filter((s) => s.segment && ids.has(s.segment)).map(slideText).join('\n'),
      task,
      rubric: task?.rubricId && course.rubrics[task.rubricId] ? rubricTop(course.rubrics[task.rubricId]) : undefined,
    };
  });
}

/** What full marks on a rubric come to, and what its highest level describes, a criterion at a time. */
export function rubricTop(rubric: Rubric | undefined): { total: number; top: string[] } {
  const best = rubric?.levels.reduce<Rubric['levels'][number] | undefined>((a, b) => (a && a.points >= b.points ? a : b), undefined);
  if (!rubric || !best) return { total: 0, top: [] };
  return { total: best.points * rubric.criteria.length, top: rubric.criteria.map((c) => c.descriptors[best.id] ?? '').filter(Boolean) };
}

/** The same of a rubric as a writer drafts it: descriptors in the order of its levels. */
export function draftTop(rubric: { levels: { points: number }[]; criteria: { descriptors: string[] }[] }): { total: number; top: string[] } {
  const points = rubric.levels.map((l) => l.points);
  const at = points.indexOf(Math.max(...points));
  return { total: (points[at] ?? 0) * rubric.criteria.length, top: rubric.criteria.map((c) => c.descriptors[at] ?? '').filter(Boolean) };
}

export type Side = 'plan' | 'slides' | 'piece' | 'rubric';
export interface Apart {
  toward: string;
  term: 'length' | 'minutes' | 'points';
  a: { side: Side; says: string };
  b: { side: Side; says: string };
  /** False where one side says several figures and it cannot be told which is this piece's: the teacher's to settle. */
  sure: boolean;
}

const mins = (n: number) => `${n} ${n === 1 ? 'minute' : 'minutes'}`;
const pts = (n: number) => `${n} ${n === 1 ? 'point' : 'points'}`;

function lengthsApart(s: PieceSides): Apart[] {
  const top = s.rubric?.top ?? [];
  return LENGTH_UNITS.flatMap((unit): Apart[] => {
    const of = (text: string) => askedLengths(text).filter((x) => x.unit === unit);
    const planned = soleLength(s.plan, unit);
    const whole = s.task ? of(s.task.prompt) : [];
    const asked = whole.length === 1 ? whole[0] : undefined;
    const pair = (a: Side, x: AskedLength, b: Side, y: AskedLength, sure = true): Apart => ({ toward: s.toward, term: 'length', a: { side: a, says: lengthWords(x) }, b: { side: b, says: lengthWords(y) }, sure });
    const found: Apart[] = [];
    if (planned && whole.length && whole.every((x) => outside(x, planned))) found.push(pair('plan', planned, 'piece', whole[0]!));
    // A plan that says several lengths, none of them the piece's: which is this piece's cannot be told from here.
    const several = of(s.plan);
    if (!planned && asked && several.length > 1 && several.every((x) => outside(x, asked))) found.push(pair('plan', several[0]!, 'piece', asked, false));
    const held = asked ?? planned;
    const off = held && top.map(of).find((said) => said.length && said.every((x) => outside(x, held)));
    if (held && off) found.push(pair(asked ? 'piece' : 'plan', held, 'rubric', off[0]!));
    const shown = of(s.slides);
    if (held && shown.length && shown.every((x) => outside(x, held))) found.push(pair(asked ? 'piece' : 'plan', held, 'slides', shown[0]!, shown.length === 1));
    return found;
  });
}

function minutesApart(s: PieceSides): Apart[] {
  const pair = (a: Side, x: number, b: Side, y: number, sure: boolean): Apart => ({ toward: s.toward, term: 'minutes', a: { side: a, says: mins(x) }, b: { side: b, says: mins(y) }, sure });
  const planned = saidMinutes(s.plan);
  const asked = s.task ? saidMinutes(s.task.prompt) : [];
  const found: Apart[] = [];
  const mine = asked.length === 1 ? asked[0]! : undefined;
  if (mine !== undefined && !planned.includes(mine)) {
    // More than the segments hold is certain. So is another figure where the plan gives the piece the whole of its segments
    // ("write alone for six minutes" in a segment of six). A smaller figure in the plan is a part of the segment (a minute
    // to compare with a partner), and says nothing of the piece: four of six lessons named on it were that.
    if (s.planMinutes && mine > s.planMinutes) found.push(pair('plan', s.planMinutes, 'piece', mine, true));
    else if (planned.includes(s.planMinutes)) found.push(pair('plan', s.planMinutes, 'piece', mine, true));
  }
  const held = mine ?? (planned.length === 1 ? planned[0] : undefined);
  const shown = saidMinutes(s.slides);
  if (held !== undefined && shown.length && !shown.includes(held)) found.push(pair(mine !== undefined ? 'piece' : 'plan', held, 'slides', shown[0]!, shown.length === 1));
  return found;
}

function pointsApart(s: PieceSides): Apart[] {
  const pair = (a: Side, x: number, b: Side, y: number, sure: boolean): Apart => ({ toward: s.toward, term: 'points', a: { side: a, says: pts(x) }, b: { side: b, says: pts(y) }, sure });
  const total = s.rubric?.total ?? 0;
  const asked = s.task ? saidTotals(`${s.task.prompt}\n${s.task.steps.join('\n')}`) : [];
  const found: Apart[] = [];
  if (total && asked.length && !asked.includes(total)) found.push(pair('rubric', total, 'piece', asked[0]!, asked.length === 1));
  const held = total || (asked.length === 1 ? asked[0]! : 0);
  for (const side of ['plan', 'slides'] as const) {
    const said = saidTotals(s[side]);
    if (held && said.length && !said.includes(held)) found.push(pair(total ? 'rubric' : 'piece', held, side, said[0]!, said.length === 1));
  }
  return found;
}

/** Where the materials of a lesson say different things of one piece done in class: its length, its minutes, its points. */
export function termsApart(course: Course, lesson: Lesson): Apart[] {
  return pieceSides(course, lesson).flatMap(sidesApart);
}

/** The same of one piece, whatever its sides were made from: a draft being checked is held against what stands. */
export function sidesApart(s: PieceSides): Apart[] {
  return [...lengthsApart(s), ...minutesApart(s), ...pointsApart(s)];
}

const SIDE: Record<Side, string> = { plan: 'the plan', slides: 'its slide', piece: 'the piece', rubric: 'its rubric' };
const TERM: Record<Apart['term'], string> = { length: 'length', minutes: 'time', points: 'points' };

/** One difference as a sentence for the teacher. */
export function apartLine(x: Apart): string {
  const sides = `${SIDE[x.a.side]} says ${x.a.says} and ${SIDE[x.b.side]} ${x.b.says}`;
  return x.sure ? `“${x.toward}”, ${TERM[x.term]}: ${sides}.` : `“${x.toward}”, ${TERM[x.term]}: ${sides}; Folio cannot tell whether both are about this piece.`;
}
