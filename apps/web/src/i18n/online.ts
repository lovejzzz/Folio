import { en, type Messages } from './en';

/**
 * The same interface for a course taught online on the students' own time: its unit is a week, and its plan is
 * the week's module page. Only the words that would be wrong are replaced.
 */
export const onlineEn: Messages = {
  ...en,
  materials: { ...en.materials, plan: 'Weekly modules' },
  materialOne: { ...en.materialOne, plan: 'Module page' },
  materialInline: { ...en.materialInline, plan: 'module page' },
  common: { ...en.common, lesson: (n: number) => `Week ${n}`, lessons: (n: number) => (n === 1 ? '1 week' : `${n} weeks`) },
};
