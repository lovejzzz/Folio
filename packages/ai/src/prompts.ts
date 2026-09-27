import { SHAPE_LIMITS, lessonNumber, orderedLessons, statedObjectives, type Course, type Language, type Lesson } from '@folio/core';

/**
 * Prompt templates. Each has a version so evaluation results can be tied to
 * the exact wording. Prompts are written as plain guidance, not rule lists.
 */

export const PROMPT_VERSION = 'folio-prompts@4';

const SOURCE_BUDGET = 12000;

function languageLine(language: Language, locale: string): string {
  if (language === 'zh-CN') return 'Write every piece of text in Simplified Chinese (简体中文), with natural Chinese classroom phrasing.';
  const where = /^en-/i.test(locale) ? ` The teacher's locale is ${locale}: use its spelling, currency and units unless the brief says otherwise.` : '';
  return `Write in clear English suited to the level of the students. Use sentence case for titles and headings (capitalise only the first word and names).${where}`;
}

export function systemPrompt(language: Language, locale = ''): string {
  return [
    'You help a teacher build a course in Folio, a tool that turns one course document into lesson plans, slides, quizzes and other classroom materials.',
    'Write material a teacher could use tomorrow: specific to the subject, with real examples, real terms, real numbers and correct facts. Never write placeholders such as "Topic 1", "key concept" or "Session 1 topic"; name the actual content.',
    'Match the level of the students. Keep sentences short and concrete. Do not use emoji.',
    'If something in the brief is ambiguous, choose the most sensible specific interpretation and stay consistent with it.',
    'Folio shows lesson numbers, the number of lessons, lesson lengths and quiz sizes itself, and teachers change them. Never write them into titles, bullets, speaker notes or summaries ("lesson 1 of 4", "6 minutes", "a 5-question quiz"); refer to another lesson by its title.',
    languageLine(language, locale),
    'Reply with JSON that matches the provided schema and nothing else.',
  ].join('\n\n');
}

export interface OutlineInput {
  brief: string;
  lessonCount: number;
  minutesPerLesson: number;
  level: string;
  language: Language;
  sources: { title: string; text: string }[];
}

function clip(text: string, budget: number): string {
  return text.length <= budget ? text : `${text.slice(0, budget)}\n[…the rest of this source is not shown]`;
}

export function outlinePrompt(input: OutlineInput): string {
  const parts = [
    `The teacher wrote: """${input.brief.trim()}"""`,
    `Plan exactly ${input.lessonCount} lessons of ${input.minutesPerLesson} minutes each${input.level ? ` for ${input.level}` : ''}.`,
    'Order the lessons so each builds on the last. Give each lesson a short title that names what is taught, a one-sentence summary of under 25 words, and one to three measurable objectives of under 15 words each.',
    'Do not mention the lesson length, the number of quiz questions or which materials a lesson has: Folio keeps those as settings the teacher can change, so they must not be repeated in the text.',
  ];
  if (input.sources.length) {
    const each = Math.floor(SOURCE_BUDGET / input.sources.length);
    parts.push('The teacher attached these sources. Base the course on them where they apply:');
    for (const s of input.sources) parts.push(`## ${s.title}\n${clip(s.text, each)}`);
  }
  return parts.join('\n\n');
}

/** Passages numbered across all sources so the model can cite them. */
export function numberedPassages(course: Course): { n: number; sourceId: string; passageId: string; text: string }[] {
  const out: { n: number; sourceId: string; passageId: string; text: string }[] = [];
  for (const id of course.sourceOrder) {
    const source = course.sources[id];
    if (!source) continue;
    for (const p of source.passages) {
      out.push({ n: out.length + 1, sourceId: id, passageId: p.id, text: source.text.slice(p.start, p.end) });
    }
  }
  return out;
}

function sourcesBlock(course: Course): string {
  const passages = numberedPassages(course);
  if (!passages.length) return '';
  let used = 0;
  const lines: string[] = [];
  for (const p of passages) {
    if (used + p.text.length > SOURCE_BUDGET) break;
    used += p.text.length;
    lines.push(`[${p.n}] ${p.text}`);
  }
  return `Teacher's sources (numbered passages):\n${lines.join('\n')}`;
}

