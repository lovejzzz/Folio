/** Grades K to 5, where the grading table is the teacher's, not a slide for seven-year-olds ("100% of the unit grade"). */
export const isElementary = (level: string): boolean => /\bgrades? (?:[1-5]|k)\b|kindergarten|\bk-5\b|elementary|primary school/i.test(level);
