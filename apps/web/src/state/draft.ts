import { CORE_SET, MATERIAL_KINDS, type Language, type MaterialKind } from '@folio/core';
import { create } from 'zustand';
import { guessLessons, guessLevel } from '../lib/brief';

/** The new-course brief, kept while the outline is drafted. */
interface Draft {
  brief: string;
  level: string;
  lessons: number;
  /** The number of lessons is read from the attached syllabus, not chosen. */
  lessonsFromFiles: boolean;
  language: Language;
  /** Chips the teacher set by hand stop following the text. */
  pinned: { level: boolean; lessons: boolean };
  files: { title: string; text: string }[];
  materials: MaterialKind[];
  set: (patch: Partial<Omit<Draft, 'set'>>) => void;
  reset: () => void;
}

const initial = {
  brief: '',
  level: '',
  lessons: 4,
  lessonsFromFiles: false,
  language: 'en' as Language,
  pinned: { level: false, lessons: false },
  files: [],
  materials: [...MATERIAL_KINDS],
};

export const useDraft = create<Draft>((set) => ({
  ...initial,
  set: (patch) => set(patch),
  reset: () => set(initial),
}));

export const CORE_MATERIALS = CORE_SET;

/** Update the brief; chips the teacher hasn't set by hand follow the text. */
export function setBrief(brief: string): void {
  const { pinned, set } = useDraft.getState();
  const patch: Partial<Draft> = { brief };
  if (!pinned.lessons) {
    const n = guessLessons(brief);
    if (n) patch.lessons = n;
    // A count in the brief is the teacher's word; without one, an attached syllabus says how many.
    patch.lessonsFromFiles = !n && useDraft.getState().files.length > 0;
  }
  if (!pinned.level) patch.level = guessLevel(brief) ?? '';
  set(patch);
}

/** Attach or remove files; unless the teacher set the lessons, a syllabus then says how many there are. */
export function setFiles(files: Draft['files']): void {
  const { pinned, brief, set } = useDraft.getState();
  const patch: Partial<Draft> = { files };
  if (!pinned.lessons && !guessLessons(brief)) patch.lessonsFromFiles = files.length > 0;
  if (!files.length) patch.lessonsFromFiles = false;
  set(patch);
}
