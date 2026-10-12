import { CourseStore, GENERATED_KINDS, lessonPieces, orderedLessons, ownNeeds, setsWork, type Command, type Course, type GeneratedKind, type Lesson, type MaterialKind } from '@folio/core';

/** The lesson still exists and still asks for this section: the teacher may have changed its homework mid-build. */
const stillWanted = (course: Course, t: BuildTarget) => {
  const lesson = course.lessons[t.lessonId];
  return Boolean(lesson && (t.kind === 'facts' || setsWork(lesson, t.kind)));
};
import { InferenceError, type Inference } from './inference';
import type { RunOptions } from './runCells';
import { generateSection, type SectionProgress } from './sections';
import { lastRead } from './lastRead';
import { BUILT_ON_PLAN } from './prompts';
import { lessonFacts, needsFacts } from './lessonFacts';
import { lessonRubrics, piecesLackingRubric } from './rubricAlone';

/**
 * A part of a lesson a build writes: one of the sections; the lesson's rubrics alone, for graded work that stands
 * without them; or the lesson's facts, settled first where it is written without a plan.
 */
export type BuildKind = GeneratedKind | 'rubrics' | 'facts';

export interface BuildTarget {
  lessonId: string;
  kind: BuildKind;
}

export type BuildEvent =
  | { type: 'start'; target: BuildTarget }
  | { type: 'done'; target: BuildTarget; flagged: number }
  | { type: 'error'; target: BuildTarget; error: InferenceError };

export interface BuildSummary {
  built: number;
  failed: number;
  flagged: number;
  stopped: boolean;
  fatal: InferenceError | null;
}

export interface BuildHost {
  inference: Inference;
  /** Reviews each lesson plan before the materials written from it; none for providers it hasn't been tried with. */
  reviewer?: Inference;
  /**
   * True to read each lesson whole once all of it is written (lastRead.ts). Off unless asked for: on sixteen lessons written
   * from the fixed source it made 63 changes and the count of faults that would stop a class did not fall (15 without, 15
   * with, read by hand), so it stays a measuring tool until it earns its three credits a lesson.
   */
  wholeRead?: boolean;
  /** Runs the Python on module pages; without it a page is kept as written. */
  run?: RunOptions;
  /** Read the latest course before each job so edits made mid-build are respected. */
  getCourse(): Course;
  commit(target: BuildTarget, commands: Command[]): void;
  onEvent?(event: BuildEvent): void;
  /** How each section is coming along while it is written. */
  onProgress?(target: BuildTarget, progress: SectionProgress): void;
  signal: AbortSignal;
  concurrency?: number;
}

export const targetKey = (t: BuildTarget): string => `${t.lessonId}:${t.kind}`;

/** A section a build writes: one the teacher chose, or one a chosen material cannot be written without. */
export interface RunKind {
  kind: GeneratedKind;
  /** The chosen material that needs it, when the teacher did not choose it themselves. */
  neededBy?: MaterialKind;
}

/**
 * What is really written for a choice of materials: the one list the build runs, and the one its cost is reckoned
 * from. Rubrics are written with the graded work they score, so choosing rubrics alone writes that work too: the
 * build did, and the estimate, which added up only what was ticked, said nothing was to pay.
 */
export function runKinds(enabled: (kind: MaterialKind) => boolean): RunKind[] {
  return GENERATED_KINDS.flatMap((kind): RunKind[] => {
    if (enabled(kind)) return [{ kind }];
    return kind === 'assignments' && enabled('rubrics') ? [{ kind, neededBy: 'rubrics' }] : [];
  });
}

/** One part of one lesson in a build's plan: whether it is to be written, and why it is there or is not. */
export interface PlannedTask extends BuildTarget {
  /** The lesson's number, counted from 1. */
  lesson: number;
  /** The chosen material that needs it, when the teacher did not choose it themselves. */
  neededBy?: MaterialKind;
  /** "run": to be written. "done": written already. "noWork": the lesson sets no work of this kind, so there is nothing to write. */
  state: 'run' | 'done' | 'noWork';
}

