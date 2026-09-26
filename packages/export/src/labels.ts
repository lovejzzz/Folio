import type { Language, QuestionFormat } from '@folio/core';

/**
 * Words only the exported files need. Like docLabels they follow the course
 * language, because the files end up in the classroom.
 */

export interface ExportLabels {
  slide: (n: number) => string;
  materials: string;
  /** Separator between material names in a file name. */
  join: string;
  formats: Record<QuestionFormat, string>;
  quizHead: { n: string; lesson: string; question: string; format: string; choices: string; answer: string; why: string };
}

const en: ExportLabels = {
  slide: (n) => `Slide ${n}`,
  materials: 'Course materials',
  join: ', ',
  formats: { choice: 'Multiple choice', truefalse: 'True / false', short: 'Short answer', numeric: 'Numeric' },
  quizHead: {
    n: '#',
    lesson: 'Lesson',
    question: 'Question',
    format: 'Format',
    choices: 'Choices',
    answer: 'Answer',
    why: 'Explanation',
  },
};

const zh: ExportLabels = {
  slide: (n) => `第 ${n} 页`,
  materials: '课程材料',
  join: '、',
  formats: { choice: '选择题', truefalse: '判断题', short: '简答题', numeric: '计算题' },
  quizHead: { n: '#', lesson: '课时', question: '题目', format: '题型', choices: '选项', answer: '答案', why: '解析' },
};

export function exportLabels(language: Language): ExportLabels {
  return language === 'zh-CN' ? zh : en;
}

/** "A", "B", … "Z", "AA": the letter for the i-th choice (0-based). */
export function choiceLetter(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}
