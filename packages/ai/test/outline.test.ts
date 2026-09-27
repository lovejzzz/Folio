import { describe, expect, it } from 'vitest';
import { orderedLessons } from '@folio/core';
import { OutlineDraft, courseFromOutline, lessonContext, outlinePrompt, type NewCourseRequest } from '../src';

const req: NewCourseRequest = {
  brief: 'Political philosophy for second-year undergraduates. Readings from Hobbes and Locke. Problem sets 30%, midterm 30%, final exam 40%.',
  lessonCount: 2,
  minutesPerLesson: 90,
  quizSize: 5,
  level: '',
  language: 'en',
  materials: ['syllabus', 'plan'],
  sources: [],
};

const lessons = [
  { title: 'The state of nature', summary: 'Why Hobbes thinks life without a sovereign is war.', objectives: ['Explain the state of nature'] },
  { title: 'Consent and property', summary: 'How Locke grounds government in consent.', objectives: ['Compare Locke with Hobbes'] },
];

describe('the outline', () => {
  it('reads an outline from a model that leaves out readings and grading', () => {
    const draft = OutlineDraft.parse({ title: 'Political philosophy', summary: 'S.', subject: 'Philosophy', level: 'Undergraduate', lessons });
    expect(draft.grading).toEqual([]);
    expect(draft.lessons.map((l) => l.readings)).toEqual([[], []]);
  });

  it('keeps each lesson’s readings and the stated grading scheme', () => {
    const draft = OutlineDraft.parse({
      title: 'Political philosophy',
      summary: 'S.',
      subject: 'Philosophy',
      level: 'Undergraduate',
      lessons: [{ ...lessons[0], readings: ['Hobbes, Leviathan, ch. 13–17 ', ' '] }, lessons[1]],
      grading: [
        { item: 'Problem sets', weight: 30 },
        { item: 'Midterm', weight: 30 },
        { item: 'Final exam', weight: 40 },
      ],
    });
    const course = courseFromOutline(req, draft);
    expect(orderedLessons(course).map((l) => l.readings)).toEqual([['Hobbes, Leviathan, ch. 13–17'], []]);
    expect(course.grading.map((g) => [g.item, g.weight])).toEqual([
      ['Problem sets', 30],
      ['Midterm', 30],
      ['Final exam', 40],
    ]);
    expect(new Set(course.grading.map((g) => g.id)).size).toBe(3);
  });

  it('sets each lesson’s homework from the assessment plan, defaulting to an assignment', () => {
    const draft = OutlineDraft.parse({
      title: 'E', summary: 'S.', subject: 'Philosophy', level: 'University',
      lessons: [{ ...lessons[0], homework: 'step', homeworkToward: ' Final essay ' }, { ...lessons[1], homework: 'none', homeworkToward: 'Final essay' }],
    });
    expect(orderedLessons(courseFromOutline(req, draft)).map((l) => l.homework)).toEqual([
      { kind: 'step', toward: 'Final essay' },
      { kind: 'none', toward: '' },
    ]);
    const silent = OutlineDraft.parse({ title: 'E', summary: 'S.', subject: 'P', level: 'U', lessons });
    expect(orderedLessons(courseFromOutline(req, silent)).map((l) => l.homework.kind)).toEqual(['assignment', 'assignment']);
    expect(outlinePrompt({ ...req, sources: [] })).toContain('Under "homework"');
  });

  it('suggests each further reading once, and never one already assigned', () => {
    const draft = OutlineDraft.parse({
      title: 'E', summary: 'S.', subject: 'Economics', level: 'University',
      lessons: [
        { ...lessons[0], readings: ['Wooldridge, ch. 2'], suggestedReadings: ['Stock and Watson, Introduction to Econometrics', 'Wooldridge, ch. 3'] },
        { ...lessons[1], readings: ['Wooldridge, ch. 3'], suggestedReadings: ['Stock and Watson, Introduction to Econometrics.', 'Greene, Econometric Analysis.', 'Wooldridge et al.'] },
      ],
    });
    const course = courseFromOutline(req, draft);
    expect(orderedLessons(course).map((l) => l.suggestedReadings)).toEqual([['Stock and Watson, Introduction to Econometrics'], ['Greene, Econometric Analysis', 'Wooldridge et al.']]);
  });

  it('asks for readings and grading only from what the brief gives', () => {
    const prompt = outlinePrompt({ ...req, sources: [] });
    expect(prompt).toContain('"readings"');
    expect(prompt).toContain('Never invent works, authors or page numbers');
    expect(prompt).toContain('"grading"');
  });

  it('tells each section what students read before the lesson', () => {
    const draft = OutlineDraft.parse({ title: 'P', summary: 'S.', subject: 'Philosophy', level: 'U', lessons: [{ ...lessons[0], readings: ['Hobbes, Leviathan, ch. 13'] }, lessons[1]] });
    const course = courseFromOutline(req, draft);
    const [first, second] = orderedLessons(course);
    expect(lessonContext(course, first!)).toContain('Students read before this lesson:\n- Hobbes, Leviathan, ch. 13');
    expect(lessonContext(course, second!)).not.toContain('Students read');
  });
});
