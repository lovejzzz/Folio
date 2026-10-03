import { describe, expect, it } from 'vitest';
import { orderedLessons } from '@folio/core';
import { OutlineDraft, courseFromOutline, groundedIn, lessonContext, outlinePrompt, sectionPrompt, type NewCourseRequest } from '../src';

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
      lessons: [{ ...lessons[0], readings: [{ work: 'Hobbes, Leviathan, ch. 13–17 ', namedIn: 'Hobbes' }, { work: ' ', namedIn: 'Hobbes' }] }, lessons[1]],
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

  it('records the lesson where homework is handed in, and tells both lessons', () => {
    const draft = OutlineDraft.parse({
      title: 'E', summary: 'S.', subject: 'Philosophy', level: 'University',
      lessons: [{ ...lessons[0], homework: 'assignment', homeworkToward: 'Final essay', homeworkDue: 2 }, { ...lessons[1], homework: 'none' }],
      grading: [{ item: 'Final essay', weight: 100 }],
    });
    const course = courseFromOutline(req, draft);
    const [first, second] = orderedLessons(course);
    expect(first!.homework.due).toBe(second!.id);
    expect(sectionPrompt(course, first!, 'plan')).toContain('It is due at the start of the next lesson.');
    expect(sectionPrompt(course, second!, 'plan')).toContain(`Due at the start of this lesson: "Final essay" (set in "${first!.title}"). The plan collects it.`);
    // A step is collected as a step, not as the piece it leads to.
    const stepped = { ...course, lessons: { ...course.lessons, [first!.id]: { ...first!, homework: { ...first!.homework, kind: 'step' as const } } } };
    expect(sectionPrompt(stepped, second!, 'plan')).toContain(`Due at the start of this lesson: the short step (set in "${first!.title}", an ungraded step).`);
    // A due lesson that isn't later is no due date at all.
    const back = courseFromOutline(req, OutlineDraft.parse({ ...draft, lessons: [{ ...draft.lessons[0], homeworkDue: 1 }, draft.lessons[1]] }));
    expect(orderedLessons(back)[0]!.homework.due).toBeUndefined();
  });

  it('carries the teacher’s policies over from the brief or syllabus, and leaves them empty when none are stated', () => {
    const base = { title: 'E', summary: 'S.', subject: 'Philosophy', level: 'University', lessons, grading: [] };
    expect(courseFromOutline(req, OutlineDraft.parse({ ...base, policies: ' Late papers lose 10% a day.\n\nNo AI tools for graded work. ' })).policies).toBe('Late papers lose 10% a day.\n\nNo AI tools for graded work.');
    expect(courseFromOutline(req, OutlineDraft.parse(base)).policies).toBe('');
    expect(outlinePrompt({ ...req, sources: [] })).toContain('never write policies of your own');
  });

  it('sets each lesson’s homework from the assessment plan, defaulting to an assignment', () => {
    const draft = OutlineDraft.parse({
      title: 'E', summary: 'S.', subject: 'Philosophy', level: 'University',
      lessons: [{ ...lessons[0], homework: 'step', homeworkToward: ' Final essay ' }, { ...lessons[1], homework: 'none', homeworkToward: 'Final essay' }],
      grading: [{ item: 'Final essay', weight: 100 }],
    });
    expect(orderedLessons(courseFromOutline(req, draft)).map((l) => l.homework)).toEqual([
      { kind: 'step', toward: 'Final essay' },
      { kind: 'none', toward: '' },
    ]);
    const silent = OutlineDraft.parse({ title: 'E', summary: 'S.', subject: 'P', level: 'U', lessons });
    expect(orderedLessons(courseFromOutline(req, silent)).map((l) => l.homework.kind)).toEqual(['assignment', 'assignment']);
    expect(outlinePrompt({ ...req, sources: [] })).toContain('Under "homework"');
    // Graded work done in class is placed by the outline: planned one lesson at a time, no plan gave the quizzes.
    expect(outlinePrompt({ ...req, sources: [] })).toContain('decide which lessons hold it');
  });

  it('suggests each further reading once, and never one already assigned', () => {
    const draft = OutlineDraft.parse({
      title: 'E', summary: 'S.', subject: 'Economics', level: 'University',
      lessons: [
        { ...lessons[0], readings: [{ work: 'Wooldridge, ch. 2', namedIn: 'Wooldridge' }], suggestedReadings: ['Stock and Watson, Introduction to Econometrics', 'Wooldridge, ch. 3'] },
        { ...lessons[1], readings: [{ work: 'Wooldridge, ch. 3', namedIn: 'Wooldridge' }], suggestedReadings: ['Stock and Watson, Introduction to Econometrics.', 'Greene, Econometric Analysis.', 'Wooldridge et al.'] },
      ],
    });
    const course = courseFromOutline({ ...req, brief: 'Introductory econometrics from Wooldridge.' }, draft);
    expect(orderedLessons(course).map((l) => l.suggestedReadings)).toEqual([['Stock and Watson, Introduction to Econometrics'], ['Greene, Econometric Analysis', 'Wooldridge et al.']]);
  });

  it('asks for readings and grading only from what the brief gives', () => {
    const prompt = outlinePrompt({ ...req, sources: [] });
    expect(prompt).toContain('"readings"');
    expect(prompt).toContain('Never invent works, authors or page numbers');
    expect(prompt).toContain('"grading"');
  });

  it('tells each section what students read before the lesson', () => {
    const draft = OutlineDraft.parse({ title: 'P', summary: 'S.', subject: 'Philosophy', level: 'U', lessons: [{ ...lessons[0], readings: [{ work: 'Hobbes, Leviathan, ch. 13', namedIn: 'Hobbes' }] }, lessons[1]] });
    const course = courseFromOutline(req, draft);
    const [first, second] = orderedLessons(course);
    expect(lessonContext(course, first!)).toContain('Students read before this lesson:\n- Hobbes, Leviathan, ch. 13');
    expect(lessonContext(course, second!)).not.toContain('Students read');
  });

  it('keeps only readings named in the brief or an attached source', () => {
    const draft = OutlineDraft.parse({
      title: 'W', summary: 'S.', subject: 'Science', level: 'Grade 5',
      lessons: [
        { ...lessons[0], readings: [{ work: 'Textbook chapter on states of matter', namedIn: 'textbook' }, { work: 'Locke, Second Treatise, ch. 5', namedIn: 'Locke' }] },
        { ...lessons[1], readings: [{ work: 'Field notes, week 2', namedIn: 'Field notes' }, { work: 'A made-up article', namedIn: '' }] },
      ],
    });
    const sources = [{ title: 'Field notes', text: 'What we saw at the pond.' }];
    const course = courseFromOutline({ ...req, sources }, draft);
    expect(orderedLessons(course).map((l) => l.readings)).toEqual([['Locke, Second Treatise, ch. 5'], ['Field notes, week 2']]);
  });

  it('matches whole words, not fragments of them', () => {
    const named = groundedIn({ brief: 'Readings from Hobbes and Locke.', sources: [] });
    expect(named('hobbes')).toBe(true);
    expect(named('Hobbes and Locke')).toBe(true);
    expect(named('Hob')).toBe(false);
    expect(named('  ')).toBe(false);
  });

  it('gives the only graded component the whole grade when the brief gives no weight', () => {
    const one = OutlineDraft.parse({ title: 'W', summary: 'S.', subject: 'Science', level: 'Grade 5', lessons, grading: [{ item: 'Lesson quizzes', weight: null }] });
    expect(courseFromOutline(req, one).grading.map((g) => g.weight)).toEqual([100]);
    const two = OutlineDraft.parse({ title: 'W', summary: 'S.', subject: 'Science', level: 'Grade 5', lessons, grading: [{ item: 'Quizzes', weight: null }, { item: 'Project', weight: null }] });
    expect(courseFromOutline(req, two).grading.map((g) => g.weight)).toEqual([0, 0]);
  });

  it('lets homework count only toward a graded component the course has', () => {
    const draft = OutlineDraft.parse({
      title: 'W', summary: 'S.', subject: 'Science', level: 'Grade 5',
      lessons: [{ ...lessons[0], homeworkToward: 'Water cycle diagram quiz' }, { ...lessons[1], homeworkToward: 'quizzes' }],
      grading: [{ item: 'Lesson quizzes', weight: null }],
    });
    expect(orderedLessons(courseFromOutline(req, draft)).map((l) => l.homework.toward)).toEqual(['', 'quizzes']);
  });
});
