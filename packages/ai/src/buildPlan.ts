import { GENERATED_KINDS, orderedLessons, setsWork, type Course } from '@folio/core';
import { executionPlan, rubricLacking, targetKey, type BuildTarget, type PlannedTask } from './build';
import { needsFacts } from './lessonFacts';
import { BUILT_ON_PLAN } from './prompts';

/**
 * The plan of any build, however it is started: the whole course as it stands (the first build, Resume), or parts
 * asked for by name (one part written again, the failed ones tried again, one material's missing parts). The one
 * account the queue, the count of what is left and the estimate are read from.
 *
 * Parts asked for by name were run as given. A slide deck tried again after its lesson's plan had failed was written
 * with no plan; one tried again in a course without plans, with no facts settled; "rubrics" asked of a lesson whose
 * graded work was never written ran a step that had nothing to score. And the estimate beside the button priced the
 * named parts alone. Here a named part is written whether or not it was before, and brings what it cannot be
 * written without, each marked with the part that needs it; a part the lesson sets no work for is left out and said.
 */
export function buildPlan(course: Course, targets?: readonly BuildTarget[]): PlannedTask[] {
  if (!targets) return executionPlan(course);
  const lessons = orderedLessons(course);
  const number = (lessonId: string) => course.lessonOrder.indexOf(lessonId) + 1;
  const tasks = new Map<string, PlannedTask>();
  // A part asked for by name stands as asked, also where another part would have brought it.
  const add = (t: PlannedTask): void => {
    const held = tasks.get(targetKey(t));
    if (!held || (held.neededBy && !t.neededBy)) tasks.set(targetKey(t), t);
  };
  const asked = new Set(targets.map(targetKey));
  for (const t of targets) {
    const lesson = course.lessons[t.lessonId];
    if (!lesson) continue;
    const base = { lessonId: t.lessonId, lesson: number(t.lessonId) };
    if (t.kind === 'rubrics') {
      // Rubrics alone are for graded work that stands without one. Where the work itself is unwritten the part to
      // run is the work, which comes with its rubric: taken from the course's own plan, so one a teacher keeps as
      // their own, or a lesson that sets none, adds nothing.
      const work = executionPlan(course, [t.lessonId]).find((p) => p.kind === 'assignments' && p.state === 'run');
      if (!lesson.gen.assignments && work) add({ ...work, neededBy: work.neededBy ?? 'rubrics' });
      else add({ ...base, kind: 'rubrics', state: !setsWork(lesson, 'rubrics') ? 'noWork' : rubricLacking(course, lesson) ? 'run' : 'done' });
      continue;
    }
    if (t.kind === 'facts') {
      add({ ...base, kind: 'facts', state: 'run' });
      continue;
    }
    const kind = t.kind;
    if (!setsWork(lesson, kind)) {
      add({ ...base, kind, state: 'noWork' });
      continue;
    }
    if (BUILT_ON_PLAN.has(kind as never)) {
      // Written from the lesson's plan: where plans are chosen and this one is not written, it comes first, and so
      // does every unwritten plan before it, since each is written from the lessons before.
      if (course.materials.plan.enabled && !lesson.gen.plan) for (const l of lessons.slice(0, number(lesson.id))) if (!l.gen.plan && !asked.has(`${l.id}:plan`)) add({ lessonId: l.id, lesson: number(l.id), kind: 'plan', neededBy: kind, state: 'run' });
      // Written without plans: from the lesson's facts, settled first where they are not yet.
      if (needsFacts(course, lesson) && !asked.has(`${lesson.id}:facts`)) add({ ...base, kind: 'facts', neededBy: kind, state: 'run' });
    }
    add({ ...base, kind, state: 'run' });
  }
  const order = (t: PlannedTask) => number(t.lessonId) * 100 + (t.kind === 'facts' ? 0 : t.kind === 'rubrics' ? 50 : 1 + GENERATED_KINDS.indexOf(t.kind));
  return [...tasks.values()].sort((a, b) => order(a) - order(b));
}

/** The parts of a plan a build runs, in order. */
export const toRun = (plan: readonly PlannedTask[]): BuildTarget[] => plan.filter((t) => t.state === 'run').map(({ lessonId, kind }) => ({ lessonId, kind }));
