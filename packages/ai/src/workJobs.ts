import { cmd, lessonPieces, newId, type Command, type Course, type Flag, type Lesson, type Rubric, type Task } from '@folio/core';
import type { JobSpec, Problem } from './jobs';
import { AssignmentDraft, StepDraft, TestDraft } from './schemas';
import { tidySteps, unnumberSteps } from './tidy';

/**
 * The jobs that write the work a lesson holds: a graded assignment with its rubric, a step toward a larger
 * piece, and a test taken in class; with what every section job shares.
 */

/** Everything one generated section needs: its schema, its checks and how it becomes commands. */
export interface SectionJob<T> {
  schema: JobSpec<T>['schema'];
  tidy?: (value: T, course: Course, lesson: Lesson) => T;
  check?: (value: T, course: Course, lesson: Lesson) => Problem[];
  toCommands: (value: T, problems: Problem[], course: Course, lesson: Lesson) => Command[];
}

/** The flags for one item, or for the whole section when index is null. */
export function flagsAt(problems: Problem[], index: number | null): Flag[] {
  return problems.filter((p) => p.index === index).map((p) => p.flag);
}

export const base = (lesson: Lesson) => ({ lessonId: lesson.id, sourceRefs: [], origin: 'ai' as const, edited: false });


/**
 * Work done in class against the minutes its plan gives it. Told to size it, writers still covered every objective:
 * a 15-minute group worksheet came with four parts, three tables, two drawings and a paragraph. Measured on 26
 * pieces, those a reader found undoable ran past ten words of task for each minute, and the rest under eight.
 */
const WORDS_A_MINUTE = 10;
/** The words a plan would use for a component: "In-class group worksheets" is run as "the group worksheet". */
const stems = (name: string) => name.toLowerCase().split(/[^\p{L}\d]+/u).filter((w) => w.length > 2 && !['class', 'weekly', 'the', 'and'].includes(w)).map((w) => w.replace(/s$/, ''));

/** The minutes a plan gives a piece done in class: its segments, and not the one that only lists how the course is graded. */
export function minutesFor(course: Course, lesson: Lesson): number {
  const toward = lesson.homework.toward.trim();
  const others = course.grading.map((g) => g.item.trim().toLowerCase()).filter((item) => item && item !== toward.toLowerCase());
  const text = (seg: Lesson['segments'][number]) => `${seg.title} ${seg.description}`.toLowerCase();
  const mine = lesson.segments.filter((seg) => !others.some((item) => text(seg).includes(item)));
  const whole = mine.filter((seg) => stems(toward).every((w) => text(seg).includes(w))).reduce((n, seg) => n + seg.minutes, 0);
  // The longer reading wins: "Lab notebook" was tied to nine minutes of "preparing for the lab", not to the 95 of "Graded notebook".
  // And a piece run over several segments has all of them: a lab of 69 minutes in three parts was held to the 25 of its longest,
  // and its teacher told it asked too much.
  const part = mine.filter((seg) => stems(toward).some((w) => text(seg).includes(w))).reduce((n, seg) => n + seg.minutes, 0);
  return Math.max(whole, part);
}

