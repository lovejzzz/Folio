import { checkSyllabus } from '@folio/ai';
import { cmd, type CourseStore } from '@folio/core';
import { create } from 'zustand';
import { currentInference } from './model';
import { recordUsage } from './spend';

/** Checks tried on their own before the teacher is asked: each costs credits, and a failing one may fail again. */
const AUTO_TRIES = 2;

interface CheckState {
  running: boolean;
  failures: number;
}

/** How each course's syllabus check is going in this tab, for the syllabus page to show. */
export const useSyllabusCheck = create<Record<string, CheckState>>(() => ({}));

/** Failures are remembered across reloads, so reopening the page doesn't pay for the same failing check again. */
const KEY = (courseId: string) => `folio.syllabusCheck.${courseId}`;
function savedFailures(courseId: string): number {
  try {
    return Number(localStorage.getItem(KEY(courseId))) || 0;
  } catch {
    return 0;
  }
}
function saveFailures(courseId: string, failures: number): void {
  try {
    if (failures) localStorage.setItem(KEY(courseId), String(failures));
    else localStorage.removeItem(KEY(courseId));
  } catch {
    // Blocked storage: a reload may try once more, which is harmless.
  }
}

export const checkStateOf = (courseId: string): CheckState => useSyllabusCheck.getState()[courseId] ?? { running: false, failures: savedFailures(courseId) };
function setState(courseId: string, patch: Partial<CheckState>): void {
  const next = { ...checkStateOf(courseId), ...patch };
  if (patch.failures !== undefined) saveFailures(courseId, next.failures);
  useSyllabusCheck.setState({ [courseId]: next });
}

/**
 * Check the syllabus the teacher brought and keep what the check found with the course. Runs when the course is
 * made, and when the syllabus page finds no check yet; after two failures only when the teacher asks (`asked`).
 */
export function checkOwnSyllabus(store: CourseStore, asked = false): void {
  const course = store.getState();
  const state = checkStateOf(course.id);
  const inference = currentInference((u) => recordUsage(course.id, [u]));
  if (!course.syllabus || course.syllabus.check || state.running || !inference) return;
  if (!asked && state.failures >= AUTO_TRIES) return;
  setState(course.id, { running: true });
  void checkSyllabus(inference, course)
    .then((issues) => {
      store.apply([cmd('syllabus.checked', { issues, checkedAt: new Date().toISOString() })], { label: { key: 'editedCourse' }, source: 'ai', silent: true });
      setState(course.id, { running: false, failures: 0 });
    })
    .catch(() => setState(course.id, { running: false, failures: checkStateOf(course.id).failures + 1 }));
}
