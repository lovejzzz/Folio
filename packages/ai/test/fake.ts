import { parseJsonText, type CompletionRequest, type Inference } from '../src';

/** A scripted model for tests: answers by task name, records every request. */
export function fakeInference(answer: (req: CompletionRequest, call: number) => unknown): Inference & { calls: CompletionRequest[] } {
  const calls: CompletionRequest[] = [];
  return {
    provider: 'anthropic',
    model: 'fake',
    calls,
    async complete(req) {
      calls.push(req);
      await Promise.resolve();
      return answer(req, calls.length);
    },
  };
}

/**
 * A scripted model that answers in text, the way a provider does: the text
 * goes through the same JSON parsing as a real adapter, so a malformed
 * answer fails the way it would in the app.
 */
export function fakeTextInference(answer: (req: CompletionRequest, call: number) => string): Inference & { calls: CompletionRequest[] } {
  return fakeInference((req, call) => parseJsonText(answer(req, call)));
}

export const planDraft = {
  keyIdeas: ['Plants make sugar from light', 'Chlorophyll absorbs red and blue light'],
  segments: [
    { kind: 'warmup', title: 'Leaf in the dark', minutes: 10, description: 'Compare two leaves.', teacherNotes: '' },
    { kind: 'teach', title: 'The equation', minutes: 20, description: 'Walk through 6CO2 + 6H2O.', teacherNotes: 'Balance it together.' },
    { kind: 'check', title: 'Exit ticket', minutes: 20, description: 'Two questions.', teacherNotes: '' },
  ],
  vocabulary: [{ term: 'Chlorophyll', definition: 'The green pigment that absorbs light.' }],
};

export function quizDraft(n: number, overrides: Record<number, object> = {}) {
  return {
    questions: Array.from({ length: n }, (_, i) => ({
      format: 'choice',
      prompt: `Question ${i + 1} about photosynthesis?`,
      choices: ['Glucose', 'Oxygen', 'Nitrogen', 'Salt'],
      answer: 'Glucose',
      explanation: 'Plants store energy as glucose.',
      difficulty: 2,
      expression: null,
      objective: 1,
      sourcePassage: null,
      ...overrides[i],
    })),
  };
}
