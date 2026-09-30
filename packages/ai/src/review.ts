import type { Course, Lesson } from '@folio/core';
import { z } from 'zod';
import type { Inference, ModelSettings, ProviderId } from './inference';
import { runJob } from './jobs';
import { courseBackground, lessonContext, systemPrompt } from './prompts';
import type { PlanDraft } from './schemas';

/**
 * A second read of a lesson plan before anything is built on it. The plan is
 * written in one pass, and a pass can get a fact, a number or a demonstration
 * wrong in a way the rest of the lesson then repeats. The review lists every
 * problem it finds: a small fix it is sure of is made in place, and anything
 * else is left for the teacher as a note on the plan.
 */

const line = z.string().min(1);

/**
 * Who reviews the plans, per provider. For the teacher's own Claude key, Opus 5.5 at medium effort, asked to
 * find every problem (about $0.04 a lesson); asked only for what it was sure of, it had found under half. With
 * Folio credits, GPT-6.1 Sol at low effort, which found more of the real problems for less (see adapters/mix.ts).
 * Other providers haven't been tried with a review, so their plans go out as written.
 */
export const REVIEW_MODELS: Partial<Record<ProviderId, string>> = { anthropic: 'claude-opus-5-5', folio: 'gpt-6.1-sol' };

/** The reviewer's settings: the teacher's own key and provider, with the review model. Null when the plan goes out as written. */
export function reviewerSettings(settings: ModelSettings): ModelSettings | null {
  const model = REVIEW_MODELS[settings.provider];
  return model ? { ...settings, model } : null;
}

export const PlanReviewDraft = z.object({
  issues: z
    .array(
      z.object({
        part: z.enum(['keyIdea', 'segment', 'vocabulary']),
        number: z.number().int().min(1).describe('Which key idea, segment or vocabulary entry, counted from 1'),
        field: z.enum(['text', 'title', 'description', 'teacherNotes', 'definition']).describe('"text" for a key idea'),
        kind: z.enum(['fact', 'feasibility', 'consistency', 'level']),
        why: line.describe('What is wrong, briefly, for the teacher'),
        find: z.string().describe('The exact wrong words, copied character for character from that field; empty when the fix needs the teacher'),
        replace: z.string().describe('What should stand in their place; empty when "find" is empty'),
      }),
    )
    .max(12)
    .default([]),
});
export type PlanReviewDraft = z.infer<typeof PlanReviewDraft>;
export type PlanIssue = PlanReviewDraft['issues'][number];

function planText(plan: PlanDraft): string {
  const ideas = plan.keyIdeas.map((k, i) => `Key idea ${i + 1}: ${k}`).join('\n');
  const segments = plan.segments
    .map((s, i) => `Segment ${i + 1} (${s.kind}, ${s.minutes} min): ${s.title}\nDescription: ${s.description}\nTeacher notes: ${s.teacherNotes || '(none)'}`)
    .join('\n\n');
  const vocabulary = plan.vocabulary.map((v, i) => `Vocabulary ${i + 1}: ${v.term}: ${v.definition}`).join('\n');
  return [ideas, segments, vocabulary].filter(Boolean).join('\n\n');
}

export function planReviewPrompt(course: Course, lesson: Lesson, plan: PlanDraft): string {
  return [
    lessonContext(course, lesson),
    `The lesson plan to review:\n${planText(plan)}`,
    [
      'Check this plan the way an experienced teacher of this subject and level would before teaching it, and list every problem they would have to fix first. Go through it systematically:',
      'work out every number, calculation, equation and expected answer yourself; check every factual claim, example, definition and demonstration against what is true, keeping a quotation from a source or document as it is unless you are certain it is misquoted; check that numbers, quantities and situations are realistic for what they describe;',
      'check that each demonstration or activity would really produce the result described, under the conditions, in the time and with the materials given, and that each expected answer or result follows from everything students are given, every item, card, data point and text included;',
      'check that a model or worked example really shows what it is meant to model;',
      'and check each segment against the others and against its notes: a step that a later segment or an answer key depends on must be there, an answer key must match its task, and a note must not contradict the description or a rule the plan sets.',
      'Kinds: "fact" (wrong or misleading content), "feasibility" (cannot happen as written), "consistency" (the plan contradicts itself), "level" (clearly wrong for these students).',
      'For each problem, say under "why" what is wrong, briefly, for the teacher. When a small change to a few words fixes it and you are sure of the fix, copy under "find" the exact words that are wrong, character for character and enough of them to appear only once in that field, and give under "replace" what should stand in their place; to add a missing step, find the sentence it belongs after and replace it with that sentence followed by the new one. When the fix needs the teacher\'s judgment or a larger change, leave "find" and "replace" empty: the teacher will see your note.',
      // Without this line a reviewer lists precision that only matters beyond the students' level: nearly half its findings.
      'Judge accuracy at the level these students are taught: a simplification that the usual textbooks for this level make, and that is not wrong for these students, is not a problem; do not add precision, qualifications or exceptions that only matter beyond this level.',
      'Do not list style preferences, activities you would add, or timing you would change. Return an empty list if the plan is sound.',
    ].join(' '),
  ].join('\n\n');
}

