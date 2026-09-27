import { enabledKinds, type Audience, type Course, type MaterialKind } from '@folio/core';
import type { ExportFormat } from '@folio/export';

export type Scope = 'whole' | 'lesson' | 'selected';
export type FormatChoice = ExportFormat | 'pdf' | 'google';

export interface ExportChoice {
  scope: Scope;
  lessonId: string;
  kinds: MaterialKind[];
  audience: Audience;
  format: FormatChoice;
}

/**
 * Where the drawer starts: the whole course, or, when it is opened from a
 * lesson, that one lesson. The teacher copy as a Word file either way.
 */
export function initialChoice(course: Course, lessonId: string | undefined): ExportChoice {
  const here = lessonId && course.lessons[lessonId] ? lessonId : undefined;
  return { scope: here ? 'lesson' : 'whole', lessonId: here ?? course.lessonOrder[0] ?? '', kinds: enabledKinds(course), audience: 'teacher', format: 'docx' };
}

export const FORMATS: FormatChoice[] = ['docx', 'pdf', 'pptx', 'xlsx', 'zip', 'folio', 'google'];

/** Which materials an export covers, given the scope and format. */
export function kindsFor(course: Course, choice: ExportChoice): MaterialKind[] {
  const enabled = enabledKinds(course);
  if (choice.format === 'pptx') return ['slides'];
  if (choice.format === 'xlsx' || choice.format === 'csv') return ['quiz'];
  if (choice.scope === 'selected') return enabled.filter((k) => choice.kinds.includes(k));
  if (choice.scope === 'lesson') return enabled.filter((k) => k !== 'map' && k !== 'syllabus');
  return enabled;
}

export function lessonIdsFor(choice: ExportChoice): string[] | undefined {
  return choice.scope === 'lesson' && choice.lessonId ? [choice.lessonId] : undefined;
}

export const googleClientId = (): string => (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? '';
