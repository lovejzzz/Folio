import type { Course, Flag, Lesson } from '@folio/core';
import { z } from 'zod';
import { earlierLessons } from './continuity';
import type { Inference } from './inference';
import { runJob } from './jobs';
import { BlockDraft, ModuleDraft, moduleAsk } from './online';
import { courseBackground, lessonContext, sectionPrompt, systemPrompt } from './prompts';
import { PlanDraft } from './schemas';

/**
 * Putting right what a review found, where it stands. A page with notes used to be written again whole: the
 * new page lost the notes it was told of and came back with as many of its own, so half of them shipped. A
 * mend writes again only the blocks at fault (whole parts were half unchanged text, typed again and paid for), and
 * what was sound is not put at risk.
 */

const line = z.string().min(1);
type ReviewNote = Extract<Flag, { code: 'reviewNote' }>;

const Left = z
  .array(
    z.object({
      note: z.number().int().min(1).describe('The problem\'s number in the list'),
      reason: z.enum(['teacher', 'mistaken']),
      why: line.describe('"teacher": the question the teacher has to decide. "mistaken": what shows the page is right as it stands'),
    }),
  )
  .default([])
  .describe('Problems not fixed, each for one of the two reasons; empty when all are fixed');
export type Left = z.infer<typeof Left>[number];

/** What a mend did: the draft with its changes, what was written again, and what the writer left as it was. */
export interface Mended<T> {
  value: T;
  changed: string[];
  left: Left[];
}

export const ModuleMend = z.object({
  parts: z
    .array(z.object({ number: z.number().int().min(1).describe('The part\'s number, as in the page given'), title: line, blocks: z.array(BlockDraft).min(1) }))
    .default([])
    .describe('A part most of whose blocks change, written again whole'),
  changes: z
    .array(
      z.object({
        part: z.number().int().min(1).describe('The part\'s number'),
        block: z.number().int().min(1).describe('The number of the block that changes, as the page given numbers it'),
        instead: z.array(BlockDraft).describe('What stands in its place: the block corrected; the block and a new one after or before it; nothing, when it is taken out'),
      }),
    )
    .default([])
    .describe('Every other block that changes, one entry for each'),
  intro: z.string().default('').describe('The introduction again, only when a problem is in it'),
  checklist: z.array(ModuleDraft.shape.checklist.element).max(24).default([]).describe('The whole checklist again, only when it changes'),
  live: ModuleDraft.shape.live.describe('The live session\'s whole run of show again, only when it changes'),
  wrapUp: z.string().default('').describe('The wrap-up again, only when a problem is in it'),
  leaves: z.array(line).max(32).default([]).describe('What the student\'s work holds at the end of the week, whole, only when a fix changes it'),
  left: Left,
});
export type ModuleMend = z.infer<typeof ModuleMend>;

/** A value without its empty fields: the page is shown to the mender as it was written, not as the schema pads it. */
function bare(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(bare);
  if (!value || typeof value !== 'object') return value;
  const kept = Object.entries(value).filter(([, v]) => !(v === '' || v === 0 || (Array.isArray(v) && !v.length)));
  return Object.fromEntries(kept.map(([k, v]) => [k, bare(v)]));
}

const numbered = (notes: ReviewNote[]) => notes.map((n, i) => `${i + 1}. ${n.values.where}: ${n.values.text}`).join('\n');

const HOW = [
  'Put each problem right where it stands, and change nothing else. A fix is the smallest one that makes the text true and doable as written: correct the step, the code, the number or the claim; add the step or the sentence that is missing; where more was promised than can be given, say less. What is not at fault stays word for word and in its order.',
  // Corrected in one segment only, a fact stood uncorrected in a key idea and in the activity built on it.
  'When what you correct (a fact, a name, a number, which text is read) is also said elsewhere in the text, in a key idea, another part, an answer or the vocabulary, correct it there too and give those as well: put right in one place and left standing in another, it is a new contradiction.',
  'Facts come from the teacher\'s sources and the earlier lessons, never from memory where they speak.',
  'Under "left", list by its number a problem you did not fix, for one of two reasons only: "teacher" when it turns on a choice about the course that is the teacher\'s alone (what counts toward a grade, which of two designs to teach), with the question to decide; "mistaken" when the text is right as it stands, with what shows it. Every other problem is fixed.',
].join(' ');

