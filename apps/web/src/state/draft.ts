import { CORE_SET, MATERIAL_KINDS, type Language, type MaterialKind } from '@folio/core';
import { create } from 'zustand';

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

/** A file named like a syllabus, for when the model could not say which attached file is one. */
export const looksLikeSyllabus = (title: string) => /syllab|course (outline|schedule)/i.test(title);

/**
 * The attached file that is the course's own syllabus: as the model read it, and "none is" stands. Only when
 * the files could not be read at all (`read` is null) is it told by its name.
 */
export function ownSyllabus(read: { syllabus: string } | null, sources: readonly { title: string }[]): string | undefined {
  return (read ? read.syllabus : sources.find((s) => looksLikeSyllabus(s.title))?.title) || undefined;
}

type Guesses = typeof import('../lib/brief');
let guesses: Guesses | null = null;
let loading: Promise<Guesses> | null = null;

/**
 * The brief's parsers load after the page, not with it: the chips only follow the text once there is text. They
 * are fetched when the browser is idle, and at the first keystroke at the latest.
 */
export function loadGuesses(): Promise<Guesses> {
  loading ??= import('../lib/brief').then((m) => (guesses = m));
  return loading;
}

/** Chips the teacher hasn't set by hand follow the brief (and, for lessons, the attached files). */
function follow(g: Guesses): void {
  const { brief, files, pinned, set } = useDraft.getState();
  const patch: Partial<Draft> = {};
  if (!pinned.lessons) {
    const n = g.guessLessons(brief);
    if (n) patch.lessons = n;
    // A count in the brief is the teacher's word; without one, an attached syllabus says how many.
    patch.lessonsFromFiles = !n && files.length > 0;
  }
  if (!pinned.level) patch.level = g.guessLevel(brief) ?? '';
  set(patch);
}

/** Update the brief; chips the teacher hasn't set by hand follow the text. */
export function setBrief(brief: string): void {
  useDraft.getState().set({ brief });
  if (guesses) follow(guesses);
  else void loadGuesses().then(follow);
}

/** Attach or remove files; unless the teacher set the lessons, a syllabus then says how many there are. */
export function setFiles(files: Draft['files']): void {
  useDraft.getState().set({ files, ...(files.length ? {} : { lessonsFromFiles: false }) });
  if (guesses) follow(guesses);
  else void loadGuesses().then(follow);
}
