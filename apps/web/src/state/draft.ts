import { CORE_SET, MATERIAL_KINDS, type Language, type MaterialKind } from '@folio/core';
import { create } from 'zustand';
import { guessLessons, guessLevel } from '../lib/brief';

/** The new-course brief, kept while the outline is drafted. */
interface Draft {
  brief: string;
  level: string;
  lessons: number;
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
  }
  if (!pinned.level) patch.level = guessLevel(brief) ?? '';
  set(patch);
}
