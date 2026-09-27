import { lessonNumber, type Command, type Course, type Label, type MaterialKind } from '@folio/core';
import { edit } from '../state/edit';

/** The history label for teacher edits to one lesson's material. */
export function sectionLabel(course: Course, lessonId: string, kind: MaterialKind): Label {
  return { key: 'editedMaterial', values: { kind, n: lessonNumber(course, lessonId) } };
}

/** Commit teacher edits to one lesson's material with a readable history label. */
export function useSectionEdit(course: Course, lessonId: string, kind: MaterialKind): (commands: Command[]) => void {
  const label = sectionLabel(course, lessonId, kind);
  return (commands) => edit(commands, label);
}
