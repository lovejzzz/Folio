import { lessonNumber, type Command, type Course, type MaterialKind } from '@folio/core';
import { edit } from '../state/edit';

/** Commit teacher edits to one lesson's material with a readable history label. */
export function useSectionEdit(course: Course, lessonId: string, kind: MaterialKind): (commands: Command[]) => void {
  const n = lessonNumber(course, lessonId);
  return (commands) => edit(commands, { key: 'editedMaterial', values: { kind, n } });
}