/**
 * What a build of this course would do, lesson by lesson: the one account that the build's queue, the count of what
 * is left, and the estimate of its cost are all read from. Each of them had its own: the estimate multiplied the
 * lessons by the ticked materials, so it charged again for parts already written, charged for graded work in lessons
 * that set none, and charged nothing for work a chosen material needs.
 */
export function executionPlan(course: Course, lessonIds?: readonly string[]): PlannedTask[] {
  const kinds = runKinds((k) => course.materials[k].enabled);
  return orderedLessons(course).flatMap((l, i) =>
    !lessonIds || lessonIds.includes(l.id)
      ? [
          // Written without a plan, a lesson's facts are settled before anything else of it: an inner step, named and counted.
          ...factsFirst(course, l, i, kinds),
          ...kinds.map(({ kind, neededBy }): PlannedTask => ({ lessonId: l.id, lesson: i + 1, kind, ...(neededBy ? { neededBy } : {}), state: !setsWork(l, kind) ? 'noWork' : l.gen[kind] ? 'done' : 'run' })),
          // Written graded work that points at no rubric the course holds: a part of its own, the rubrics alone. That the
          // work was once written says nothing of its rubric, which can be deleted or lost on the way in from a file.
          ...(rubricLacking(course, l) ? [{ lessonId: l.id, lesson: i + 1, kind: 'rubrics' as const, state: 'run' as const }] : []),
        ]
      : [],
  );
}

/**
 * Whether a lesson's written graded work lacks a rubric it is to have: rubrics are chosen, the lesson sets a piece a
 * rubric scores, and that piece as it stands points at no rubric the course holds. That the work was once written
 * says nothing of this: a rubric can be deleted, or lost on the way in from a file, and the work kept.
 * A piece marked in points or as complete has none by design.
 */
export function rubricLacking(course: Course, lesson: Lesson): boolean {
  return piecesLackingRubric(course, lesson).length > 0;
}

/**
 * Lessons that set or run graded work in a course where no graded work is to be written: what the chosen materials
 * lean on and will not find. Said to the teacher before anything is written, with the pieces by name; the materials
 * then name the piece and leave its instructions to the teacher.
 */
export function ownToWrite(course: Course, lessonIds?: readonly string[]): { lesson: number; pieces: string[] }[] {
  const open = ownNeeds(course, lessonIds).filter((n) => !n.confirmed);
  return [...new Set(open.map((n) => n.lesson))].map((lesson) => ({ lesson, pieces: open.filter((n) => n.lesson === lesson).map((n) => n.piece) }));
}

/**
 * The part a build writes for a cell of the map or a material's page: its section, or, for rubrics whose graded work
 * stands without one, the rubrics alone. Asked for by its section, such a cell wrote the teacher's assignment again.
 */
export function buildKindFor(course: Course, lesson: Lesson, kind: MaterialKind, section: GeneratedKind | null): BuildKind | null {
  return kind === 'rubrics' && lesson.gen.assignments && rubricLacking(course, lesson) ? 'rubrics' : section;
}

/** The facts step of a lesson written without a plan, when something of it is still to be written: named for the first such part. */
function factsFirst(course: Course, l: Lesson, i: number, kinds: RunKind[]): PlannedTask[] {
  const first = needsFacts(course, l) ? kinds.find(({ kind }) => BUILT_ON_PLAN.has(kind as never) && setsWork(l, kind) && !l.gen[kind]) : undefined;
  return first ? [{ lessonId: l.id, lesson: i + 1, kind: 'facts', neededBy: first.neededBy ?? first.kind, state: 'run' }] : [];
}

/** Every enabled section that has not been built yet, lesson by lesson. */
export function missingTargets(course: Course, lessonIds?: readonly string[]): BuildTarget[] {
  return executionPlan(course, lessonIds).filter((t) => t.state === 'run').map(({ lessonId, kind }) => ({ lessonId, kind }));
}

