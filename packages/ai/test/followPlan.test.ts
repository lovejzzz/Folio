import { orderedLessons, type Course } from '@folio/core';
import { describe, expect, it } from 'vitest';
import { sectionPrompt, systemPrompt } from '../src';
import { smallCourse } from './fake';

/** A course whose first lesson has a plan, with a teacher note on its one segment. */
function planned(): Course {
  const course = smallCourse();
  const lesson = orderedLessons(course)[0]!;
  const segments = [
    { id: 's1', kind: 'teach', session: 0, title: 'Light in leaves', minutes: 20, description: 'Shine a lamp on a leaf disc.', teacherNotes: 'Students often think plants eat soil.' },
  ] as typeof lesson.segments;
  return { ...course, lessons: { ...course.lessons, [lesson.id]: { ...lesson, keyIdeas: ['Light drives photosynthesis'], segments } } };
}

describe('materials written from the lesson plan', () => {
  it('see the plan’s teacher notes and are told to keep to the plan', () => {
    const course = planned();
    const lesson = orderedLessons(course)[0]!;
    for (const kind of ['quiz', 'slides', 'study', 'assignments', 'discussions', 'faq'] as const) {
      const prompt = sectionPrompt(course, lesson, kind);
      expect(prompt).toContain('Teacher notes: Students often think plants eat soil.');
      expect(prompt).toContain('it must hold or ask exactly that');
      expect(prompt).toContain('Never state as fact an idea the teacher notes flag as a misconception');
    }
  });

  it('are not described item by item in the plan, which keeps to what can happen in class', () => {
    const course = planned();
    const prompt = sectionPrompt(course, orderedLessons(course)[0]!, 'plan');
    expect(prompt).toContain('Plan only what can really happen');
    expect(prompt).toContain('not what its questions or items will be');
  });

  it('ask for wrong choices a student might really give, never padded to length', () => {
    const course = planned();
    const prompt = sectionPrompt(course, orderedLessons(course)[0]!, 'quiz');
    expect(prompt).toContain('an answer a student at this level might really give');
    expect(prompt).toContain('never by padding wrong choices');
  });

  it('never pass off an invented fact as real evidence', () => {
    expect(systemPrompt('en', 'en-US')).toContain('Never present an invented statistic, study, event or case as real');
  });
});
