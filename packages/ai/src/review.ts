import type { Course, Lesson } from '@folio/core';
import { z } from 'zod';
import type { Inference, ModelSettings, ProviderId } from './inference';
import { runJob } from './jobs';
import { modelKey } from './pricing';
import { courseBackground, lessonContext, systemPrompt } from './prompts';
import type { PlanDraft } from './schemas';

/**
 * A second read of a lesson plan before anything is built on it. The plan is
 * written in one pass, and a pass can get a fact or a demonstration wrong in
 * a way the rest of the lesson then repeats. The review returns only the words
 * it would change, so a sound plan costs little output.
 */

const line = z.string().min(1);

/**
 * Who reviews the plans, per provider. For Claude, Opus 5.5 at medium effort caught the most errors of the
 * reviewers tried, cheaply and fast (about $0.03 and 50 seconds a lesson). Other providers haven't been tried
 * with a review, so their plans go out as written.
 */
export const REVIEW_MODELS: Partial<Record<ProviderId, string>> = { anthropic: 'claude-opus-5-5' };

/**
 * Writers whose plans need no review. On the same lessons, Sonnet 5.5 made about a third as many factual
 * errors as Sonnet 5, and Opus's review of its plans fixed little that mattered; the others are the
 * reviewer itself or stronger. A writer not listed here, older or not yet measured, is reviewed.
 */
const UNREVIEWED_WRITERS = new Set(['claude-sonnet-5.5', 'claude-opus-5.5', 'claude-fable-5', 'claude-fable-5.1']);

/** The reviewer's settings: the teacher's own key and provider, with the review model. Null when the plan goes out as written. */
export function reviewerSettings(settings: ModelSettings): ModelSettings | null {
  const model = REVIEW_MODELS[settings.provider];
  return model && !UNREVIEWED_WRITERS.has(modelKey(settings.model)) ? { ...settings, model } : null;
}

export const PlanReviewDraft = z.object({
  edits: z
    .array(
      z.object({
        part: z.enum(['keyIdea', 'segment', 'vocabulary']),
        number: z.number().int().min(1).describe('Which key idea, segment or vocabulary entry, counted from 1'),
        field: z.enum(['text', 'title', 'description', 'teacherNotes', 'definition']).describe('"text" for a key idea'),
        kind: z.enum(['fact', 'feasibility', 'consistency', 'level']),
        why: line.describe('Why it is wrong, in your own words'),
        find: line.describe('The exact words that are wrong, copied character for character from that field'),
        replace: z.string().describe('What should stand in their place'),
      }),
    )
    .max(12)
    .default([]),
});
export type PlanReviewDraft = z.infer<typeof PlanReviewDraft>;
export type PlanIssue = PlanReviewDraft['edits'][number];

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
      'Check this plan the way an experienced teacher of this subject and level would before teaching it. Go through it systematically:',
      'work out every number, calculation, equation and expected answer yourself; check every factual claim, example, definition and demonstration against what is true, keeping a quotation from a source or document as it is unless you are certain it is misquoted;',
      'check that each demonstration or activity would really produce the result described, under the conditions, in the time and with the materials given;',
      'and check each segment against the others and against its notes: a step that a later segment or an answer key depends on must be there, an answer key must match its task, and a note must not contradict the description or a rule the plan sets.',
      'Kinds: "fact" (wrong or misleading content), "feasibility" (cannot happen as written), "consistency" (the plan contradicts itself), "level" (clearly wrong for these students).',
      'List only what you are sure is wrong. For each, copy under "find" the exact words that are wrong, character for character and enough of them to appear only once in that field, and give under "replace" what should stand in their place. Change as little as the fix needs; to add a missing step, find the sentence it belongs after and replace it with that sentence followed by the new one. Do not rewrite for style, add activities or change the timing.',
      'A change that might itself be wrong is worse than no change: when in doubt, leave it. Return an empty list if the plan is sound.',
    ].join(' '),
  ].join('\n\n');
}

/**
 * The plan with each edit made. An edit replaces only the words it quotes, so a fix to one sentence can never
 * drop the rest of a segment (the first version replaced whole fields, and lost steps); an edit whose words
 * are not in the field it names, or appear there more than once, is skipped.
 */
export function applyPlanReview(plan: PlanDraft, edits: PlanIssue[]): { plan: PlanDraft; applied: PlanIssue[] } {
  const next: PlanDraft = { keyIdeas: [...plan.keyIdeas], segments: plan.segments.map((s) => ({ ...s })), vocabulary: plan.vocabulary.map((v) => ({ ...v })) };
  const applied: PlanIssue[] = [];
  // The quoted words must appear exactly once: a short phrase found twice could be fixed in the wrong place.
  const swap = (text: string, edit: PlanIssue): string | null => (text.split(edit.find).length === 2 ? text.replace(edit.find, () => edit.replace) : null);
  for (const edit of edits) {
    const i = edit.number - 1;
    if (edit.part === 'keyIdea' && edit.field === 'text' && next.keyIdeas[i] !== undefined) {
      const text = swap(next.keyIdeas[i]!, edit);
      if (text === null) continue;
      next.keyIdeas[i] = text;
    } else if (edit.part === 'segment' && next.segments[i] && (edit.field === 'title' || edit.field === 'description' || edit.field === 'teacherNotes')) {
      const text = swap(next.segments[i]![edit.field], edit);
      if (text === null) continue;
      next.segments[i] = { ...next.segments[i]!, [edit.field]: text };
    } else if (edit.part === 'vocabulary' && edit.field === 'definition' && next.vocabulary[i]) {
      const text = swap(next.vocabulary[i]!.definition, edit);
      if (text === null) continue;
      next.vocabulary[i] = { ...next.vocabulary[i]!, definition: text };
    } else continue;
    applied.push(edit);
  }
  return { plan: next, applied };
}

/** Review a freshly written plan and return it corrected, with what was changed and why. */
export async function reviewPlan(
  inference: Inference,
  course: Course,
  lesson: Lesson,
  plan: PlanDraft,
  options: { effort?: 'medium' | 'high'; signal?: AbortSignal } = {},
): Promise<{ plan: PlanDraft; issues: PlanIssue[] }> {
  const result = await runJob(inference, {
    task: 'folio_plan_review',
    system: systemPrompt(course.language, course.locale),
    context: courseBackground(course),
    prompt: planReviewPrompt(course, lesson, plan),
    effort: options.effort ?? 'medium',
    schema: PlanReviewDraft,
    signal: options.signal,
  });
  const { plan: reviewed, applied } = applyPlanReview(plan, result.value.edits);
  return { plan: reviewed, issues: applied };
}
