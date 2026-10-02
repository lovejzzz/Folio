import { describe, expect, it } from 'vitest';
import { ClarifyDraft, OutlineDraft, checkSyllabus, clarifyPrompt, courseFromOutline, FOLIO_MIX, syllabusCheckPrompt, type NewCourseRequest } from '../src';
import { fakeInference } from './fake';

const SYLLABUS = 'ENVS 110: Our Changing Planet. Fall 2026, Tue/Thu 75 minutes. Grading: quizzes 30%, project 40%, final 20%. Week 3: TBA.';
const req: NewCourseRequest = {
  brief: 'Environmental science for first-year undergraduates',
  lessonCount: 2,
  minutesPerLesson: 75,
  quizSize: 5,
  level: '',
  language: 'en',
  materials: ['syllabus', 'plan'],
  sources: [
    { title: 'Reading list', text: 'Chapter 1. Chapter 2.' },
    { title: 'ENVS 110 Fall 2026', text: SYLLABUS },
  ],
  syllabus: 'envs 110 fall 2026 ',
};
const draft = OutlineDraft.parse({
  title: 'Our Changing Planet',
  summary: 'S.',
  subject: 'Environmental science',
  level: 'Undergraduate',
  lessons: [
    { title: 'Introduction', summary: 'S.', objectives: ['O'] },
    { title: 'Climate basics', summary: 'S.', objectives: ['O'] },
  ],
});

describe('a syllabus the teacher brought', () => {
  it('is found among the attached files by its title, and waits to be checked', () => {
    const course = courseFromOutline(req, draft);
    const source = Object.values(course.sources).find((s) => s.title === 'ENVS 110 Fall 2026')!;
    expect(course.syllabus).toEqual({ sourceId: source.id, check: null });
    expect(courseFromOutline({ ...req, syllabus: undefined }, draft).syllabus).toBeNull();
    expect(courseFromOutline({ ...req, syllabus: 'Not attached' }, draft).syllabus).toBeNull();
  });

  it('is named by the step that reads the files first, which says nothing when no file is one', () => {
    expect(clarifyPrompt({ brief: 'b', sources: req.sources, language: 'en', level: '', lessonCount: null, defaultLessons: 4 })).toContain('"syllabus", the title of the attached file');
    expect(ClarifyDraft.parse({ lessonCount: null, minutesPerLesson: null, questions: [] }).syllabus).toBe('');
  });

  it('is checked for what to fix, reading the syllabus itself and the course planned from it', async () => {
    const course = courseFromOutline(req, draft);
    const issues = [{ kind: 'error', where: 'Grading', problem: 'The weights add up to 90%.', fix: 'Give the final 30%.' }];
    const inference = fakeInference(() => ({ issues }));
    expect(await checkSyllabus(inference, course)).toEqual(issues);
    const call = inference.calls[0]!;
    expect(call.task).toBe('folio_syllabus_check');
    expect(call.prompt).toContain(SYLLABUS);
    expect(call.prompt).toContain('2 lessons of 75 minutes');
    expect(call.prompt).toContain('weights that do not add up to 100%');
    // With Folio credits, the reviewer that found the most in plans checks it.
    expect(FOLIO_MIX.folio_syllabus_check).toEqual({ model: 'gpt-6.1-sol', effort: 'low' });
  });

  it('costs nothing to check when the course has none', async () => {
    const inference = fakeInference(() => ({ issues: [] }));
    expect(await checkSyllabus(inference, courseFromOutline({ ...req, syllabus: undefined }, draft))).toEqual([]);
    expect(inference.calls).toHaveLength(0);
    expect(syllabusCheckPrompt(courseFromOutline(req, draft), 'x'.repeat(70000)).length).toBeLessThan(64000);
  });
});
