import type { CompletionRequest, Effort, Inference, ModelSettings, OnUsage } from '../inference';
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
  // The check of a syllabus the teacher brought is a review too: Sol, which found the most in plans.
  folio_syllabus_check: { model: 'gpt-6.1-sol', effort: 'low' },
};

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
    complete(request: CompletionRequest) {
      const route = FOLIO_MIX[request.task];
      if (route) return gpt(route.model).complete({ ...request, effort: route.effort });
      return isGpt(settings.model) ? gpt(settings.model).complete(request) : claude.complete(request);
    },
  };
}
