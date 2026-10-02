import type { Course, Lesson, Task } from './schema';

/**
 * A course that passed the schema can still disagree with itself: a file edited by hand, a sync that crossed an
 * older copy, or a bug once fixed can leave an ID listed twice, an order naming a lesson that is gone, or a task
 * pointing at a deleted rubric. Every screen assumes these agree, so they are made to, the same way wherever a
 * course is read: imported, synced down or restored. A course that already agrees comes back unchanged.
 */

/** A record keyed by each entity's own ID; the first of two that share an ID is kept. */
function rekeyed<T extends { id: string }>(record: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const value of Object.values(record)) if (!(value.id in out)) out[value.id] = value;
  return out;
}

/** An order with each ID once, only of what exists, followed by anything that exists but was left out. */
function ordered(ids: string[], exists: (id: string) => boolean, all: string[] = []): string[] {
  const seen = new Set<string>();
  const out = ids.filter((id) => exists(id) && !seen.has(id) && seen.add(id));
  for (const id of all) {
    if (seen.has(id)) continue;
    out.push(id);
    seen.add(id);
  }
  return out;
}

const same = <T>(a: T[], b: T[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Keep the original array when nothing changed, so a healthy course is returned as it came. */
const keep = <T>(before: T[], after: T[]): T[] => (same(before, after) ? before : after);

function normalTask(task: Task, course: Course): Task {
  const objectiveIds = keep(task.objectiveIds, ordered(task.objectiveIds, (id) => id in course.objectives));
  const sourceRefs = task.sourceRefs.filter((r) => course.sources[r.sourceId]?.passages.some((p) => p.id === r.passageId));
  const refs = sourceRefs.length === task.sourceRefs.length ? task.sourceRefs : sourceRefs;
  const rubricGone = task.kind === 'assignment' && task.rubricId !== null && !(task.rubricId in course.rubrics);
  if (objectiveIds === task.objectiveIds && refs === task.sourceRefs && !rubricGone) return task;
  return { ...task, objectiveIds, sourceRefs: refs, ...(rubricGone ? { rubricId: null } : {}) } as Task;
}

function normalLesson(lesson: Lesson, course: Course): Lesson {
  const mine = <T extends { id: string; lessonId: string | null }>(record: Record<string, T>) => Object.values(record).filter((x) => x.lessonId === lesson.id).map((x) => x.id);
  const objectiveIds = keep(lesson.objectiveIds, ordered(lesson.objectiveIds, (id) => id in course.objectives));
  const taskIds = keep(lesson.taskIds, ordered(lesson.taskIds, (id) => course.tasks[id]?.lessonId === lesson.id, mine(course.tasks)));
  const faqIds = keep(lesson.faqIds, ordered(lesson.faqIds, (id) => course.faq[id]?.lessonId === lesson.id, mine(course.faq)));
  if (objectiveIds === lesson.objectiveIds && taskIds === lesson.taskIds && faqIds === lesson.faqIds) return lesson;
  return { ...lesson, objectiveIds, taskIds, faqIds };
}

export function normalizeCourse(input: Course): Course {
  const lessons = rekeyed(input.lessons);
  const course: Course = {
    ...input,
    objectives: rekeyed(input.objectives),
    lessons,
    rubrics: rekeyed(input.rubrics),
    sources: rekeyed(input.sources),
    // A task or FAQ entry of a lesson that is gone has nowhere to be shown.
    tasks: Object.fromEntries(Object.entries(rekeyed(input.tasks)).filter(([, t]) => t.lessonId in lessons)),
    faq: Object.fromEntries(Object.entries(rekeyed(input.faq)).filter(([, f]) => f.lessonId === null || f.lessonId in lessons)),
  };
  course.lessonOrder = keep(input.lessonOrder, ordered(input.lessonOrder, (id) => id in lessons, Object.keys(lessons)));
  course.sourceOrder = keep(input.sourceOrder, ordered(input.sourceOrder, (id) => id in course.sources, Object.keys(course.sources)));
  course.tasks = Object.fromEntries(Object.entries(course.tasks).map(([id, t]) => [id, normalTask(t, course)]));
  course.lessons = Object.fromEntries(Object.entries(lessons).map(([id, l]) => [id, normalLesson(l, course)]));
  if (course.syllabus && !(course.syllabus.sourceId in course.sources)) course.syllabus = null;
  return course;
}
