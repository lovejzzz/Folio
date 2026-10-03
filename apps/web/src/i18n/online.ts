import { en, type Messages } from './en';

/**
 * The same interface for a course taught online on the students' own time: its unit is a week, its plan is the
 * week's module page, and its materials are named as a student meets them. Only the words that would be wrong
 * are replaced.
 */
export const onlineEn: Messages = {
  ...en,
  materials: { ...en.materials, plan: 'Weekly modules', quiz: 'Self-checks', discussions: 'Forum prompts', study: 'Recaps', faq: 'Stuck?' },
  materialOne: { ...en.materialOne, plan: 'Module page', quiz: 'Self-check', discussions: 'Forum prompt', study: 'Recap', faq: 'Stuck?' },
  materialInline: { ...en.materialInline, plan: 'module page', quiz: 'self-check', discussions: 'forum prompt', study: 'recap', faq: 'Stuck? list' },
  common: { ...en.common, lesson: (n: number) => `Week ${n}`, lessons: (n: number) => (n === 1 ? '1 week' : `${n} weeks`) },
  map: { ...en.map, lessonColumn: 'Week' },
};
