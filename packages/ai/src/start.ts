import { cmd, lessonPieces, newId, orderedLessons, type Command, type Course, type CoursePage, type PageBlock } from '@folio/core';
import { z } from 'zod';
import type { Inference } from './inference';
import { runJob } from './jobs';
import { isMixedOnline } from './live';
import { courseBackground, systemPrompt } from './prompts';
import { typesetDraft } from './typeset';

/**
 * The page a student of an online course reads before week 1. A course with no meetings has no first class in
 * which to say how it works: where to begin, the week's rhythm, what to install, how the grade is made, where to
 * ask and when to expect an answer. What only the instructor can say (their name, hours, policies) is listed
 * for them, apart from the student's page, and never made up.
 */

const line = z.string().min(1);

export const StartDraft = z.object({
  welcome: line.describe('60 to 100 words to the student: what the course is and what they will have made by its end'),
  firstSteps: z.array(line).min(2).max(6).describe('What to do first, in order'),
  rhythm: z.array(z.object({ when: line, what: line })).min(2).max(7).describe('The week, by day: what happens when'),
  need: z.array(z.object({ item: line, detail: line.describe('The exact version, what it costs, where to get it, what the computer must have') })).max(8),
  grading: z.array(z.object({ item: line, how: line.describe('What counts toward it, how many pieces there are, and how they make its share of the grade') })).max(8),
  help: line.describe('Where to ask and what to put in a question so it can be answered; never the instructor\'s own contact details'),
  instructor: z.array(line).min(2).max(5).describe('What the instructor does every week and how soon: announcements, answers in the forum, feedback on work. Proposed, for the instructor to confirm'),
  toAdd: z.array(line).min(1).max(8).describe('For the instructor only: what the course still needs that only they can supply'),
});
export type StartDraft = z.infer<typeof StartDraft>;

const TITLES: Record<string, { start: string; first: string; rhythm: string; need: string; grading: string; help: string; instructor: string; policies: string; toAdd: string }> = {
  en: { start: 'Start here', first: 'Do this first', rhythm: 'How a week runs', need: 'What you need', grading: 'How your grade is made', help: 'When you are stuck', instructor: 'What to expect from your instructor', policies: 'Course policies', toAdd: 'Before the course opens' },
  'zh-CN': { start: '从这里开始', first: '先做这几件事', rhythm: '每周的节奏', need: '你需要准备', grading: '成绩如何构成', help: '遇到困难时', instructor: '教师会做什么', policies: '课程规定', toAdd: '开课前' },
};

type NoId<T> = T extends unknown ? Omit<T, 'id'> : never;
const block = (b: NoId<PageBlock>): PageBlock => ({ ...b, id: newId('x') }) as PageBlock;

export function startPages(v: StartDraft, course: Course): CoursePage[] {
  const t = TITLES[course.language] ?? TITLES.en!;
  const terms = (items: { term: string; meaning: string }[]) => block({ type: 'terms', items });
  const h = (text: string) => block({ type: 'heading', level: 2, text });
  const student: PageBlock[] = [
    block({ type: 'text', text: v.welcome }),
    h(t.first),
    block({ type: 'list', ordered: true, items: v.firstSteps }),
    h(t.rhythm),
    terms(v.rhythm.map((r) => ({ term: r.when, meaning: r.what }))),
    ...(v.need.length ? [h(t.need), terms(v.need.map((n) => ({ term: n.item, meaning: n.detail })))] : []),
    ...(v.grading.length ? [h(t.grading), terms(v.grading.map((g) => ({ term: g.item, meaning: g.how })))] : []),
    h(t.help),
    block({ type: 'text', text: v.help }),
    h(t.instructor),
    block({ type: 'list', ordered: false, items: v.instructor }),
  ];
  return [
    { id: newId('p'), title: t.start, audience: 'student', blocks: student },
    { id: newId('p'), title: t.toAdd, audience: 'teacher', blocks: [block({ type: 'list', ordered: false, items: v.toAdd })] },
  ];
}

/** How many graded pieces the outline sets toward each grading item: counted here, because a model miscounts fourteen weeks. */
export function pieceCounts(course: Course): string {
  const counts = new Map<string, number>();
  for (const lesson of orderedLessons(course)) for (const p of lessonPieces(lesson)) if (p.toward.trim() && !p.standing && p.kind !== 'step') counts.set(p.toward.trim(), (counts.get(p.toward.trim()) ?? 0) + 1);
  if (!counts.size) return '';
  return ` Pieces set across the course: ${[...counts].map(([item, n]) => `"${item}" ${n}`).join(', ')}. Use these counts.`;
}

export function startPrompt(course: Course): string {
  const hours = course.online?.hoursPerWeek ?? 9;
  const mixed = isMixedOnline(course);
  return [
    'Write the "Start here" page of this course: what a student reads before the first week, alone. Address the student as "you".',
    `Under "firstSteps", what to do first, in order. Under "rhythm", how every week runs: when the week opens, ${mixed ? `the page, the self-check and one forum post before the live session, the live session of ${course.online?.liveMinutes || 75} minutes (its day and time are the instructor's to add), and all other work by Sunday night` : 'the first forum post by Thursday, replies and all other work by Sunday night'}, about ${hours} hours in all. Under "need", everything to install or buy, each with its exact version, its cost, where it comes from and what the computer must have; take versions and names from the brief and the teacher's sources, and leave out a requirement you are not sure of rather than send the student to look for it. When the first week's page teaches the set-up, "firstSteps" and "need" say what will be needed and that week 1 walks through installing it: they do not give a second, shorter set of steps.`,
    `Under "grading", one entry for each graded component the course has, in the grading's words: what counts toward it, how many pieces there are, and how they make its share. Give only shares the grading gives.${pieceCounts(course)}`,
    'Under "help", where to ask (the course\'s Q&A forum) and what to put in a question: what you did, what you expected, what happened, the exact error text and a screenshot.',
    'Under "instructor", what the instructor does every week and how soon, as a plan for them to confirm: an announcement when the week opens, answers in the forum within one working day, feedback on submitted work within a week.',
    `Under "toAdd", what only the instructor can supply, as a list for them alone: their name and how to reach them, office hours,${mixed ? ' the day, time and time zone of the live session, its meeting link and the shared document,' : ''} each policy the course needs that the class policies do not already state (late work, what help and AI tools are allowed, academic integrity, accessibility and accommodations), and a line asking them to confirm or change the response times the student's page promises in their name. Never write these yourself, and never put a blank for them on the student's page.`,
  ].join(' ');
}

/** The Start here page and the instructor's list, written once with the first week. */
export async function startCommands(inference: Inference, course: Course, signal?: AbortSignal): Promise<Command[]> {
  const result = await runJob(inference, { task: 'folio_start', system: systemPrompt(course.language, course.locale), context: courseBackground(course), prompt: startPrompt(course), effort: 'low', schema: StartDraft, signal });
  return [cmd('pages.set', { pages: startPages(typesetDraft(result.value, course.language), course) })];
}
