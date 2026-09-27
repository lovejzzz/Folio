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

export const FORMATS: FormatChoice[] = ['docx', 'pdf', 'pptx', 'xlsx', 'zip', 'folio', 'google'];

/** A Folio file is always the whole course with answers, whatever was chosen before. */
export function effectiveChoice(choice: ExportChoice): ExportChoice {
  return choice.format === 'folio' ? { ...choice, scope: 'whole', audience: 'teacher' } : choice;
}

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
