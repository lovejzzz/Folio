/**
 * The sample courses, one for each stage, each written by Folio from a teacher's brief (scripts/make-samples.ts)
 * and served from public/samples/<name>.json. School courses are planned as units, university ones as a
 * semester, so each is the size a teacher there would plan.
 */
export const SAMPLES = {
  elementary: 'Plant and animal life cycles · Grade 2 science · a 10-lesson unit',
  middle: 'Writing argumentative essays · Grade 8 English · a 15-lesson unit',
  university: 'Introduction to ethics · First-year university · a 14-week semester',
} as const;

export type SampleName = keyof typeof SAMPLES;

export const SAMPLE_NAMES = Object.keys(SAMPLES) as SampleName[];
