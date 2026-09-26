import { lessonNumber, type Command, type Course, type MaterialKind } from '@folio/core';
import { useT } from '../i18n';
import { edit } from '../state/edit';

/** Commit teacher edits to one lesson's material with a readable history label. */
export function useSectionEdit(course: Course, lessonId: string, kind: MaterialKind): (commands: Command[]) => void {
  const t = useT();
  const n = lessonNumber(course, lessonId);
  return (commands) => edit(commands, { key: 'editedMaterial', values: { material: t.materialOne[kind], n } });
}