export function moduleMendPrompt(course: Course, lesson: Lesson, v: ModuleDraft, notes: ReviewNote[]): string {
  const page = { intro: v.intro, checklist: v.checklist, parts: v.parts.map((p, i) => ({ number: i + 1, title: p.title, blocks: p.blocks.map((b, j) => ({ n: j + 1, ...b })) })), live: v.live, wrapUp: v.wrapUp, leaves: v.facilitation.leaves };
  return [
    lessonContext(course, lesson),
    earlierLessons(course, lesson),
    `The brief this week's page was written to:\n${moduleAsk(course, lesson)}`,
    `The page as written:\n${JSON.stringify(bare(page))}`,
    `A reader who followed the page to the letter found these problems:\n${numbered(notes)}`,
    `${HOW} An exhibit is part of the page: where the text and an exhibit disagree, the exhibit is corrected, with any blank or later state that shares its labels, and no sentence tells a student to disregard part of one. Under "changes", give each block that changes by its part and its number ("n"), with what stands in its place, written without "n"; a block not named there stays word for word, so nothing sound is typed again. Only a part most of whose blocks change is given whole under "parts" instead, under its number: no part is added, removed or renumbered. Give "intro", "checklist", "live", "wrapUp" or "leaves" only when it changes, whole, and leave the others empty; when a fix changes what students do or how long it takes, the checklist and "leaves" change with it.`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** A part with the blocks named in its changes replaced: several changes to one block are taken in the order given. */
function withChanges(part: ModuleDraft['parts'][number], changes: ModuleMend['changes']): ModuleDraft['parts'][number] {
  const by = new Map<number, ModuleMend['changes'][number]['instead']>();
  for (const c of changes) if (c.block <= part.blocks.length) by.set(c.block, [...(by.get(c.block) ?? []), ...c.instead]);
  const blocks = part.blocks.flatMap((b, j) => by.get(j + 1) ?? [b]);
  // A part is never emptied by a mend: one that would be is left as it was.
  return by.size && blocks.length ? { ...part, blocks } : part;
}

export function applyModuleMend(v: ModuleDraft, mend: ModuleMend): Mended<ModuleDraft> {
  const parts = new Map(mend.parts.filter((p) => p.number <= v.parts.length).map((p) => [p.number, { title: p.title, blocks: p.blocks }]));
  // A part given whole has its changes in it already.
  const pieces = mend.changes.filter((c) => c.part <= v.parts.length && !parts.has(c.part));
  for (const n of new Set(pieces.map((c) => c.part))) {
    const next = withChanges(v.parts[n - 1]!, pieces.filter((c) => c.part === n));
    if (next !== v.parts[n - 1]) parts.set(n, next);
  }
  const changed = [
    ...[...parts.keys()].sort((a, b) => a - b).map((n) => `Part ${n}`),
    ...(mend.intro.trim() ? ['the introduction'] : []),
    ...(mend.checklist.length >= 4 ? ['the checklist'] : []),
    ...(mend.live.length ? ['the live session'] : []),
    ...(mend.wrapUp.trim() ? ['the wrap-up'] : []),
  ];
  const value: ModuleDraft = {
    ...v,
    intro: mend.intro.trim() || v.intro,
    checklist: mend.checklist.length >= 4 ? mend.checklist : v.checklist,
    parts: v.parts.map((p, i) => parts.get(i + 1) ?? p),
    live: mend.live.length ? mend.live : v.live,
    wrapUp: mend.wrapUp.trim() || v.wrapUp,
    facilitation: mend.leaves.length ? { ...v.facilitation, leaves: mend.leaves } : v.facilitation,
  };
  return { value, changed, left: mend.left };
}

export async function mendModule(inference: Inference, course: Course, lesson: Lesson, v: ModuleDraft, notes: ReviewNote[], signal?: AbortSignal): Promise<Mended<ModuleDraft>> {
  const result = await runJob(inference, { task: 'folio_module_mend', system: systemPrompt(course.language, course.locale), context: courseBackground(course), prompt: moduleMendPrompt(course, lesson, v, notes), effort: 'medium', schema: ModuleMend, signal });
  return applyModuleMend(v, result.value);
}

const Segment = PlanDraft.shape.segments.element;

export const PlanMend = z.object({
  segments: z.array(Segment.extend({ number: z.number().int().min(1).describe('The segment\'s number, as in the plan given') })).default([]).describe('Every segment that changes, written again whole'),
  keyIdeas: z.array(line).max(5).default([]).describe('All the key ideas again, only when one changes'),
  vocabulary: z.array(z.object({ term: line, definition: line })).max(40).default([]).describe('The whole vocabulary again, only when an entry changes'),
  left: Left,
});
export type PlanMend = z.infer<typeof PlanMend>;

export function planMendPrompt(course: Course, lesson: Lesson, plan: PlanDraft, notes: ReviewNote[]): string {
  const shown = { keyIdeas: plan.keyIdeas, segments: plan.segments.map((s, i) => ({ number: i + 1, ...s })), vocabulary: plan.vocabulary };
  return [
    // The plan's own request, whole: a segment written again keeps to everything the plan was asked for.
    `The request this lesson plan was written to:\n${sectionPrompt(course, { ...lesson, gen: { ...lesson.gen, plan: undefined } }, 'plan')}`,
    `The plan as written:\n${JSON.stringify(shown)}`,
    `A teacher of the subject checked the plan and found these problems:\n${numbered(notes)}`,
    `${HOW} Under "segments", give every segment that changes, whole, under its number: none is added, removed or renumbered, and the minutes of each session still add up as they did. Give "keyIdeas" or "vocabulary" only when one changes, whole, and leave the others empty.`,
  ].join('\n\n');
}

export function applyPlanMend(plan: PlanDraft, mend: PlanMend): Mended<PlanDraft> {
  const segments = new Map(mend.segments.filter((s) => s.number <= plan.segments.length).map(({ number, ...s }) => [number, s]));
  const changed = [...[...segments.keys()].sort((a, b) => a - b).map((n) => `Segment ${n}`), ...(mend.keyIdeas.length >= 2 ? ['the key ideas'] : []), ...(mend.vocabulary.length ? ['the vocabulary'] : [])];
  const value: PlanDraft = {
    keyIdeas: mend.keyIdeas.length >= 2 ? mend.keyIdeas : plan.keyIdeas,
    segments: plan.segments.map((s, i) => segments.get(i + 1) ?? s),
    vocabulary: mend.vocabulary.length ? mend.vocabulary : plan.vocabulary,
  };
  return { value, changed, left: mend.left };
}

export async function mendPlan(inference: Inference, course: Course, lesson: Lesson, plan: PlanDraft, notes: ReviewNote[], signal?: AbortSignal): Promise<Mended<PlanDraft>> {
  const result = await runJob(inference, { task: 'folio_plan_mend', system: systemPrompt(course.language, course.locale), context: courseBackground(course), prompt: planMendPrompt(course, lesson, plan, notes), effort: 'medium', schema: PlanMend, signal });
  return applyPlanMend(plan, result.value);
}

/** What a second reading is told of the first, so it reads what changed and not the whole text afresh. */
export interface Since {
  /** What was open, the reader's notes first; the last `checks` of them came from Folio's own checks of the page's form. */
  notes: ReviewNote[];
  checks?: number;
  changed: string[];
  left: Left[];
}

export function sinceText(since: Since | undefined, unit: string): string {
  if (!since) return '';
  // Folio checks the form again itself: told of it, a reader took to reviewing fields it cannot see.
  const read = since.notes.slice(0, since.notes.length - (since.checks ?? 0));
  if (!read.length) return `This text was read once already, and since then these were written again: ${since.changed.join(', ') || 'nothing'}. Read them in full, as below, and list only problems in what was written again.`;
  const mistaken = since.left.filter((l) => l.reason === 'mistaken' && read[l.note - 1]);
  const teacher = since.left.filter((l) => l.reason === 'teacher' && read[l.note - 1]);
  return [
    `This text was read once already and corrected. The first reading found:\n${numbered(read)}`,
    `Written again since: ${since.changed.join(', ') || 'nothing'}.`,
    mistaken.length ? `The writer left these as they were, as mistaken:\n${mistaken.map((l) => `${l.note}. ${l.why}`).join('\n')}` : '',
    teacher.length ? `Kept as notes for the teacher to decide, not to be listed again: ${teacher.map((l) => l.note).join(', ')}.` : '',
    `Read what was written again in full, as below, and check each problem of the first reading. List only: a problem of the first reading that is still there; one the writer called mistaken when the writer's reason does not hold; a problem in what was written again; and a place where what was written again no longer agrees with the rest (a key idea, a note, an answer or a later ${unit} that still says the old thing). A ${unit} that was not written again and had no problem is not read again.`,
  ]
    .filter(Boolean)
    .join('\n');
}
