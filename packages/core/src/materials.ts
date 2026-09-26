/**
 * The ten materials. Each one is a view of the course document; the order
 * here is the order of map columns, binder tabs and export lists.
 */
export const MATERIAL_KINDS = [
  'map',
  'syllabus',
  'plan',
  'slides',
  'assignments',
  'rubrics',
  'discussions',
  'quiz',
  'study',
  'faq',
] as const;

export type MaterialKind = (typeof MATERIAL_KINDS)[number];

/** Materials whose content is generated per lesson (the rest are pure projections). */
export const GENERATED_KINDS = ['plan', 'slides', 'assignments', 'discussions', 'quiz', 'study', 'faq'] as const;
export type GeneratedKind = (typeof GENERATED_KINDS)[number];

/** Rubrics are produced alongside assignments, so they share its generated section. */
export function sectionFor(kind: MaterialKind): GeneratedKind | null {
  if (kind === 'rubrics') return 'assignments';
  return (GENERATED_KINDS as readonly string[]).includes(kind) ? (kind as GeneratedKind) : null;
}

/** Order materials appear in the lesson view: the order you teach them. */
export const TEACHING_ORDER: readonly MaterialKind[] = [
  'plan',
  'slides',
  'study',
  'quiz',
  'assignments',
  'rubrics',
  'discussions',
  'faq',
];

export const CORE_SET: readonly MaterialKind[] = ['map', 'syllabus', 'plan', 'slides', 'quiz'];

export function isMaterialKind(value: string): value is MaterialKind {
  return (MATERIAL_KINDS as readonly string[]).includes(value);
}
