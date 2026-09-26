import { GENERATED_KINDS, orderedLessons, type Command, type Course, type GeneratedKind } from '@folio/core';
import { InferenceError, type Inference } from './inference';
import { generateSection } from './sections';

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
  /** Read the latest course before each job so edits made mid-build are respected. */
  getCourse(): Course;
  commit(target: BuildTarget, commands: Command[]): void;
  onEvent?(event: BuildEvent): void;
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
  return lessons.flatMap((l) => kinds.filter((kind) => !l.gen[kind]).map((kind) => ({ lessonId: l.id, kind })));
}

const FATAL = new Set(['auth', 'config', 'aborted']);

/**
 * Run section jobs with a small concurrency limit, in lesson order, so the
 * map fills from the top. Slides and study guides wait for their lesson plan.
 */
export async function runBuild(host: BuildHost, targets: BuildTarget[]): Promise<BuildSummary> {
  const summary: BuildSummary = { built: 0, failed: 0, flagged: 0, stopped: false, fatal: null };
  const pending = [...targets];
  const running = new Map<string, Promise<void>>();
  const limit = host.concurrency ?? 3;

  const blocked = (t: BuildTarget): boolean =>
    (t.kind === 'slides' || t.kind === 'study') &&
    [...pending, ...[...running.keys()].map(parseKey)].some((o) => o.lessonId === t.lessonId && o.kind === 'plan');

  const start = (t: BuildTarget): void => {
    const key = targetKey(t);
    running.set(key, runOne(host, t, summary).finally(() => running.delete(key)));
  };

  while ((pending.length || running.size) && !summary.fatal) {
    if (host.signal.aborted) break;
    let index = pending.findIndex((t) => !blocked(t));
    while (index >= 0 && running.size < limit) {
      start(pending.splice(index, 1)[0]!);
      index = pending.findIndex((t) => !blocked(t));
    }
    if (running.size === 0) break;
    await Promise.race(running.values());
  }
  await Promise.allSettled(running.values());
  summary.stopped = host.signal.aborted || summary.fatal?.kind === 'aborted';
  return summary;
}

function parseKey(key: string): BuildTarget {
  const [lessonId, kind] = key.split(':') as [string, GeneratedKind];
  return { lessonId, kind };
}

async function runOne(host: BuildHost, target: BuildTarget, summary: BuildSummary): Promise<void> {
  const course = host.getCourse();
  if (!course.lessons[target.lessonId] || summary.fatal) return;
  host.onEvent?.({ type: 'start', target });
  try {
    const result = await generateSection(host.inference, course, target.lessonId, target.kind, host.signal);
    if (host.signal.aborted) throw new InferenceError('aborted', 'Stopped.');
    if (!host.getCourse().lessons[target.lessonId]) return;
    host.commit(target, result.commands);
    summary.built += 1;
    summary.flagged += result.flagged > 0 ? 1 : 0;
    host.onEvent?.({ type: 'done', target, flagged: result.flagged });
  } catch (error) {
    const err = error instanceof InferenceError ? error : new InferenceError('invalid', String(error));
    if (FATAL.has(err.kind)) summary.fatal ??= err;
    else summary.failed += 1;
    host.onEvent?.({ type: 'error', target, error: err });
  }
}
