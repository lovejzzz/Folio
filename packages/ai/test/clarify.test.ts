import { describe, expect, it } from 'vitest';
import { briefWithAnswers, clarifyCourse, clarifyPrompt, lessonsToPlan, outlinePrompt } from '../src';
import { fakeInference } from './fake';

const req = { brief: 'Intro to ecology', sources: [{ title: 'BIO 110 syllabus', text: 'Week 1: Ecosystems\nWeek 2: Energy flow' }], language: 'en' as const, level: '', lessonCount: null, defaultLessons: 4 };

describe('reading the brief before planning', () => {
  it('asks for the lesson count only when it is to be read from the files', () => {
    expect(clarifyPrompt(req)).toContain('when it cannot be, ask for it');
    expect(clarifyPrompt({ ...req, lessonCount: 6 })).not.toContain('when it cannot be, ask for it');
    expect(clarifyPrompt({ ...req, lessonCount: 6 })).toContain('6 lessons');
    expect(clarifyPrompt({ ...req, sources: [] })).toContain('Folio plans 4 unless told otherwise');
    expect(clarifyPrompt(req)).toContain('Week 2: Energy flow');
  });

  it('keeps the teacher’s own choices over what the model read', async () => {
    const inf = fakeInference(() => ({ lessonCount: 14, minutesPerLesson: 75, level: 'First-year university', questions: [] }));
    const read = await clarifyCourse(inf, { ...req, lessonCount: 6, level: 'Grade 11–12' });
    expect(read).toMatchObject({ lessonCount: 6, level: 'Grade 11–12', minutesPerLesson: 75 });
    expect((await clarifyCourse(inf, req)).lessonCount).toBe(14);
  });

  it('plans the teacher’s number, else their answer, else what was read, else the syllabus or the default', () => {
    const read = { lessonCount: 14, minutesPerLesson: null, level: '', questions: [{ topic: 'lessons' as const, question: 'How many lessons?', options: ['a', 'b', 'c'] }] };
    expect(lessonsToPlan({ ...req, lessonCount: 6 }, read, [{ question: 'How many lessons?', answer: '10' }])).toBe(6);
    expect(lessonsToPlan(req, read, [{ question: 'How many lessons?', answer: '10 lessons, two a week' }])).toBe(10);
    expect(lessonsToPlan(req, read, [{ question: 'How many lessons?', answer: 'About a dozen' }])).toBeNull();
    expect(lessonsToPlan(req, read, [{ question: 'How many lessons?', answer: '' }])).toBe(14);
    expect(lessonsToPlan(req, { ...read, lessonCount: null }, [])).toBeNull();
    expect(lessonsToPlan({ ...req, sources: [] }, { ...read, lessonCount: null }, [])).toBe(4);
  });

  it('puts the answers in the brief, leaving out skipped questions', () => {
    const brief = briefWithAnswers('Intro to ecology', [
      { question: 'How is the course graded?', answer: 'Two exams and a field report' },
      { question: 'Is there a lab?', answer: '' },
    ]);
    expect(brief).toBe('Intro to ecology\nBefore planning, the teacher answered:\n- How is the course graded? Two exams and a field report');
    expect(briefWithAnswers('Intro to ecology', [{ question: 'Is there a lab?', answer: ' ' }])).toBe('Intro to ecology');
  });
});

describe('planning from a syllabus', () => {
  const input = { brief: 'Intro to ecology', lessonCount: null, minutesPerLesson: 75, level: '', language: 'en' as const, sources: req.sources };
  it('plans as many lessons as the syllabus schedules when no count is set', () => {
    const prompt = outlinePrompt(input);
    expect(prompt).not.toContain('Plan exactly');
    expect(prompt).toContain('Plan one lesson for each class meeting');
    expect(prompt).toContain('follow its schedule');
    expect(outlinePrompt({ ...input, lessonCount: 12 })).toContain('Plan exactly 12 lessons of 75 minutes each');
  });
});
