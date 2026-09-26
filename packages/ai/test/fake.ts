import type { CompletionRequest, Inference } from '../src';

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
