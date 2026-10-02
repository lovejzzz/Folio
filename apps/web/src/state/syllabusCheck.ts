import { checkSyllabus } from '@folio/ai';
import { cmd, type CourseStore } from '@folio/core';
import { currentInference } from './model';
import { recordUsage } from './spend';

/** Courses whose syllabus is being checked now: one check each at a time. */
const running = new Set<string>();

/**
 * Check the syllabus the teacher brought, once, and keep what the check found with the course. Runs when the
 * course is made and again whenever the syllabus page finds no check yet (the first one was cut short).
 */
export function checkOwnSyllabus(store: CourseStore): void {
  const course = store.getState();
  const inference = currentInference((u) => recordUsage(course.id, [u]));
  if (!course.syllabus || course.syllabus.check || running.has(course.id) || !inference) return;
  running.add(course.id);
  void checkSyllabus(inference, course)
    .then((issues) => store.apply([cmd('syllabus.checked', { issues, checkedAt: new Date().toISOString() })], { label: { key: 'editedCourse' }, source: 'ai', silent: true }))
    .catch(() => {
      // Tried again the next time the syllabus page opens.
    })
    .finally(() => running.delete(course.id));
}