export function courseContext(course: Course, lesson: Lesson): string {
  const n = lessonNumber(course, lesson.id);
  const all = orderedLessons(course)
    .map((l, i) => `${i + 1}. ${l.title}${l.id === lesson.id ? '  ← this lesson' : ''}`)
    .join('\n');
  const objectives = statedObjectives(course, lesson)
    .map((o, i) => `${i + 1}. ${o.text}`)
    .join('\n');
  const audience = [course.audience.level, course.audience.subject].filter(Boolean).join(', ');
  return [
    `Course: ${course.title}${audience ? ` (${audience})` : ''}`,
    course.summary ? `About the course: ${course.summary}` : '',
    `Lessons:\n${all}`,
    `This is lesson ${n}: "${lesson.title}". ${lesson.summary}`,
    objectives ? `Its objectives:\n${objectives}` : '',
    `Each lesson lasts ${course.shape.minutesPerLesson} minutes.`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function planSummary(lesson: Lesson): string {
  if (!lesson.segments.length) return '';
  const ideas = lesson.keyIdeas.map((k) => `- ${k}`).join('\n');
  const flow = lesson.segments.map((s) => `- ${s.title} (${s.minutes} min): ${s.description}`).join('\n');
  return `The lesson plan's key ideas:\n${ideas}\n\nThe lesson runs like this:\n${flow}`;
}

export type SectionPromptKind = 'plan' | 'slides' | 'study' | 'quiz' | 'assignments' | 'discussions' | 'faq';

const asks: Record<SectionPromptKind, (course: Course) => string> = {
  plan: (c) =>
    `Write the lesson plan: two to five key ideas, a sequence of segments (warm-up, teaching, practice, discussion, check, close as fits) whose minutes add up to ${c.shape.minutesPerLesson}, and the vocabulary students need. Each segment description says exactly what happens, with the example to use, in two to four short sentences, each on its own line. Put worked answers, expected responses and common mistakes in the teacher notes (under 60 words), not in the description.`,
  slides: () =>
    'Write a slide deck of five to eight slides that follows the lesson plan. Start with a title slide. Keep bullets short (under ten words), at most five per slide, and put the detail in speaker notes.',
  study: () =>
    'Write a study guide for students to read after the lesson: a short overview, then two to four key points, each with a heading and a clear explanation that includes an example.',
  quiz: (c) =>
    `Write exactly ${c.shape.quizSize} quiz questions that assess this lesson's objectives. Mix formats: mostly multiple choice with four choices and one clearly correct answer, plus short-answer, true/false or numeric questions where they fit. For choice and true/false questions, "answer" must repeat the correct choice exactly. Use plausible wrong choices that reflect real misconceptions, as long, specific and carefully worded as the right one, so the right answer can't be spotted by its length. Never refer to a choice by its letter or position. Write a true/false question as a plain statement, without "True or false:" in front, and make about half of the true/false statements true. Spread the difficulty: mostly 2, with some 1 and at least one 3. For numeric answers, give the calculation in "expression".`,
  assignments: () =>
    'Write one assignment that lets students apply this lesson, with numbered steps, and a rubric: four levels from strongest to weakest with points, and two to four criteria with one descriptor per level.',
  discussions: () =>
    'Write two discussion prompts that make students think and disagree productively, each with up to three follow-up questions for the teacher.',
  faq: () =>
    'Write two or three questions students commonly ask about this lesson, with short, accurate answers.',
};

export function sectionPrompt(course: Course, lesson: Lesson, kind: SectionPromptKind): string {
  const parts = [courseContext(course, lesson)];
  if (kind === 'slides' || kind === 'study') {
    const plan = planSummary(lesson);
    if (plan) parts.push(plan);
  }
  if (kind === 'plan' || kind === 'quiz') {
    const sources = sourcesBlock(course);
    if (sources) parts.push(sources, 'Where a question draws on a passage, give its number in "sourcePassage".');
  }
  parts.push(asks[kind](course));
  return parts.join('\n\n');
}

export type TextAction = 'rewrite' | 'simplify' | 'harder' | 'easier' | 'translate' | 'explain';

const actionAsks: Record<TextAction, (language: Language) => string> = {
  rewrite: () => 'Rewrite the selected text so it reads more clearly. Keep its meaning and length.',
  simplify: () => 'Rewrite the selected text in simpler words for younger or less confident readers. Keep it accurate, and no longer than it is now.',
  harder: () => 'Rewrite the selected text so it is more challenging, for students who need stretch: more precise terms and a sharper demand, not more sentences.',
  easier: () => 'Rewrite the selected text so it is easier, with more support, for students who find this hard.',
  translate: (language) =>
    language === 'zh-CN' ? 'Translate the selected text into English.' : 'Translate the selected text into Simplified Chinese.',
  explain: () => 'Explain the selected text for the teacher in two or three sentences, under 70 words in all: what it means and why it matters here.',
};

export function textActionPrompt(action: TextAction, selection: string, context: string, language: Language): string {
  return [
    `Context: ${context}`,
    `Selected text: """${selection}"""`,
    actionAsks[action](language),
    action === 'explain' || action === 'translate'
      ? ''
      : 'Keep the form of the selection: a title stays a title, a one-line summary stays about one line, a list item stays one item. Keep its spelling conventions (British or American) and its tone.',
    action === 'explain' ? 'Return the explanation.' : 'Return only the replacement text, with no quotation marks.',
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
    `Course: ${course.title} (${course.audience.level || 'no level set'}). Quiz size: ${course.shape.quizSize}. Minutes per lesson: ${course.shape.minutesPerLesson}.`,
    `Lessons:\n${lessons}`,
    `The teacher asks: """${request.trim()}"""`,
    `Limits: ${lessonLimit.min}–${lessonLimit.max} lessons, ${quiz.min}–${quiz.max} questions per quiz, ${minutes.min}–${minutes.max} minutes per lesson.`,
    'Turn the request into the smallest list of operations that does it. Lesson numbers refer to the list above, before any change. If an existing lesson already covers what is asked, prefer changing it over adding a near-copy.',
    'The summary is one short sentence to the teacher saying what will change and why, naming lessons by title (for example that an existing lesson already covers the topic). Do not write in the first person or offer other help. If the request is not about the course structure, return no operations and say in one sentence that Folio can only change the course.',
  ].join('\n\n');
}