/** The field's text with the quoted words replaced, or null when they are not there exactly once: a short phrase found twice could be fixed in the wrong place. */
function swap(text: string, edit: PlanIssue): string | null {
  return edit.find && text.split(edit.find).length === 2 ? text.replace(edit.find, () => edit.replace) : null;
}

/** The plan with one fix made, or null when it can't be made where it says. */
function fixed(plan: PlanDraft, edit: PlanIssue): PlanDraft | null {
  const i = edit.number - 1;
  if (edit.part === 'keyIdea' && edit.field === 'text' && plan.keyIdeas[i] !== undefined) {
    const text = swap(plan.keyIdeas[i]!, edit);
    return text === null ? null : { ...plan, keyIdeas: plan.keyIdeas.map((k, n) => (n === i ? text : k)) };
  }
  const segment = plan.segments[i];
  if (edit.part === 'segment' && segment && (edit.field === 'title' || edit.field === 'description' || edit.field === 'teacherNotes')) {
    const text = swap(segment[edit.field], edit);
    return text === null ? null : { ...plan, segments: plan.segments.map((s, n) => (n === i ? { ...s, [edit.field]: text } : s)) };
  }
  const entry = plan.vocabulary[i];
  if (edit.part === 'vocabulary' && edit.field === 'definition' && entry) {
    const text = swap(entry.definition, edit);
    return text === null ? null : { ...plan, vocabulary: plan.vocabulary.map((v, n) => (n === i ? { ...v, definition: text } : v)) };
  }
  return null;
}

/**
 * The plan with each fix made, and the problems left for the teacher. A fix replaces only the words it quotes,
 * so it can never drop the rest of a segment; one that can't be made where it says goes to the teacher with the
 * problems that came without a fix.
 */
export function applyPlanReview(plan: PlanDraft, issues: PlanIssue[]): { plan: PlanDraft; applied: PlanIssue[]; notes: PlanIssue[] } {
  let next = plan;
  const applied: PlanIssue[] = [];
  const notes: PlanIssue[] = [];
  for (const issue of issues) {
    const after = fixed(next, issue);
    if (after) {
      next = after;
      applied.push(issue);
    } else notes.push(issue);
  }
  return { plan: next, applied, notes };
}

/** Where in the plan a problem is, as the teacher sees the plan: "Segment 3, Build a food web". */
export function issuePlace(plan: PlanDraft, issue: PlanIssue): string {
  const i = issue.number - 1;
  if (issue.part === 'segment' && plan.segments[i]) return `Segment ${issue.number}, ${plan.segments[i]!.title}`;
  if (issue.part === 'vocabulary' && plan.vocabulary[i]) return `Vocabulary, ${plan.vocabulary[i]!.term}`;
  return `Key idea ${issue.number}`;
}

/** Review a freshly written plan and return it corrected, with what was changed and what the teacher should look at. */
export async function reviewPlan(
  inference: Inference,
  course: Course,
  lesson: Lesson,
  plan: PlanDraft,
  options: { effort?: 'medium' | 'high'; signal?: AbortSignal } = {},
): Promise<{ plan: PlanDraft; issues: PlanIssue[]; notes: PlanIssue[] }> {
  const result = await runJob(inference, {
    task: 'folio_plan_review',
    system: systemPrompt(course.language, course.locale),
    context: courseBackground(course),
    prompt: planReviewPrompt(course, lesson, plan),
    effort: options.effort ?? 'medium',
    schema: PlanReviewDraft,
    signal: options.signal,
  });
  const { plan: reviewed, applied, notes } = applyPlanReview(plan, result.value.issues);
  return { plan: reviewed, issues: applied, notes };
}
