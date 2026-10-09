import { describe, expect, it } from 'vitest';
import { orderedLessons } from '@folio/core';
import { courseBackground, sectionPrompt, SECTION_EFFORT } from '../src/prompts';
import { trimQuiz } from '../src/sections';
import type { QuizDraft } from '../src/schemas';
import { smallCourse } from './fake';

const q = (difficulty: number, n: number): QuizDraft['questions'][number] => ({
  format: 'short',
  prompt: `Q${n}`,
  choices: [],
  answer: 'a',
  explanation: 'e',
  difficulty,
  expression: null,
  objective: 1,
  sourcePassage: null,
});

describe('spending fewer tokens', () => {
  it('drops a question too many locally, keeping the easy and hard ones', () => {
    const v = { questions: [q(1, 1), q(2, 2), q(3, 3), q(2, 4), q(2, 5), q(3, 6)] };
    expect(trimQuiz(v, 5).questions.map((x) => x.prompt)).toEqual(['Q1', 'Q2', 'Q3', 'Q4', 'Q6']);
    expect(trimQuiz(v, 3).questions.map((x) => x.difficulty).sort()).toEqual([1, 3, 3]);
    expect(trimQuiz(v, 6)).toEqual(v);
  });

  it('keeps the course background identical across every lesson, so it can be cached', () => {
    const course = smallCourse();
    const [a, b] = orderedLessons(course);
    expect(courseBackground(course)).not.toContain('this lesson');
    const pa = sectionPrompt(course, a!, 'slides');
    const pb = sectionPrompt(course, b!, 'slides');
    expect(pa).toContain(a!.title);
    expect(pb).toContain(b!.title);
    expect(pa).not.toContain('Lessons:');
  });

  it('thinks hard only where it pays', () => {
    expect(SECTION_EFFORT.quiz).toBe('medium');
    expect(SECTION_EFFORT.plan).toBe('medium');
    expect(SECTION_EFFORT.slides).toBe('low');
  });
});

describe('what need not be asked for twice', () => {
  it('reads a question\'s kind from what it holds when it was left out, and takes the segments of two sessions', async () => {
    const { QuizDraft, PlanDraft } = await import('../src/schemas');
    const { z } = await import('zod');
    const q = (more: object) => ({ prompt: 'p', answer: 'a', explanation: 'e', difficulty: 1, objective: 1, ...more });
    const read = QuizDraft.parse({ questions: [q({ choices: ['x', 'y', 'z'], answer: 'y' }), q({ choices: ['True', 'False'], answer: 'True' }), q({ answer: '12.5' }), q({ answer: 'Because the sample is small.' }), q({ format: 'short', choices: ['x', 'y'] })] });
    expect(read.questions.map((x) => x.format)).toEqual(['choice', 'truefalse', 'numeric', 'short', 'short']);
    // The model is still told the field is required.
    expect(JSON.stringify(z.toJSONSchema(QuizDraft))).toMatch(/"required":\["format"/);
    const seg = { kind: 'teach', session: 1, title: 't', minutes: 10, description: 'd', teacherNotes: '' };
    const plan = (n: number) => PlanDraft.safeParse({ keyIdeas: ['a', 'b'], vocabulary: [], segments: Array.from({ length: n }, () => seg) }).success;
    expect([plan(11), plan(15)]).toEqual([true, false]);
  });
});
