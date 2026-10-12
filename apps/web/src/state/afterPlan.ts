import { buildPlan, missingTargets, targetKey, type BuildTarget, type PlannedTask } from '@folio/ai';
import { staleItems, type Course, type GeneratedKind } from '@folio/core';

/**
 * What follows a change to the course asked for in words, once its steps are applied: the parts written again because
 * what they were written from changed, the parts a build then writes for the first time, and the parts left as the
 * teacher changed them. Read once from the course as the steps leave it, and used twice: the preview says it and prices
 * it, and Apply runs it. Before this the preview named the steps alone ("Include study guides") and Apply went on to
 * write two study guides nobody had been shown, or shown a price for.
 */
export interface AfterPlan {
  /** Written again, each alone: out of date by the change, and not the teacher's own. */
  updates: { lessonId: string; kind: GeneratedKind }[];
  /** Whether a build follows, and its plan as the build itself makes it: every part of the course not yet written. */
  build: PlannedTask[];
  /** Everything that runs, once each, in the plan's own terms: what the estimate is read from. */
  tasks: PlannedTask[];
  /** Out of date by the change and changed by the teacher: left as they are, and marked for the teacher to decide. */
  kept: { lessonId: string; kind: GeneratedKind }[];
}

const staleKey = (s: { lessonId: string; kind: string }) => `${s.lessonId}:${s.kind}`;

/** `course` is the course with the steps applied; `before` names what was out of date already (and is left to the teacher). */
export function afterPlan(course: Course, before: ReadonlySet<string>): AfterPlan {
  const fresh = staleItems(course).filter((s) => !before.has(staleKey(s)));
  const updates = fresh.filter((s) => !s.edited).map(({ lessonId, kind }) => ({ lessonId, kind }));
  const build = missingTargets(course).length ? buildPlan(course).filter((t) => t.state === 'run') : [];
  const seen = new Set<string>();
  const tasks = [...buildPlan(course, updates as BuildTarget[]).filter((t) => t.state === 'run'), ...build].filter((t) => !seen.has(targetKey(t)) && Boolean(seen.add(targetKey(t))));
  return { updates, build, tasks, kept: fresh.filter((s) => s.edited).map(({ lessonId, kind }) => ({ lessonId, kind })) };
}

