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
