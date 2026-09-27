import { SHAPE_LIMITS, filledTexts, orderedLessons, statedObjectives, type Course, type Language, type Lesson } from '@folio/core';
import type { Effort } from './inference';

/**
 * Prompt templates. Each has a version so evaluation results can be tied to
 * the exact wording. Prompts are written as plain guidance, not rule lists.
 */

export const PROMPT_VERSION = 'folio-prompts@9';

const SOURCE_BUDGET = 12000;

function languageLine(language: Language, locale: string): string {
  if (language === 'zh-CN')
    return 'Write every piece of text in Simplified Chinese (简体中文), with natural Chinese classroom phrasing. Use 《》 only for titles of works (poems, books, articles); when naming a lesson, put its title in “”.';
  const where = /^en-/i.test(locale) ? ` The teacher's locale is ${locale}: use its spelling, currency and units unless the brief says otherwise.` : '';
  return `Write in clear English suited to the level of the students. Use sentence case for titles and headings (capitalise only the first word and names), but keep the published capitalisation of works you cite.${where}`;
}

export function systemPrompt(language: Language, locale = ''): string {
  return [
    'You help a teacher build a course in Folio, a tool that turns one course document into lesson plans, slides, quizzes and other classroom materials.',
    'Write material a teacher could use tomorrow: specific to the subject, with real examples, real terms, real numbers and correct facts. Never write placeholders such as "Topic 1", "key concept" or "Session 1 topic"; name the actual content.',
    'Match the level of the students. Keep sentences short and concrete. Do not use emoji.',
    'If something in the brief is ambiguous, choose the most sensible specific interpretation and stay consistent with it.',
    'Quote word for word only from the teacher\'s sources shown to you. Anything else, paraphrase and point to the chapter or section: never invent a quotation or a page number.',
    'Write maths in Unicode with real subscripts and superscripts (β₀, x², σ̂², ≤, √), never LaTeX, ^ or _.',
    'Put code, commands and function names in backticks, e.g. `lm(wage ~ educ, data = wage1)`, one line of code per pair. Use backticks for nothing else, and never fenced code blocks.',
    'Folio shows lesson numbers, the number of lessons, lesson lengths and quiz sizes itself, and teachers change them. Never write them anywhere, speaker notes included: no "lesson 1 of 4", "the first lesson", "over the next two hours" or "a 5-question quiz". Refer to another lesson by its title.',
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
    'Under "readings", list what students read before each lesson, taken from the brief or the attached sources. When the brief names a textbook but not its chapters, name the chapter that matches the lesson, by its topic if you are unsure of the number. Never invent works, authors or page numbers; leave the readings empty when the brief gives nothing to go on.',
    'Under "suggestedReadings", for a university course only, suggest up to three well-known further readings per lesson that the brief does not already list: established works a lecturer would recognise on that lesson\'s topic, with author and title, and a chapter only when you are sure of it. Suggest each work once in the course, for the lesson it fits best. The teacher checks them before anything is assigned, so leave the list empty rather than guess.',
    'Under "grading", give only the graded components and weights the brief states, with the weights summing to 100. Leave it empty if the brief does not say how the course is graded.',
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

/** University and graduate courses are taught differently from school ones, and assessed on other scales. */
export function isHigherEducation(level: string): boolean {
  return /universit|college|undergrad|graduate|postgrad|master|doctoral|ph\.?d|\b[bm]\.?sc\b|\bmba\b|degree|本科|研究生|大学|硕士|博士/i.test(level);
}

const UNIVERSITY_TEACHING =
  'This is university teaching for adult students: lectures, seminars and problem classes. Build sessions around close reading, argument, worked problems and student-led discussion, and pitch the vocabulary at the discipline. A seminar runs on discussion of the reading: keep the tutor\'s exposition short and let students lead. Leave out school routines such as warm-up games, exit tickets or written responses collected at the end, or reading aloud in turn.';

/**
 * The teacher's own words. Sections otherwise see only what the outline kept,
 * and "each week one student presents" was lost: it carries no grade weight.
 */
function briefLine(course: Course): string {
  const brief = course.brief.trim().replace(/\s+/g, ' ').slice(0, 2000);
  if (!brief) return '';
  return `The teacher's brief: "${brief}"\nThe lessons, their order and length may have changed since: follow the list above, and leave the brief's counts and durations out of what you write.`;
}

/** The graded components, so in-class ones get a place in the plans and assignments can say what they prepare for. */
function gradingLine(course: Course): string {
  const items = course.grading.map((g) => `${g.item} (${g.weight}%)`).join(', ');
  return [
    items ? `The course is graded by: ${items}.` : '',
    'Anything the brief or the grading has happen in class, such as a student presentation, a debate or a test, needs a place in the lesson plans; work that prepares for a graded component says which one. State a weight or a mark only as the grading gives it; never infer one.',
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * What every section of every lesson shares: the course, its lessons and the
 * teacher's sources. It is sent as one block after the system prompt, the
 * same for every call in a build, so providers can cache it and each call
 * pays only for what is new.
 */
export function courseBackground(course: Course): string {
  const all = orderedLessons(course)
    .map((l, i) => `${i + 1}. ${l.title}`)
    .join('\n');
  const audience = [course.audience.level, course.audience.subject].filter(Boolean).join(', ');
  return [
    `Course: ${course.title}${audience ? ` (${audience})` : ''}`,
    course.summary ? `About the course: ${course.summary}` : '',
    `Lessons:\n${all}`,
    `Each lesson lasts ${course.shape.minutesPerLesson} minutes.`,
    isHigherEducation(course.audience.level) ? UNIVERSITY_TEACHING : '',
    briefLine(course),
    gradingLine(course),
    sourcesBlock(course),
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** The lesson a section is for: the part of the request that changes from call to call. */
export function lessonContext(course: Course, lesson: Lesson): string {
  const objectives = statedObjectives(course, lesson)
    .map((o, i) => `${i + 1}. ${o.text}`)
    .join('\n');
  const readings = filledTexts(lesson.readings)
    .map((r) => `- ${r}`)
    .join('\n');
  return [
    // No number: given one, models write "lesson 3" into the materials. The background lists the order.
    `This is the lesson "${lesson.title}". ${lesson.summary}`,
    objectives ? `Its objectives:\n${objectives}` : '',
    readings ? `Students read before this lesson:\n${readings}` : '',
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

/**
 * Asked to "make about half true", models swing to all false or all true. So
 * Folio sets the order: alternating within a quiz, and starting true in odd
 * lessons and false in even ones. A quiz often has a single true/false
 * question, so starting by a hash of the lesson id could make every answer
 * in a course "true" (it did, in a live run); by position it comes out even.
 */
function trueFalseOrder(course: Course, lesson: Lesson): string {
  const startTrue = course.lessonOrder.indexOf(lesson.id) % 2 === 0;
  const [first, second] = startTrue ? ['true', 'false'] : ['false', 'true'];
  return `If you include true/false questions, make the first statement ${first}, the second ${second}, and keep alternating.`;
}

/**
 * Lecturers mark on their institution's scale, not "Excellent … Beginning, 4 … 1".
 * The levels take the local grade bands, each worth the lowest mark of its band.
 */
function universityRubric(locale: string): string {
  const bands = /^en-(GB|IE)$/i.test(locale)
    ? 'the UK degree classes: First (70+), Upper second (60–69), Lower second (50–59), Third (40–49), with 70, 60, 50 and 40 as the points'
    : /^en-(US|CA)$/i.test(locale)
      ? 'letter grades: A (90+), B (80–89), C (70–79), D (60–69), with 90, 80, 70 and 60 as the points'
      : 'the grade bands used where the course is taught, each level worth the lowest mark of its band';
  return `Name the rubric levels after ${bands}. Write each descriptor as a marker would, for work at that band.`;
}

export type SectionPromptKind = 'plan' | 'slides' | 'study' | 'quiz' | 'assignments' | 'discussions' | 'faq';

/** Sections written from the lesson plan: they wait for it, and go out of date when it changes. */
export const BUILT_ON_PLAN: ReadonlySet<SectionPromptKind> = new Set(['slides', 'study', 'quiz', 'assignments']);

const asks: Record<SectionPromptKind, (course: Course, lesson: Lesson) => string> = {
  plan: (c) =>
    `Write the lesson plan: two to five key ideas, a sequence of segments (warm-up, teaching, practice, discussion, check, close as fits) whose minutes add up to ${c.shape.minutesPerLesson}, and the vocabulary students need. Each segment description says exactly what happens, with the example to use, in two to four short sentences, each on its own line. Put worked answers, expected responses and common mistakes in the teacher notes (under 60 words), not in the description.`,
  slides: () =>
    'Write a slide deck of five to eight slides that follows the lesson plan. Start with a title slide. Keep bullets short (under ten words), at most five per slide, and put the detail in speaker notes.',
  study: () =>
    'Write a study guide for students to read after the lesson: a short overview, then two to four key points, each with a heading and a clear explanation that includes an example.',
  quiz: (c, lesson) =>
    `Write exactly ${c.shape.quizSize} quiz questions that assess this lesson's objectives. Mix formats: mostly multiple choice with four choices and one clearly correct answer, plus short-answer and true/false questions where they fit, and numeric ones only when the lesson itself involves calculation. For choice and true/false questions, "answer" must repeat the correct choice exactly. Use plausible wrong choices that reflect real misconceptions. Write all the choices to the same length and level of detail: first draft the right answer, then write each wrong choice with about as many words and the same kind of qualifying detail. If the right answer needs a clause of explanation, so does every wrong choice. Each wrong choice must be clearly wrong to an expert; if a teacher could argue for it, rewrite it. Never refer to a choice by its letter or position. Write a true/false question as a plain statement, without "True or false:" in front. ${trueFalseOrder(c, lesson)} Spread the difficulty: mostly 2, with some 1 and at least one 3. For numeric answers, give the calculation in "expression". Where a calculation has competing conventions (quartiles, percentiles, rounding), say in the question which method to use, so only one answer is right.`,
  assignments: (c) =>
    [
      'Write one assignment that lets students apply this lesson, with two to six steps (the page numbers them, so leave numbers out), and a rubric: four levels from strongest to weakest with points, and two to four criteria with one descriptor per level.',
      isHigherEducation(c.audience.level) ? universityRubric(c.locale) : '',
    ]
      .filter(Boolean)
      .join(' '),
  discussions: () =>
    'Write two discussion prompts that make students think and disagree productively, each with two or three follow-up questions for the teacher.',
  faq: () =>
    'Write two or three questions students commonly ask about this lesson, with short, accurate answers.',
};

/** The per-call part of a section request; the course itself goes in courseBackground. */
export function sectionPrompt(course: Course, lesson: Lesson, kind: SectionPromptKind): string {
  const parts = [lessonContext(course, lesson)];
  if (BUILT_ON_PLAN.has(kind)) {
    const plan = planSummary(lesson);
    // Each job invents what the sources don't give; without the plan, a quiz and a plan gave one coefficient two standard errors.
    if (plan) parts.push(`${plan}\n\nUse the same examples, data and figures as the plan.`);
  }
  if ((kind === 'plan' || kind === 'quiz') && course.sourceOrder.length) {
    parts.push('Base this on the teacher\'s sources where they apply. Where a question draws on a passage, give its number in "sourcePassage".');
  }
  parts.push(asks[kind](course, lesson));
  return parts.join('\n\n');
}

/**
 * How much thinking each job gets. Planning a lesson and writing a quiz with
 * checked answers repay it; writing slides, a study guide or discussion
 * prompts from a settled plan mostly doesn't, and thinking is billed as
 * output, the dearest tokens.
 */
export const SECTION_EFFORT: Record<SectionPromptKind, Effort> = {
  plan: 'medium',
  quiz: 'medium',
  assignments: 'low',
  slides: 'low',
  study: 'low',
  discussions: 'low',
  faq: 'low',
};

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
    `Course: ${course.title} (${course.audience.level || 'no level set'}). Quiz size: ${course.shape.quizSize}. Minutes per lesson: ${course.shape.minutesPerLesson}.`,
    `Lessons:\n${lessons}`,
    `The teacher asks: """${request.trim()}"""`,
    `Limits: ${lessonLimit.min}–${lessonLimit.max} lessons, ${quiz.min}–${quiz.max} questions per quiz, ${minutes.min}–${minutes.max} minutes per lesson.`,
    'Turn the request into the smallest list of operations that does it. Lesson numbers refer to the list above, before any change. If an existing lesson already covers what is asked, prefer changing it over adding a near-copy. Wording the teacher gives for a title or objective is used exactly as written, in whatever language, never translated or reworded.',
    'The summary is one short sentence to the teacher saying exactly what will change, with the concrete values and lesson titles (for example: every lesson becomes 45 minutes; "Samples and bias" moves after "Picturing a distribution" because it already covers the topic). Never say "as requested" or "the new setting". The preview already lists each change, so the note is only for why the plan differs from the literal request (for example: "“Samples and bias” already covers sampling bias, so no new lesson is added."); leave it empty otherwise. Do not write in the first person or offer other help. If the request is not about the course structure, return no operations and say in one sentence that Folio can only change the course.',
  ].join('\n\n');
}
