import { cmd, CourseStore, createCourse, newId, type Course } from '@folio/core';
import { parseJsonText, type CompletionRequest, type Inference } from '../src';

/** A scripted model for tests: answers by task name, records every request. */
export function fakeInference(answer: (req: CompletionRequest, call: number) => unknown, handouts?: unknown): Inference & { calls: CompletionRequest[]; sheets: CompletionRequest[] } {
  const calls: CompletionRequest[] = [];
  const sheets: CompletionRequest[] = [];
  return {
    provider: 'anthropic',
    model: 'fake',
    calls,
    sheets,
    async complete(req) {
      // A plan's sheets are asked for after every plan: answered apart ("none" unless a test gives some), so tests
      // of how plans are written count the calls they are about.
      if (req.task === 'folio_handouts') return (sheets.push(req), handouts ?? { handouts: [] });
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

/** Two lessons, one objective each, quizzes of three. */
export function smallCourse(): Course {
  const store = new CourseStore(createCourse({ title: 'Photosynthesis', quizSize: 3, minutesPerLesson: 50 }));
  for (const title of ['Light and leaves', 'The Calvin cycle']) {
    store.apply(
      [cmd('lesson.insert', { lesson: { id: newId('l'), title, summary: '' }, afterId: store.getState().lessonOrder.at(-1) ?? null, objectives: [{ id: newId('o'), text: `Explain ${title}` }] })],
      { label: { key: 't' }, source: 'teacher' },
    );
  }
  return store.getState();
}