// Out of credits stops the build too: every other part would fail the same way, and Resume carries on later.
const FATAL = new Set(['auth', 'config', 'aborted', 'credits']);
/** Failures that may not happen a second time: an answer that could not be used, a call that ran out of time. A busy provider has been asked again already. */
const AGAIN = new Set(['invalid', 'network']);

/**
 * The course with the plans still being checked in it as first written. A plan is written from the lessons before
 * it, and used to wait for each of them to be checked and corrected: fourteen weeks took three hours, one at a time.
 * Now it is written from the one before as first written, and its own check reads that one as corrected.
 */
function withDrafts(course: Course, drafts: ReadonlyMap<string, Command[]>): Course {
  if (!drafts.size) return course;
  const store = new CourseStore(course);
  for (const [lessonId, commands] of drafts) if (course.lessons[lessonId]) store.apply(commands, { label: { key: 'draft' }, source: 'ai', silent: true });
  return store.getState();
}

/**
 * A lesson is read whole once the last of its parts is in, while the next lessons are still being written, so it
 * adds little to the wait. Only a lesson whose plan this build wrote: one part written again at the teacher's word
 * does not reopen the rest. Returns what starts the reads that have come due.
 */
function lastReads(host: BuildHost, targets: BuildTarget[], pending: BuildTarget[], running: Map<string, Promise<void>>): () => void {
  const reviewer = host.reviewer;
  if (!reviewer || !host.wholeRead) return () => {};
  const waiting = new Set(targets.filter((t) => t.kind === 'plan').map((t) => t.lessonId));
  const whole = (lessonId: string): boolean => !pending.some((t) => t.lessonId === lessonId) && ![...running.keys()].some((k) => k.startsWith(`${lessonId}:`)) && !missingTargets(host.getCourse(), [lessonId]).length;
  const read = (lessonId: string): void => {
    waiting.delete(lessonId);
    const key = `${lessonId}:read`;
    const job = lastRead(reviewer, host.getCourse(), lessonId, host.signal)
      .then((r) => void (r.commands.length && !host.signal.aborted && host.commit({ lessonId, kind: 'plan' }, r.commands)))
      .catch(() => undefined);
    running.set(key, job.finally(() => running.delete(key)));
  };
  return () => [...waiting].filter(whole).forEach(read);
}

/**
 * Run section jobs with a small concurrency limit, in lesson order, so the
 * map fills from the top. Sections written from the lesson plan wait for it.
 */
/** What a part waits for in its own lesson, beside the plan. */
const AFTER: Partial<Record<BuildTarget['kind'], BuildTarget['kind'][]>> = { assignments: ['quiz'], study: ['quiz', 'assignments'], faq: ['quiz', 'assignments'] };

/** A lesson's rubrics alone wait for its graded work, and for the rubrics of earlier lessons, which a later piece may take. */
/** A lesson's graded pieces, each as its kind and the component it counts toward. */
const piecesOf = (course: Course, lessonId: string): string[] => (course.lessons[lessonId] ? lessonPieces(course.lessons[lessonId]).map((p) => `${p.kind}:${p.toward.trim()}`) : []);

/** Everything written of a lesson without a plan waits for the lesson's facts. */
const factsWait = (t: BuildTarget, queued: BuildTarget[]): boolean => t.kind !== 'facts' && queued.some((o) => o.kind === 'facts' && o.lessonId === t.lessonId);

const rubricsWait = (t: BuildTarget, queued: BuildTarget[], position: (lessonId: string) => number): boolean =>
  queued.some((o) => (o.kind === 'assignments' && o.lessonId === t.lessonId) || (o.kind === 'rubrics' && position(o.lessonId) < position(t.lessonId)));

