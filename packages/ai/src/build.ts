import { CourseStore, GENERATED_KINDS, lessonPieces, orderedLessons, setsWork, type Command, type Course, type GeneratedKind } from '@folio/core';

/** The lesson still exists and still asks for this section: the teacher may have changed its homework mid-build. */
const stillWanted = (course: Course, t: BuildTarget) => {
  const lesson = course.lessons[t.lessonId];
  return Boolean(lesson && setsWork(lesson, t.kind));
};
import { InferenceError, type Inference } from './inference';
import type { RunOptions } from './runCells';
import { generateSection, type SectionProgress } from './sections';
import { BUILT_ON_PLAN } from './prompts';

export interface BuildTarget {
  lessonId: string;
  kind: GeneratedKind;
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

/** Which sections a material needs. Rubrics are written alongside assignments. */
function wantedKinds(course: Course): GeneratedKind[] {
  return GENERATED_KINDS.filter(
    (k) => course.materials[k].enabled || (k === 'assignments' && course.materials.rubrics.enabled),
  );
}

/** Every enabled section that has not been built yet, lesson by lesson. */
export function missingTargets(course: Course, lessonIds?: readonly string[]): BuildTarget[] {
  const kinds = wantedKinds(course);
  const lessons = orderedLessons(course).filter((l) => !lessonIds || lessonIds.includes(l.id));
  // A lesson that sets no homework has no assignment to write.
  return lessons.flatMap((l) => kinds.filter((kind) => !l.gen[kind] && setsWork(l, kind)).map((kind) => ({ lessonId: l.id, kind })));
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
 * Run section jobs with a small concurrency limit, in lesson order, so the
 * map fills from the top. Sections written from the lesson plan wait for it.
 */
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
  const pieces = (lessonId: string) => {
    const lesson = host.getCourse().lessons[lessonId];
    return lesson ? lessonPieces(lesson).map((p) => `${p.kind}:${p.toward.trim()}`) : [];
  };
  const shares = (a: string, b: string) => pieces(a).some((key) => pieces(b).includes(key));
  // Plans written and not yet checked, and something to wake the queue when one arrives.
  const drafts = new Map<string, Command[]>();
  let wake = () => {};
  const drafted = (lessonId: string, commands: Command[]) => (drafts.set(lessonId, commands), wake());
  const blocked = (t: BuildTarget): boolean => {
    const queued = [...pending, ...[...running.keys()].map(parseKey)];
    const waiting = queued.filter((o) => o.kind === 'plan');
    if (t.kind === 'plan') return waiting.some((o) => position(o.lessonId) < position(t.lessonId) && !drafts.has(o.lessonId));
    if (t.kind === 'assignments' && queued.some((o) => o.kind === 'assignments' && position(o.lessonId) < position(t.lessonId) && shares(o.lessonId, t.lessonId))) return true;
    return BUILT_ON_PLAN.has(t.kind) && waiting.some((o) => o.lessonId === t.lessonId);
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
      const error = BUILT_ON_PLAN.has(t.kind) || t.kind === 'plan' ? failedPlans.get(t.lessonId) : undefined;
      if (!error) continue;
      pending.splice(i, 1);
      summary.failed += 1;
      host.onEvent?.({ type: 'error', target: t, error });
    }
  };

  const start = (t: BuildTarget): void => {
    const key = targetKey(t);
    const failed = (error: InferenceError) => void (t.kind === 'plan' && failedPlans.set(t.lessonId, error));
    const view = () => withDrafts(host.getCourse(), drafts);
    const job = runOne(host, t, summary, failed, t.kind === 'plan' ? { view, drafted } : undefined);
    running.set(key, job.finally(() => (running.delete(key), t.kind === 'plan' && drafts.delete(t.lessonId))));
  };

  while ((pending.length || running.size) && !summary.fatal) {
    if (host.signal.aborted) break;
    dropUnplanned();
    let index = pending.findIndex((t) => !blocked(t));
    while (index >= 0 && running.size < limit) {
      start(pending.splice(index, 1)[0]!);
      index = pending.findIndex((t) => !blocked(t));
    }
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
    const write = () => generateSection(host.inference, course, target.lessonId, target.kind, host.signal, options);
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
