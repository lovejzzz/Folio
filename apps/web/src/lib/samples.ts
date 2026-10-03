/**
 * The sample courses, each written by Folio from a teacher's brief (scripts/make-samples.ts), read through and
 * corrected (scripts/edit-samples.ts), and served from public/samples/<name>.json. School courses are planned
 * as units, university ones as a semester, so each is the size a teacher there would plan.
 */
export const STAGES = ['elementary', 'middle', 'high', 'university'] as const;
export type Stage = (typeof STAGES)[number];

export const SAMPLES = {
  elementary: { stage: 'elementary', title: 'Plant and animal life cycles', detail: 'Grade 2 science · 10 lessons' },
  'water-cycle': { stage: 'elementary', title: 'The water cycle', detail: 'Grade 5 science · 5 lessons, from a teacher’s notes' },
  ratios: { stage: 'middle', title: 'Ratios and rates', detail: 'Grade 6 math · 8 lessons, quizzes and a unit test' },
  middle: { stage: 'middle', title: 'Writing argumentative essays', detail: 'Grade 8 English · 15 lessons, two articles' },
  chemistry: { stage: 'high', title: 'Stoichiometry', detail: 'Grade 10 chemistry · 10 lessons, two labs' },
  reconstruction: { stage: 'high', title: 'Reconstruction, 1865–1877', detail: 'Grade 11 US history · 8 lessons, sources and an essay' },
  university: { stage: 'university', title: 'Introduction to ethics', detail: 'First-year university · a 14-week semester' },
} as const satisfies Record<string, { stage: Stage; title: string; detail: string }>;

export type SampleName = keyof typeof SAMPLES;

export const SAMPLE_NAMES = Object.keys(SAMPLES) as SampleName[];