export async function runBuild(host: BuildHost, targets: BuildTarget[]): Promise<BuildSummary> {
  const summary: BuildSummary = { built: 0, failed: 0, flagged: 0, stopped: false, fatal: null };
  const pending = [...targets];
  const running = new Map<string, Promise<void>>();
  // Four at a time: with section jobs taking 30–70 s each, three left a four-lesson course at about
  // seven and a half minutes; four brings it near five and a half without crowding rate limits.
  const limit = host.concurrency ?? 4;

  // Plans are written in lesson order, each knowing the ones before it, so a course teaches one version of
  // each idea; the other parts fill the queue meanwhile, so a build takes little longer.
  const position = (lessonId: string) => host.getCourse().lessonOrder.indexOf(lessonId);
  // Parts of one graded piece set in several lessons, and the steps toward one, are written in order too, each
  // seeing what came before it.
  const pieces = (lessonId: string) => piecesOf(host.getCourse(), lessonId);
  const shares = (a: string, b: string) => pieces(a).some((key) => pieces(b).includes(key));
  // Plans written and not yet checked, and something to wake the queue when one arrives.
  const drafts = new Map<string, Command[]>();
  let wake = () => {};
  const drafted = (lessonId: string, commands: Command[]) => (drafts.set(lessonId, commands), wake());
  const blocked = (t: BuildTarget): boolean => {
    const queued = [...pending, ...[...running.keys()].map(parseKey)];
    const waiting = queued.filter((o) => o.kind === 'plan');
    // A plan that runs a piece graded in class is told what its rubric scores: it waits for an earlier lesson's brief and rubric.
    const scored = (o: BuildTarget) => o.kind === 'assignments' && position(o.lessonId) < position(t.lessonId) && pieces(o.lessonId).some((key) => key.startsWith('inclass:'));
    if (t.kind === 'plan') return queued.some(scored) || waiting.some((o) => position(o.lessonId) < position(t.lessonId) && !drafts.has(o.lessonId));
    if (t.kind === 'assignments' && queued.some((o) => o.kind === 'assignments' && position(o.lessonId) < position(t.lessonId) && shares(o.lessonId, t.lessonId))) return true;
    // Each is shown what came before it: graded work the quiz (beside it, both set the same problems), the guide and the FAQ the keys.
    if (t.kind === 'facts' || factsWait(t, queued) || (t.kind === 'rubrics' && rubricsWait(t, queued, position))) return t.kind !== 'facts';
    const kind = t.kind;
    return kind !== 'rubrics' && (queued.some((o) => (AFTER[kind] ?? []).includes(o.kind) && o.lessonId === t.lessonId) || (BUILT_ON_PLAN.has(kind) && waiting.some((o) => o.lessonId === t.lessonId)));
  };

  // A plan that failed takes with it what would be written from it: written without, those parts would look
  // finished and be wrong. They stay missing, for Resume to write once the plan is.
  const failedPlans = new Map<string, InferenceError>();
  const dropUnplanned = (): void => {
    // Later plans go with it too: each is written from what the lessons before it hold, and one written past a gap
    // (week 13 without week 12) is wrong in ways nobody sees. Resume writes them in order.
    const first = Math.min(...[...failedPlans.keys()].map(position));
    for (const t of pending) if (t.kind === 'plan' && position(t.lessonId) > first && !failedPlans.has(t.lessonId)) failedPlans.set(t.lessonId, failedPlans.values().next().value!);
    for (let i = pending.length - 1; i >= 0; i--) {
      const t = pending[i]!;
      const error = t.kind !== 'rubrics' && t.kind !== 'facts' && (BUILT_ON_PLAN.has(t.kind) || t.kind === 'plan') ? failedPlans.get(t.lessonId) : undefined;
      if (!error) continue;
      pending.splice(i, 1);
      summary.failed += 1;
      host.onEvent?.({ type: 'error', target: t, error });
    }
  };

  const readWhole = lastReads(host, targets, pending, running);

  const start = (t: BuildTarget): void => {
    const key = targetKey(t);
    const failed = (error: InferenceError) => void (t.kind === 'plan' && failedPlans.set(t.lessonId, error));
    const view = () => withDrafts(host.getCourse(), drafts);
    const job = runOne(host, t, summary, failed, t.kind === 'plan' ? { view, drafted } : undefined);
    running.set(key, job.finally(() => (running.delete(key), t.kind === 'plan' && drafts.delete(t.lessonId))));
  };

  // Until nothing is left to start and nothing runs: asked "while something is queued or running", the loop ended as the last
  // part came in, and the last lesson of every build went unread.
  while (!summary.fatal) {
    if (host.signal.aborted) break;
    dropUnplanned();
    let index = pending.findIndex((t) => !blocked(t));
    while (index >= 0 && running.size < limit) {
      start(pending.splice(index, 1)[0]!);
      index = pending.findIndex((t) => !blocked(t));
    }
    if (!failedPlans.size) readWhole();
    if (running.size === 0) break;
    await Promise.race([...running.values(), new Promise<void>((resolve) => (wake = resolve))]);
  }
  await Promise.allSettled(running.values());
  summary.stopped = host.signal.aborted || summary.fatal?.kind === 'aborted';
  return summary;
}