function tooMuch(v: { prompt: string; steps: string[] }, course: Course, lesson: Lesson): Problem[] {
  if (lesson.homework.kind !== 'inclass' || !lesson.homework.toward.trim()) return [];
  // A piece taken a group at a time over the term is its brief, written once: the ten minutes in which one lesson hands
  // it out are not the time it is done in, and a seminar's teacher was told its brief asked too much for them.
  if (lesson.homework.standing === true) return [];
  const minutes = minutesFor(course, lesson);
  if (!minutes) return [];
  // Asked of the writer once more in its own terms; if it stays, the teacher is told what is the matter, not that
  // "part of this came back in the wrong shape" (which is what a request left unmet was shown as).
  const left = { code: 'reviewNote' as const, values: { where: lesson.homework.toward, text: `The plan's segments that run this come to ${minutes} minutes, and it asks for more than most groups will finish in that time. Cut a part of it, or give it more minutes.` } };
  const issue = (text: string): Problem => ({ index: null, flag: { code: 'schemaIssue', values: { path: 'steps', issue: text } }, left });
  // A sheet told groups to "work for 20 minutes" in a segment of 13.
  const said = Math.max(0, ...[...`${v.prompt} ${v.steps.join(' ')}`.matchAll(/\b(\d{1,3})[- ]minutes?\b/gi)].map((m) => Number(m[1])));
  if (said > minutes) return [issue(`The plan gives this ${minutes} minutes, and the piece says ${said}: it says the plan's time, and asks only what fits it`)];
  const words = v.steps.join(' ').split(/\s+/).filter(Boolean).length;
  // A count of words is a reason to ask once more, and no more than that: left as a note, it was wrong in three readings
  // running (a brief of 12 minutes a reader timed at 8 or 9). What a segment asks is counted by its parts when the plan is read.
  return words > WORDS_A_MINUTE * minutes ? [{ ...issue(`The plan gives this ${minutes} minutes: ask for about half as much, the parts that matter most, so every group finishes`), advisory: true }] : [];
}

/**
 * The rubric of a component's first piece, for the pieces after it. Written each on its own, one weekly worksheet was
 * scored out of 12 in two weeks and out of 16 in four.
 */
export function firstRubric(course: Course, first: Lesson | undefined, toward: string) {
  const piece = workOf(course, first, toward);
  return piece?.kind === 'assignment' && piece.rubricId ? course.rubrics[piece.rubricId] : undefined;
}

/** The rubric a lesson's piece is to match: that of the first piece of its component, when this is a later one of several each written on its own. */
export function rubricToMatch(course: Course, lesson: Lesson) {
  const toward = lesson.homework.toward.trim();
  if (!toward || lesson.homework.kind === 'test' || lesson.homework.standing) return undefined;
  const first = course.lessonOrder.map((id) => course.lessons[id]!).find((l) => lessonPieces(l).some((p) => p.kind === lesson.homework.kind && p.toward.trim() === toward));
  return first && first.id !== lesson.id ? firstRubric(course, first, toward) : undefined;
}

/** A later piece whose rubric is not the first one's in its criteria and levels: asked for once more, then said to the teacher. */
function otherRubric(v: AssignmentDraft, course: Course, lesson: Lesson): Problem[] {
  const first = rubricToMatch(course, lesson);
  if (!first || !first.criteria.length || !v.rubric.criteria.length) return [];
  const same = first.criteria.length === v.rubric.criteria.length && first.levels.length === v.rubric.levels.length && first.levels.every((l, i) => l.points === v.rubric.levels[i]!.points);
  if (same) return [];
  const shape = `${first.criteria.length} criteria (${first.criteria.map((c) => c.name).join('; ')}) and the levels ${first.levels.map((l) => `${l.label} ${l.points}`).join(', ')}`;
  return [{ index: null, flag: { code: 'schemaIssue', values: { path: 'rubric', issue: `Every piece of "${lesson.homework.toward.trim()}" is scored on the first one's rubric: ${shape}. Keep those criteria and levels; only the descriptors are this piece's own` } }, left: { code: 'reviewNote', values: { where: lesson.homework.toward, text: `This piece's rubric is not the one the first piece of "${lesson.homework.toward.trim()}" was scored on (${shape}): students would be scored out of a different total from one week to the next. Make the two agree.` } } }];
}

