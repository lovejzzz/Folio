/**
 * Words for reading the brief and asking about it, kept out of the first-load catalog: only the new-course
 * screen, which loads on its own, uses them.
 */
export const clarifyText = {
  reading: 'Reading your course…',
  readingNote: 'Folio checks what’s clear, and asks about anything that isn’t.',
  eyebrow: 'A few questions before planning',
  progress: (n: number, of: number) => `${n} of ${of}`,
  progressLabel: (n: number, of: number) => `Question ${n} of ${of}`,
  answers: 'Answers',
  other: 'Something else',
  otherPlaceholder: 'Write your own answer…',
  back: 'Back',
  next: 'Next',
  skip: 'Skip',
  finish: 'Plan the course',
  skipAll: 'Skip the questions',
  /** Measured: about ten seconds for a unit, forty-five for a 28-lesson semester. */
  draftingNote: (lessons: number | null) =>
    lessons === null
      ? 'A long syllabus can take up to a minute.'
      : lessons <= 8
        ? 'This usually takes about ten seconds.'
        : `About ${Math.round((5 + lessons * 1.4) / 5) * 5} seconds for ${lessons} lessons.`,
};
