import { describe, expect, it } from 'vitest';
import { MATERIAL_KINDS, orderedLessons } from '@folio/core';
import { OutlineDraft, courseBackground, courseFromOutline, groundedIn, lessonContext, outlinePrompt, sectionPrompt, type NewCourseRequest } from '../src';

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
  it('carries the standards a brief names onto the lessons that serve them, and drops a code the teacher never gave', () => {
    const brief = 'Fractions for grade 3: two lessons. Standards: CCSS 3.NF.A.1 and 3.NF.A.2.';
    const withCodes = [{ ...lessons[0]!, standards: ['3.NF.A.1', '3.NF.A.3'] }, { ...lessons[1]!, standards: ['3.nf.a.2 '] }];
    const course = courseFromOutline({ ...req, brief }, OutlineDraft.parse({ title: 'Fractions', summary: 'S.', subject: 'Math', level: 'Grade 3', lessons: withCodes }));
    const [first, second] = orderedLessons(course);
    expect([first!.standards, second!.standards]).toEqual([['3.NF.A.1'], ['3.nf.a.2']]);
    expect(lessonContext(course, first!)).toContain('It serves these standards, which the teacher answers for: 3.NF.A.1.');
    expect(outlinePrompt({ ...req, brief })).toContain('never a code they do not name');
  });

  it('grades a component on completion only when the brief says so in its own words', () => {
    const grading = [{ item: 'Weekly drafts', weight: 40, scoring: 'completion' }, { item: 'Final paper', weight: 60, scoring: 'scored' }];
    const draft = OutlineDraft.parse({ title: 'Writing', summary: 'S.', subject: 'Writing', level: 'Undergraduate', lessons, grading });
    const judged = (brief: string) => courseFromOutline({ ...req, brief }, draft).grading.map((g) => g.judged);
    expect(judged('Weekly drafts 40%, graded complete or incomplete; a final paper 60%.')).toEqual(['complete', 'levels']);
    // A model that marks completion where the brief never speaks of it is not believed: "for complete beginners" is not a grading rule.
    expect(judged('Writing for complete beginners. Weekly drafts 40%, a final paper 60%.')).toEqual(['levels', 'levels']);
    // Left unsaid, a component is scored.
    expect(OutlineDraft.parse({ title: 'W', summary: 'S.', subject: 'W', level: 'U', lessons, grading: [{ item: 'Exam', weight: 100 }] }).grading[0]!.scoring).toBe('scored');
  });

  it('starts a doctoral seminar without the materials it does not use, unless the teacher chose', () => {
    const draft = OutlineDraft.parse({ title: 'Proseminar', summary: 'S.', subject: 'Sociology', level: 'Doctoral (PhD) seminar', lessons });
    const on = (c: ReturnType<typeof courseFromOutline>) => MATERIAL_KINDS.filter((k) => c.materials[k].enabled);
    const all = { ...req, materials: [...MATERIAL_KINDS] };
    const doctoral = on(courseFromOutline(all, draft));
    expect(doctoral).toContain('plan');
    expect(doctoral).toContain('discussions');
    for (const k of ['slides', 'quiz', 'study', 'faq'] as const) expect(doctoral).not.toContain(k);
    expect(on(courseFromOutline({ ...all, level: 'Second-year undergraduate' }, draft))).toEqual([...MATERIAL_KINDS]);
    expect(on(courseFromOutline({ ...req, materials: ['plan', 'quiz'] }, draft))).toEqual(MATERIAL_KINDS.filter((k) => k === 'plan' || k === 'quiz'));
  });

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
    // The work is the teacher's; the chapters are the outline's guess, and say so.
    expect(orderedLessons(course).map((l) => l.readings)).toEqual([['Hobbes, Leviathan, ch. 13–17 (to confirm)'], []]);
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
    expect(sectionPrompt(course, second!, 'plan')).toContain(`Due at the start of this lesson: "Final essay" (set in "${first!.title}"). The plan takes it in by name`);
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

  it('carries what is the same at every meeting to every writer', () => {
    const draft = OutlineDraft.parse({ title: 'Intro to programming', summary: 's', subject: 'CS', level: 'Undergraduate', grading: [], lessons: [{ title: 'Variables', summary: 's', objectives: ['o'] }], setup: [' Java 21 in IntelliJ IDEA ', '120 students, seated in fixed groups of four', ''] });
    const course = courseFromOutline({ ...req, brief: 'Java 21 in IntelliJ IDEA; 120 students in groups of four.' }, draft);
    expect(course.setup).toEqual(['Java 21 in IntelliJ IDEA', '120 students, seated in fixed groups of four']);
    expect(courseBackground(course)).toContain('The same at every meeting, as the teacher set it (every material agrees with these, and none says otherwise):\n- Java 21 in IntelliJ IDEA\n- 120 students, seated in fixed groups of four');
    // A course saved before this has none, and its background says nothing of it.
    expect(courseBackground({ ...course, setup: [] })).not.toContain('The same at every meeting');
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
    expect(orderedLessons(course).map((l) => l.readings)).toEqual([['Locke, Second Treatise, ch. 5 (to confirm)'], ['Field notes, week 2']]);
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

describe('an outline that leaves a graded component out', () => {
  it('is asked once more, with the components no lesson holds by name', async () => {
    const { generateOutline } = await import('../src');
    const lesson = (title: string, toward: string) => ({ title, summary: 'S.', objectives: ['Do it'], homework: toward ? ('assignment' as const) : ('none' as const), homeworkToward: toward });
    const draft = (withExam: boolean) => ({ title: 'Biology', summary: 'S.', subject: 'Biology', level: 'Undergraduate', grading: [{ item: 'Problem sets', weight: 20 }, { item: 'Final exam', weight: 80 }], lessons: [lesson('Cells', 'Problem sets'), withExam ? { ...lesson('Review', ''), homework: 'test' as const, homeworkToward: 'Final exam' } : lesson('Review', '')] });
    const { fakeInference } = await import('./fake');
    const model = fakeInference((_r, call) => draft(call > 1));
    const out = await generateOutline(model, { brief: 'Biology: problem sets 20%, a final exam 80%.', lessonCount: 2, minutesPerLesson: 50, quizSize: 5, level: '', language: 'en', materials: ['plan'], sources: [] });
    expect(model.calls).toHaveLength(2);
    expect(model.calls[1]!.prompt).toMatch(/No lesson holds these graded components, named exactly as under "grading": Final exam/);
    expect(out.lessons[1]!.homeworkToward).toBe('Final exam');
  });
});