function parseKey(key: string): BuildTarget {
  const [lessonId, kind] = key.split(':') as [string, GeneratedKind];
  return { lessonId, kind };
}

/** What a plan's job needs beside the rest: the course with the plans before it as first written, and where to say its own is. */
interface Pipeline {
  view: () => Course;
  drafted: (lessonId: string, commands: Command[]) => void;
}

async function runOne(host: BuildHost, target: BuildTarget, summary: BuildSummary, failed: (error: InferenceError) => void, pipeline?: Pipeline): Promise<void> {
  const course = pipeline?.view() ?? host.getCourse();
  if (!stillWanted(course, target) || summary.fatal) return;
  host.onEvent?.({ type: 'start', target });
  try {
    const onProgress = host.onProgress ? (progress: SectionProgress) => host.onProgress!(target, progress) : undefined;
    const options = { reviewer: host.reviewer, run: host.run, onProgress, latest: pipeline?.view, onDraft: pipeline ? (commands: Command[]) => pipeline.drafted(target.lessonId, commands) : undefined };
    // Asked once more before it counts as failed: a part that fails holds back what is written from it, and most failures do not happen twice.
    const kind = target.kind;
    // Its facts could not be settled: nothing of the lesson is written from a guess. It stays to be run.
    if (kind !== 'facts' && kind !== 'rubrics' && kind !== 'plan' && needsFacts(host.getCourse(), host.getCourse().lessons[target.lessonId]!)) throw new InferenceError('invalid', 'This lesson’s facts could not be settled, so nothing was written from them.');
    const write = () => (kind === 'rubrics' || kind === 'facts' ? (kind === 'rubrics' ? lessonRubrics : lessonFacts)(host.inference, host.getCourse(), target.lessonId, host.signal).then((commands) => ({ commands, flagged: 0 })) : generateSection(host.inference, course, target.lessonId, kind, host.signal, options));
    const result = await write().catch((error: unknown) => (error instanceof InferenceError && AGAIN.has(error.kind) && !host.signal.aborted ? write() : Promise.reject(error)));
    if (host.signal.aborted) throw new InferenceError('aborted', 'Stopped.');
    if (!stillWanted(host.getCourse(), target)) return;
    host.commit(target, result.commands);
    summary.built += 1;
    summary.flagged += result.flagged > 0 ? 1 : 0;
    host.onEvent?.({ type: 'done', target, flagged: result.flagged });
  } catch (error) {
    const err = error instanceof InferenceError ? error : new InferenceError('invalid', String(error));
    if (FATAL.has(err.kind)) summary.fatal ??= err;
    else summary.failed += 1;
    failed(err);
    host.onEvent?.({ type: 'error', target, error: err });
  }
}
