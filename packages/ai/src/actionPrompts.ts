import { SHAPE_LIMITS, orderedLessons, statedObjectives, type Course } from '@folio/core';
import { sessionList, type WritingLanguage } from './prompts';

/** The prompts for changing what is already written: a selection of text, or the course's plan. */

export type TextAction = 'rewrite' | 'simplify' | 'harder' | 'easier' | 'translate' | 'explain';

const actionAsks: Record<TextAction, (language: WritingLanguage) => string> = {
  rewrite: () => 'Rewrite the selected text so it reads more clearly. Keep its meaning and length.',
  simplify: () => 'Rewrite the selected text in simpler words for younger or less confident readers. Keep it accurate, and no longer than it is now.',
  harder: () => 'Rewrite the selected text so it is more challenging, for students who need stretch: more precise terms and a sharper demand, not more sentences.',
  easier: () => 'Rewrite the selected text so it is easier, with more support, for students who find this hard.',
  translate: (language) =>
    language === 'en' ? 'Translate the selected text into Spanish.' : 'Translate the selected text into English.',
  explain: () => 'Explain the selected text for the teacher in two or three sentences, under 70 words in all: what it means and why it matters here.',
};

export function textActionPrompt(action: TextAction, selection: string, context: string, language: WritingLanguage): string {
  return [
    `Context: ${context}`,
    `Selected text: """${selection}"""`,
    actionAsks[action](language),
    action === 'explain' || action === 'translate'
      ? ''
      : 'Keep the form of the selection: a title stays a title, a one-line summary stays about one line, a list item stays one item. Keep its spelling conventions (British or American) and its tone.',
    // Worded for the JSON answer: "return only the text" made DeepSeek's JSON mode answer with blank space.
    action === 'explain' ? 'Put the explanation in "text".' : 'Put only the replacement text in "text", with no quotation marks around it.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function coursePlanPrompt(course: Course, request: string): string {
  const { lessons: lessonLimit, quizSize: quiz, minutesPerLesson: minutes } = SHAPE_LIMITS;
  const lessons = orderedLessons(course)
    .map((l, i) => `${i + 1}. ${l.title}: ${statedObjectives(course, l).map((o) => o.text).join('; ')}`)
    .join('\n');
  return [
    `Course: ${course.title} (${course.audience.level || 'no level set'}). Quiz size: ${course.shape.quizSize}. Minutes per lesson: ${course.shape.minutesPerLesson}.${course.shape.sessions.length > 1 ? ` Each lesson meets as ${sessionList(course.shape.sessions)}; setting the minutes replaces these sessions with one class, so do it only when asked for one length for the whole lesson.` : ''}`,
    `Lessons:\n${lessons}`,
    `The teacher asks: """${request.trim()}"""`,
    `Limits: ${lessonLimit.min}–${lessonLimit.max} lessons, ${quiz.min}–${quiz.max} questions per quiz, ${minutes.min}–${minutes.max} minutes per lesson.`,
    'Turn the request into the smallest list of operations that does it. Lesson numbers refer to the list above, before any change. If an existing lesson already covers what is asked, prefer changing it over adding a near-copy. Wording the teacher gives for a title or objective is used exactly as written, in whatever language, never translated or reworded.',
    'The summary is one short sentence to the teacher saying exactly what will change, with the concrete values and lesson titles (for example: every lesson becomes 45 minutes; "Samples and bias" moves after "Picturing a distribution" because it already covers the topic). Never say "as requested" or "the new setting". The preview already lists each change, so the note is only for why the plan differs from the literal request (for example: "“Samples and bias” already covers sampling bias, so no new lesson is added."); leave it empty otherwise. Do not write in the first person or offer other help. If the request is not about the course structure, return no operations and say in one sentence that Folio can only change the course.',
  ].join('\n\n');
}