export const assignments: SectionJob<AssignmentDraft> = {
  schema: AssignmentDraft,
  tidy: tidySteps,
  check: (v, course, lesson) => [
    ...v.rubric.criteria
      .filter((c) => c.descriptors.length !== v.rubric.levels.length)
      .map((c): Problem => ({ index: null, flag: { code: 'criterionLevels', values: { criterion: c.name } } })),
    // Work graded in class needs its running order: who goes when, what the others do, how it is scored in the time.
    ...(lesson.homework.kind === 'inclass' && !v.answerKey.trim()
      ? [{ index: null, flag: { code: 'schemaIssue' as const, values: { path: 'answerKey', issue: 'Say how the teacher runs and scores this for a whole class in the lesson' } } }]
      : []),
    ...tooMuch(v, course, lesson),
    ...otherRubric(v, course, lesson),
    // A program with a fixed test run, or a problem with numbers, has results a marker needs: one came with no key at all.
    ...(lesson.homework.kind === 'assignment' && !lesson.homework.standing && !v.answerKey.trim() && v.steps.some((s) => /`[^`]+`|\d+(?:\.\d+)?\s*[×x*/÷+−-]\s*\d/.test(s))
      ? [{ index: null, flag: { code: 'schemaIssue' as const, values: { path: 'answerKey', issue: 'Give the worked answers or the expected results of what the steps ask for' } } }]
      : []),
  ],
  toCommands: (v, problems, course, lesson) => {
    const levels = v.rubric.levels.map((lv) => ({ id: newId('x'), label: lv.label, points: lv.points }));
    // A quiz of questions with one right answer each is scored by its answers: on a four-level rubric, none right earned 2 of 8.
    const scored = v.rubric.criteria.length > 0;
    const rubric: Rubric = {
      id: newId('r'),
      title: pieceTitle(course, lesson) ?? v.title,
      levels,
      criteria: v.rubric.criteria.map((c) => ({
        id: newId('x'),
        name: c.name,
        descriptors: Object.fromEntries(levels.map((lv, i) => [lv.id, c.descriptors[i] ?? ''])),
      })),
    };
    const task: Task = {
      ...base(lesson),
      id: newId('t'),
      kind: 'assignment',
      objectiveIds: [...lesson.objectiveIds],
      flags: [],
      title: pieceTitle(course, lesson) ?? v.title,
      prompt: v.prompt,
      steps: v.steps,
      rubricId: scored ? rubric.id : null,
      answerKey: v.answerKey.trim(),
      toward: lesson.homework.toward.trim(),
    };
    return [cmd('tasks.fill', { lessonId: lesson.id, kind: 'assignments', flags: flagsAt(problems, null), tasks: [task], rubrics: scored ? [rubric] : [] })];
  },
};

export const step: SectionJob<StepDraft> = {
  schema: StepDraft,
  tidy: unnumberSteps,
  toCommands: (v, problems, _course, lesson) => {
    const task: Task = {
      ...base(lesson),
      id: newId('t'),
      kind: 'assignment',
      objectiveIds: [...lesson.objectiveIds],
      flags: [],
      title: v.title,
      prompt: v.prompt,
      steps: v.steps,
      rubricId: null,
      answerKey: '',
      toward: lesson.homework.toward.trim(),
    };
    return [cmd('tasks.fill', { lessonId: lesson.id, kind: 'assignments', flags: flagsAt(problems, null), tasks: [task], rubrics: [] })];
  },
};

const pointsOf = (n: number) => (n === 1 ? '1 point' : `${n} points`);
/** The text without the points a model wrote at its end: Folio adds them, and they stood there twice. */
const withoutPoints = (text: string, points: number) => text.trim().replace(new RegExp(String.raw`(?:\s*\(${points}\s*(?:points?|pts?|marks?)\))+\s*$`, 'i'), '');

/**
 * A test taken in class, kept as an assignment whose steps are its questions, each with its points, and whose
 * answer key is the teacher's alone. Before this a unit test worth half a grade was a line in a plan.
 */
export const test: SectionJob<TestDraft> = {
  schema: TestDraft,
  toCommands: (v, problems, course, lesson) => {
    const total = v.questions.reduce((n, q) => n + q.points, 0);
    const task: Task = {
      ...base(lesson),
      id: newId('t'),
      kind: 'assignment',
      objectiveIds: [...lesson.objectiveIds],
      flags: [],
      title: pieceTitle(course, lesson) ?? v.title,
      prompt: v.instructions,
      steps: v.questions.map((q) => `${withoutPoints(q.question, q.points)} (${pointsOf(q.points)})`),
      rubricId: null,
      answerKey: [...v.questions.map((q, i) => `${i + 1}. ${withoutPoints(q.answer, q.points)} (${pointsOf(q.points)})`), `Total: ${pointsOf(total)}`].join('\n'),
      toward: lesson.homework.toward.trim(),
    };
    return [cmd('tasks.fill', { lessonId: lesson.id, kind: 'assignments', flags: flagsAt(problems, null), tasks: [task], rubrics: [] })];
  },
};

// A graded clicker round had a brief ("answer the instructor's questions") and a plan that ran "the clicker questions": nobody wrote one.
export const EACH_TIME = '; its brief and rubric are one text for every time and hold no questions or problems, so the ones of this time are written out in full, with their answers in the notes, in the segment that runs it';

const PIECE: Record<string, string> = { assignment: 'the graded assignment', step: 'a short ungraded step toward', test: 'the graded test', inclass: 'the piece graded in class', none: '' };

/** What a lesson holds beside its main piece, for its plan: the plan sets or runs each, and writes none of them. */
export function otherPieces(lesson: Lesson, due: (piece: Lesson['homework']) => string = () => ''): string {
  // Each by where it happens: told "set before students leave, or run in the lesson", plans ran a weekly paper as silent writing in class.
  const moment = (p: Lesson['homework']) => (p.kind === 'inclass' ? `run in the lesson${p.standing ? EACH_TIME : ''}` : p.kind === 'test' ? 'sat in the lesson' : p.standing ? 'done outside class every time: the close sets it in a sentence, and no lesson time goes to writing it' : 'set before students leave');
  // With when it is due, as the piece itself is told: untold, a page gave a step "by Sunday" that its own text set five weeks on.
  const others = (lesson.also ?? []).filter((p) => p.kind !== 'none').map((p) => `${PIECE[p.kind]}${p.toward.trim() ? ` "${p.toward.trim()}"` : ''} (${[moment(p), due(p)].filter(Boolean).join('; ')})`);
  return others.length ? ` The lesson also holds, each written separately: ${others.join('; ')}. The plan gives each its moment and writes none of them.` : '';
}

/**
 * The name a piece of work goes by, settled before a word of it is written. Each piece was named by its own writer, after
 * the plans of later lessons had already told students to hand it in: "collect last time's Problem sets" for a piece that
 * came out as "Problem set 1: supply and demand", or under a third name in the slides. Readers found a lesson that
 * collects work no earlier lesson gave out under that name in six courses of sixteen. A piece set once, or the same every
 * time, goes by the name of what it counts toward; one of several by that name and the title of its lesson. Null for an
 * ungraded step, which has no name of its own to collect by.
 */
export function pieceTitle(course: Course, lesson: Lesson): string | null {
  const toward = lesson.homework.toward.trim();
  if (!toward || lesson.homework.kind === 'step' || lesson.homework.kind === 'none') return null;
  const holders = Object.values(course.lessons).filter((l) => lessonPieces(l).some((p) => p.kind !== 'step' && p.toward.trim() === toward));
  return lesson.homework.standing || holders.length <= 1 ? toward : `${toward}: ${lesson.title}`;
}

/** The assignment a lesson holds for one component: the one written for it, else the lesson's first. */
export function workOf(course: Course, lesson: Lesson | undefined, toward: string): Task | undefined {
  const all = (lesson?.taskIds ?? []).map((id) => course.tasks[id]).filter((t) => t?.kind === 'assignment');
  return all.find((t) => t?.kind === 'assignment' && t.toward.trim() === toward) ?? all[0];
}

/**
 * A piece that is one piece wherever it appears is written once, and the later lessons take the first one's
 * instructions, rubric and notes as they stand: work graded in class over several lessons (an oral interview
 * taken in two groups), and a standing task set again each week (a response to the reading). Written again for
 * each lesson, the second day's students were scored on a different rubric for the same 40%, and a seminar's
 * weekly response paper came with nine briefs and nine rubrics.
 */
export function continuedInClass(course: Course, lesson: Lesson): Command[] | null {
  const { kind, standing } = lesson.homework;
  const toward = lesson.homework.toward.trim();
  // Work in class the outline marked as different pieces of one component (an organizer, then a draft) is written each on its
  // own: taken for one piece in groups, the draft was given the organizer's brief and rubric, word for word.
  // A paper sat in class is never the same paper twice: marked standing, a lab's second pre-lab quiz was its first, word for word.
  if (kind === 'test' || !(kind === 'inclass' ? standing !== false : standing) || !toward) return null;
  const first = course.lessonOrder
    .slice(0, course.lessonOrder.indexOf(lesson.id))
    .map((id) => course.lessons[id])
    .find((l) => l && lessonPieces(l).some((p) => p.kind === kind && p.toward.trim() === toward));
  const source = workOf(course, first, toward);
  if (!source || source.kind !== 'assignment') return null;
  const scale = source.rubricId ? course.rubrics[source.rubricId] : undefined;
  const levelIds = new Map((scale?.levels ?? []).map((lv) => [lv.id, newId('x')]));
  const rubric: Rubric | null = scale
    ? {
        id: newId('r'),
        title: scale.title,
        levels: scale.levels.map((lv) => ({ ...lv, id: levelIds.get(lv.id)! })),
        criteria: scale.criteria.map((c) => ({ id: newId('x'), name: c.name, descriptors: Object.fromEntries(Object.entries(c.descriptors).map(([id, text]) => [levelIds.get(id) ?? id, text])) })),
      }
    : null;
  const task: Task = { ...source, ...base(lesson), id: newId('t'), objectiveIds: [...lesson.objectiveIds], flags: [], rubricId: rubric?.id ?? null, toward };
  return [cmd('tasks.fill', { lessonId: lesson.id, kind: 'assignments', flags: [], tasks: [task], rubrics: rubric ? [rubric] : [] })];
}

const clip = (text: string, room: number) => (text.length > room ? `${text.slice(0, room)}…` : text).replace(/\s+/g, ' ');

/**
 * What the same students already hold to work in this lesson, for the piece written next. The quiz, the problem
 * set and the recitation work were each written from the plan alone: a graded problem was the recitation's own,
 * whose solutions are posted, and a graded quiz repeated the practice questions word for word.
 */
export function alreadySet(tasks: Task[]): string {
  const items = tasks.flatMap((t) => (t.kind === 'question' ? [clip(t.prompt, 240)] : t.kind === 'assignment' ? t.steps.map((s) => clip(s, 420)) : []));
  if (!items.length) return '';
  return `Already written for this lesson, and worked by the same students:\n${items.map((i) => `- ${i}`).join('\n')}\nThis piece gives other problems than these: another function, case or set of numbers each time: one of them under other letters or in another story is the same problem.`;
}

/**
 * The lesson's work with its answers, for what students read beside it. The study guide and the questions students
 * ask were written from the plan alone, before any key existed: where they and a key disagreed, a student was
 * graded by one and taught by the other.
 */
export function keysSoFar(tasks: Task[]): string {
  const items = tasks.flatMap((t) => {
    if (t.kind === 'question') return [`${clip(t.prompt, 200)} → ${clip(t.choices.find((c) => c.id === t.correct)?.text ?? t.answer, 160)}`];
    return t.kind === 'assignment' && t.answerKey.trim() ? [`${t.title}: ${clip(t.steps.join(' | '), 500)} → key: ${clip(t.answerKey, 900)}`] : [];
  });
  if (!items.length) return '';
  return `The lesson's quiz and graded work with their keys, already written:\n${items.map((i) => `- ${i}`).join('\n')}\nWhat this material says agrees with these keys: a rule, a direction (larger or smaller, more or less) or a value it states is the one they use. It gives none of these answers away: its examples are its own.`;
}
