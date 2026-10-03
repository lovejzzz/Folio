import { MalformedOutputError, type CompletionRequest, type Effort, type Inference, type ModelSettings, type OnUsage } from '../inference';
import { anthropicInference } from './anthropic';
import { openaiInference } from './openai';

/**
 * Folio credits write each part with the model that did it as well for the least. Measured in September 2026
 * on 12 lessons, judged blind by Fable 5.1 and GPT-6 Astra (they agree only where noted):
 * - Plans, slides, study guides, discussions and FAQ stay with Claude Sonnet 5.5 (the teacher's model): both
 *   judges scored its study guides and discussions above GPT-6 Luna's, and Luna's plans were thinner.
 * - Quizzes and assignments go to GPT-6 Luna at high reasoning: scored level with Sonnet's, at a tenth the cost.
 * - The plan review goes to GPT-6.1 Sol at low reasoning: it found 73–85% of the real problems where Opus 5.5 at
 *   medium found 22–45%, for about a third of the cost; medium and high found no more.
 * Every other job (outline, questions, edits) stays with Claude.
 */
export const FOLIO_MIX: Readonly<Record<string, { model: string; effort: Effort }>> = {
  folio_quiz: { model: 'gpt-6-luna', effort: 'high' },
  folio_assignments: { model: 'gpt-6-luna', effort: 'high' },
  folio_plan_review: { model: 'gpt-6.1-sol', effort: 'low' },
  // A module page is followed step by step and its code run in the head: more to work through than a plan.
  folio_module_review: { model: 'gpt-6.1-sol', effort: 'medium' },
  // The check of a syllabus the teacher brought is a review too: Sol, which found the most in plans.
  folio_syllabus_check: { model: 'gpt-6.1-sol', effort: 'low' },
};

/**
 * The longest answer each job may give with credits, in tokens (OpenAI's count thinking too). Folio's server
 * holds a call's cost at its longest answer while it runs, so a cap far above what a job writes ties up a
 * teacher's balance: with 16,000 for everything, a few hundred credits looked spent while a build ran. Each cap
 * is five times or more the longest the job wrote in measured runs (October 2026), and an answer that still
 * reaches its cap is asked for again at the longest Folio allows: a cap may never cost a teacher part of a
 * lesson. Quizzes and assignments by GPT-6 Luna have none: they grow with the quiz size, Luna thinks at length,
 * and its longest answer holds only about five credits.
 */
export const FOLIO_OUTPUT_CAPS: Readonly<Record<string, number>> = {
  folio_clarify: 4000,
  folio_plan: 12000,
  folio_plan_review: 8000,
  // A week's module page is several plans long; one cut off at this is written again with all the room there is.
  folio_module: 16000,
  folio_module_review: 12000,
  folio_syllabus_check: 10000,
  folio_slides: 10000,
  folio_study: 8000,
  folio_discussions: 6000,
  folio_faq: 6000,
};

/** The longest answer Folio's server lets any call give. */
const LONGEST = 32000;

/** OpenAI's models answer through Folio's server as Claude does: the same credits pay for both. */
const isGpt = (model: string) => model.startsWith('gpt-');

export function folioInference(settings: ModelSettings, fetchImpl?: typeof fetch, onUsage?: OnUsage): Inference {
  const claude = anthropicInference(settings, fetchImpl, onUsage);
  const gpts = new Map<string, Inference>();
  const gpt = (model: string) => {
    if (!gpts.has(model)) gpts.set(model, openaiInference({ ...settings, model }, fetchImpl, onUsage));
    return gpts.get(model)!;
  };
  return {
    provider: 'folio',
    model: settings.model,
    async complete(asked: CompletionRequest) {
      const route = FOLIO_MIX[asked.task];
      const model = route?.model ?? settings.model;
      const send = (maxTokens: number | undefined) => {
        const request = { ...asked, maxTokens, ...(route ? { effort: route.effort } : {}) };
        return isGpt(model) ? gpt(model).complete(request) : claude.complete(request);
      };
      // A job without its own cap keeps the adapter's usual one (16,000 for Claude), and the retry below.
      const cap = asked.maxTokens ?? FOLIO_OUTPUT_CAPS[asked.task] ?? (isGpt(model) ? LONGEST : 16000);
      try {
        return await send(cap);
      } catch (error) {
        // Cut off at the cap: written again with all the room there is, never handed on incomplete.
        if (error instanceof MalformedOutputError && error.truncated && cap < LONGEST) return send(LONGEST);
        throw error;
      }
    },
  };
}
