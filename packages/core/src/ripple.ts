import { filledTexts, isBlankSegment, statedObjectives } from './blank';
import { orderedLessons } from './course';
import type { Flag } from './flags';
import { hashValue } from './ids';
import { sectionFor, type GeneratedKind, type MaterialKind } from './materials';
import type { Basis, Course, Lesson } from './schema';

/**
 * Ripple: generated content records hashes of the inputs it was built from.
 * When an input changes, the content is "out of date" until the teacher
 * updates it or chooses to keep it. Nothing is ever rewritten silently.
 */

export type BasisKey = 'lesson' | 'readings' | 'objectives' | 'minutes' | 'quizSize' | 'audience' | 'plan' | 'sources';

const DEPENDENCIES: Record<GeneratedKind, readonly BasisKey[]> = {
  plan: ['lesson', 'readings', 'objectives', 'minutes', 'audience', 'sources'],
  slides: ['lesson', 'objectives', 'audience', 'plan'],
  study: ['lesson', 'objectives', 'audience', 'plan'],
  quiz: ['lesson', 'objectives', 'quizSize', 'audience', 'sources', 'plan'],
  assignments: ['lesson', 'objectives', 'audience', 'plan'],
  discussions: ['lesson', 'readings', 'objectives', 'audience'],
  faq: ['lesson', 'audience'],
};

export function dependenciesOf(kind: GeneratedKind): readonly BasisKey[] {
  return DEPENDENCIES[kind];
}

function inputHash(course: Course, lesson: Lesson, key: BasisKey): string {
  switch (key) {
    case 'lesson':
      return hashValue([lesson.title, lesson.summary]);
    case 'readings':
      // Only the plan and discussions build on the reading. A section stamped before readings existed has no
      // 'readings' in its basis, so it stays up to date until it is next built.
      return hashValue(filledTexts(lesson.readings));
    case 'objectives':
      // A blank objective is still being written: it changes nothing until it has text.
      return hashValue(statedObjectives(course, lesson).map((o) => o.text));
    case 'minutes':
      return hashValue(course.shape.minutesPerLesson);
    case 'quizSize':
      return hashValue(course.shape.quizSize);
    case 'audience':
      return hashValue([course.audience.level, course.audience.subject, course.language]);
    case 'plan':
      return hashValue([filledTexts(lesson.keyIdeas), lesson.segments.filter((s) => !isBlankSegment(s)).map((s) => [s.title, s.description])]);
    case 'sources':
      return hashValue(course.sourceOrder.map((id) => [id, course.sources[id]?.text.length ?? 0]));
  }
}

export function computeBasis(course: Course, lesson: Lesson, kind: GeneratedKind): Basis {
  const basis: Basis = {};
  for (const key of DEPENDENCIES[kind]) basis[key] = inputHash(course, lesson, key);
  return basis;
}

/** Which inputs changed since the section was built. Empty means up to date. */
export function staleReasons(course: Course, lesson: Lesson, kind: GeneratedKind): BasisKey[] {
  const meta = lesson.gen[kind];
  if (!meta) return [];
  const now = computeBasis(course, lesson, kind);
  return DEPENDENCIES[kind].filter((key) => meta.basis[key] !== undefined && meta.basis[key] !== now[key]);
}

export type CellState = 'off' | 'empty' | 'ready' | 'attention' | 'stale';

/** The state of one map cell, before any in-flight build status is layered on. */
export function cellState(course: Course, lesson: Lesson, kind: MaterialKind): CellState {
  if (!course.materials[kind].enabled) return 'off';
  const section = sectionFor(kind);
  if (!section) return 'ready';
  const meta = lesson.gen[section];
  if (!meta) return 'empty';
  if (staleReasons(course, lesson, section).length > 0) return 'stale';
  if (meta.flags.length > 0 || itemFlags(course, lesson, kind).length > 0) return 'attention';
  return 'ready';
}

/** Per-item "needs a look" notes within one lesson and material. */
export function itemFlags(course: Course, lesson: Lesson, kind: MaterialKind): { id: string; flags: Flag[] }[] {
  const out: { id: string; flags: Flag[] }[] = [];
  const want = kind === 'quiz' ? 'question' : kind === 'assignments' ? 'assignment' : kind === 'discussions' ? 'discussion' : null;
  if (want) {
    for (const id of lesson.taskIds) {
      const task = course.tasks[id];
      if (task && task.kind === want && task.flags.length > 0) out.push({ id, flags: task.flags });
    }
  }
  if (kind === 'faq') {
    for (const id of lesson.faqIds) {
      const entry = course.faq[id];
      if (entry && entry.flags.length > 0) out.push({ id, flags: entry.flags });
    }
  }
  return out;
}

export interface StaleItem {
  lessonId: string;
  kind: GeneratedKind;
  reasons: BasisKey[];
  edited: boolean;
}

export function staleItems(course: Course): StaleItem[] {
  const out: StaleItem[] = [];
  for (const lesson of orderedLessons(course)) {
    for (const kind of Object.keys(lesson.gen) as GeneratedKind[]) {
      if (!course.materials[kind].enabled && !(kind === 'assignments' && course.materials.rubrics.enabled)) continue;
      const reasons = staleReasons(course, lesson, kind);
      if (reasons.length) out.push({ lessonId: lesson.id, kind, reasons, edited: lesson.gen[kind]?.edited ?? false });
    }
  }
  return out;
}

export interface AttentionItem {
  lessonId: string;
  kind: GeneratedKind;
  itemId: string | null;
  flags: Flag[];
}

export function attentionItems(course: Course): AttentionItem[] {
  const out: AttentionItem[] = [];
  for (const lesson of orderedLessons(course)) {
    for (const kind of Object.keys(lesson.gen) as GeneratedKind[]) {
      const meta = lesson.gen[kind];
      if (meta && meta.flags.length > 0) out.push({ lessonId: lesson.id, kind, itemId: null, flags: meta.flags });
      for (const item of itemFlags(course, lesson, kind)) {
        out.push({ lessonId: lesson.id, kind, itemId: item.id, flags: item.flags });
      }
    }
  }
  return out;
}
