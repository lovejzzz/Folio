import { CourseStore, lessonAssignments, lessonPieces, orderedLessons, project, setsWork, type Course } from '@folio/core';
import { describe, expect, it } from 'vitest';
import { OutlineDraft, courseBackground, courseFromOutline, generateSection, lessonContext, outlinePrompt, sectionPrompt, type NewCourseRequest } from '../src';
import { fakeInference } from './fake';

const req: NewCourseRequest = {
  brief: 'A graduate seminar: weekly response papers 20%, a presentation each student gives once 20%, a seminar paper 60% with a prospectus due in week 3.',
  lessonCount: 3,
  minutesPerLesson: 180,
  quizSize: 5,
  level: 'Graduate',
  language: 'en',
  materials: ['plan', 'assignments', 'rubrics'],
  sources: [],
};

const outline = () =>
  OutlineDraft.parse({
    title: 'Seminar',
    summary: 'S.',
    subject: 'Philosophy',
    level: 'Graduate',
    grading: [
      { item: 'Weekly response papers', weight: 20 },
      { item: 'Presentation', weight: 20 },
      { item: 'Seminar paper', weight: 60 },
    ],
    lessons: [
      {
        title: 'Dualism',
        summary: 'S1.',
        objectives: ['Reconstruct an argument'],
        homework: 'assignment',
        homeworkToward: 'Weekly response papers',
        homeworkDue: 2,
        homeworkStanding: true,
        also: [
          { kind: 'inclass', toward: 'Presentation' },
          { kind: 'assignment', toward: 'Seminar paper', due: 3 },
          { kind: 'assignment', toward: 'Weekly response papers', due: 2, standing: true },
        ],
      },
      { title: 'Functionalism', summary: 'S2.', objectives: ['Assess a reply'], homework: 'assignment', homeworkToward: 'Weekly response papers', homeworkDue: 3, homeworkStanding: true, also: [{ kind: 'step', toward: 'Seminar paper', due: 3 }] },
      { title: 'Consciousness', summary: 'S3.', objectives: ['Defend a thesis'], homework: 'none' },
    ],
  });

const answer = (prompt: string) => {
  if (prompt.includes('short, ungraded step')) return { title: 'Prospectus', prompt: 'One page: question, thesis, three sources.', steps: ['State the question'] };
  const title = prompt.includes('set again and again') ? 'Response paper' : prompt.includes('"Presentation"') ? 'Presenting and leading' : 'Seminar paper';
  return { title, prompt: `${title}: what to do.`, steps: ['Read', 'Write'], rubric: { levels: [{ label: 'Exemplary', points: 4 }, { label: 'Proficient', points: 3 }, { label: 'Developing', points: 2 }, { label: 'Beginning', points: 1 }], criteria: [{ name: 'Argument', descriptors: ['a', 'b', 'c', 'd'] }, { name: 'Use of texts', descriptors: ['a', 'b', 'c', 'd'] }] }, answerKey: prompt.includes('"Presentation"') ? 'One presenter a week, scored during the discussion.' : '' };
};

describe('a lesson that holds more than one piece of work', () => {
  it('is outlined with its main piece and the others, each with its own due lesson', () => {
    expect(outlinePrompt(req)).toMatch(/Under "also", list what it holds beside its main piece/);
    const course = courseFromOutline(req, outline());
    const [first, second, third] = orderedLessons(course);
    // The same component named twice in a lesson is one piece.
    expect(lessonPieces(first!).map((p) => [p.kind, p.toward, Boolean(p.standing)])).toEqual([['assignment', 'Weekly response papers', true], ['inclass', 'Presentation', false], ['assignment', 'Seminar paper', false]]);
    expect(first!.homework.due).toBe(second!.id);
    expect(first!.also[1]!.due).toBe(third!.id);
    expect(second!.also[0]).toMatchObject({ kind: 'step', toward: 'Seminar paper', due: third!.id });
    expect(setsWork(third!, 'assignments')).toBe(false);
  });

  it('tells the plan of every piece it holds, and of everything due', () => {
    const course = courseFromOutline(req, outline());
    const [first, , third] = orderedLessons(course);
    expect(lessonContext(course, first!)).toMatch(/also holds, each written separately: the piece graded in class "Presentation" \(run in the lesson\); the graded assignment "Seminar paper" \(set before students leave; due at the start of the lesson 2 lessons after this one, "Consciousness" \(wherever students are told the deadline it is in these words, "at the start of the class on Consciousness"/);
    expect(lessonContext(course, third!)).toMatch(/Due at the start of this lesson: "Seminar paper" \(set in "Dualism"\); "Weekly response papers" \(the one written for this lesson, on this lesson's reading or topic\); the short step \(set in "Functionalism", an ungraded step\)/);
  });

  it('keeps a standing piece out of class time, and never says a lesson with one sets no homework', () => {
    const course = courseFromOutline(req, outline());
    const second = orderedLessons(course)[1]!;
    const weekly: Course = { ...course, lessons: { ...course.lessons, [second.id]: { ...second, homework: { ...second.homework, kind: 'none', toward: '' }, also: [{ kind: 'assignment', toward: 'Weekly response papers', standing: true }] } } };
    const told = lessonContext(weekly, weekly.lessons[second.id]!);
    expect(told).toMatch(/"Weekly response papers" \(done outside class every time/);
    expect(told).not.toMatch(/sets no homework/);
  });

  it('plans from the works Folio proposed when the brief only describes its readings, and tells students to read them', () => {
    const course = courseFromOutline(req, outline());
    const [first, second] = orderedLessons(course);
    const vague: Course = { ...course, lessons: { ...course.lessons, [second!.id]: { ...second!, readings: ['Journal articles by Putnam'], suggestedReadings: ['Putnam, H. (1967). Psychological predicates.'] } } };
    expect(lessonContext(vague, vague.lessons[second!.id]!)).toMatch(/plan from these, naming them in full\):\n- Putnam, H\. \(1967\)/);
    expect(lessonContext(vague, vague.lessons[second!.id]!)).not.toMatch(/Journal articles by Putnam/);
    expect(sectionPrompt(vague, vague.lessons[first!.id]!, 'plan')).toMatch(/Before the next lesson students read: Putnam, H\. \(1967\)/);
  });

  it('assigns no book the teacher did not ask for: with no readings in the brief, what Folio proposes is further reading', () => {
    const course = courseFromOutline(req, outline());
    const [first, second] = orderedLessons(course);
    const none: Course = { ...course, lessons: { ...course.lessons, [second!.id]: { ...second!, readings: [], suggestedReadings: ['Sedgewick and Wayne, Algorithms (2011)'] } } };
    expect(lessonContext(none, none.lessons[second!.id]!)).toMatch(/Further reading Folio suggests, which the teacher did not ask for[\s\S]*nothing in the lesson assigns it, tests it or depends on having read it[\s\S]*Sedgewick/);
    expect(sectionPrompt(none, none.lessons[first!.id]!, 'plan')).not.toMatch(/Before the next lesson students read/);
  });

  it('never takes a paper sat in class, or work graded in class, for a standing piece of homework', async () => {
    const quizzes = courseFromOutline(req, {
      ...outline(),
      lessons: outline().lessons.map((l, i) => (i < 2 ? { ...l, homework: 'test' as const, homeworkToward: 'Presentation', homeworkDue: null, homeworkStanding: true, also: [{ kind: 'test' as const, toward: 'Seminar paper', due: null, standing: true }] } : l)),
    });
    const [first, second] = orderedLessons(quizzes);
    expect(lessonPieces(first!).map((p) => Boolean(p.standing))).toEqual([false, false]);
    // An older course may still carry the mark: its second paper is written, never copied from the first.
    const store = new CourseStore({ ...quizzes, lessons: { ...quizzes.lessons, [first!.id]: { ...first!, also: [], homework: { ...first!.homework, standing: true } }, [second!.id]: { ...second!, also: [], homework: { ...second!.homework, standing: true } } } });
    const model = fakeInference(() => ({ title: 'Quiz', instructions: 'Ten minutes.', questions: [1, 2, 3].map((n) => ({ question: `Q${n}?`, points: 2, answer: 'A.' })) }));
    for (const l of [first!, second!]) store.apply((await generateSection(model, store.getState(), l.id, 'assignments')).commands, { label: { key: 'built' }, source: 'ai', undoable: false });
    expect(model.calls).toHaveLength(2);
    const inclass = { ...first!, also: [], homework: { kind: 'inclass' as const, toward: 'Presentation', standing: true } };
    expect(sectionPrompt(quizzes, inclass, 'assignments')).not.toMatch(/due at the start of the lesson after the one that sets it/);
    expect(sectionPrompt(quizzes, inclass, 'assignments')).toMatch(/done in class and graded with a rubric written separately.*scored after class/);
  });

  it('writes each piece once, sets a standing piece again as it stands, and labels each by its component', async () => {
    const store = new CourseStore(courseFromOutline(req, outline()));
    const model = fakeInference((r) => answer(r.prompt));
    const [first, second] = orderedLessons(store.getState());
    store.apply((await generateSection(model, store.getState(), first!.id, 'assignments')).commands, { label: { key: 'built' }, source: 'ai', undoable: false });
    expect(model.calls).toHaveLength(3);
    // The standing piece is asked for as one text for every week.
    // Each piece after the first is shown what the ones before it set, so no problem is set twice.
    expect(model.calls[0]!.prompt).not.toMatch(/Already written for this lesson/);
    expect(model.calls[2]!.prompt).toMatch(/Already written for this lesson, and worked by the same students:\n- Read\n- Write\n- Read\n- Write\nThis piece gives other problems than these: another function, case or set of numbers each time: one of them under other letters/);
    expect(model.calls[0]!.prompt).toMatch(/set again and again through the course in the same form/);
    store.apply((await generateSection(model, store.getState(), second!.id, 'assignments')).commands, { label: { key: 'built' }, source: 'ai', undoable: false });
    // Only the prospectus is written for the second lesson: the response paper is the first lesson's, as it stands.
    expect(model.calls).toHaveLength(4);
    const course: Course = store.getState();
    const titles = (n: number) => lessonAssignments(course, orderedLessons(course)[n]!).map((a) => [a.title, a.toward]);
    expect(titles(0)).toEqual([['Response paper', 'Weekly response papers'], ['Presenting and leading', 'Presentation'], ['Seminar paper', 'Seminar paper']]);
    // The step toward the paper was written knowing the paper as the first lesson set it.
    expect(model.calls[3]!.prompt).toMatch(/The piece itself is already set, in "Dualism": Seminar paper: what to do\. Its tasks: Read \| Write/);
    expect(titles(1)).toEqual([['Response paper', 'Weekly response papers'], ['Prospectus', 'Seminar paper']]);
    // A later lesson that runs the piece graded in class is told what its rubric scores, so its task can be scored with it.
    expect(courseBackground(course)).toMatch(/"Presentation" has its brief and rubric written with the lesson "Dualism" \(scored on: [^)]+\)/);
    expect(Object.keys(course.rubrics)).toHaveLength(4);
    // Each is printed as the piece it is: graded in class, a step toward the paper, due where the outline said.
    const text = JSON.stringify(project(course, 'assignments', { audience: 'student' }).blocks);
    expect(text).toMatch(/Graded in class/);
    expect(text).toMatch(/Builds toward: Seminar paper/);
    expect(text).toMatch(/Due at the start of: Consciousness/);
    // The prospectus is written knowing the paper it leads to was set a lesson before.
    expect(sectionPrompt(course, { ...orderedLessons(course)[1]!, homework: orderedLessons(course)[1]!.also[0]!, also: [] }, 'assignments')).toMatch(/short, ungraded step toward "Seminar paper"/);
  });
});

describe('what the next lesson holds that students must hear of now', () => {
  it('announces a test held beside other work, and prepares a first graded turn', () => {
    const course = courseFromOutline(req, {
      ...outline(),
      lessons: outline().lessons.map((l, i) => (i === 1 ? { ...l, also: [{ kind: 'test' as const, toward: 'Seminar paper', due: null, standing: false }, { kind: 'inclass' as const, toward: 'Presentation', due: null, standing: false }] } : i === 0 ? { ...l, also: [] } : l)),
    });
    const first = orderedLessons(course)[0]!;
    const told = sectionPrompt(course, first, 'plan');
    expect(told).toMatch(/announces the test it holds \("Seminar paper"\), what it covers and what to bring/);
    expect(told).toMatch(/prepares the work graded in class there for the first time \("Presentation"\)/);
    expect(told).toMatch(/No other graded piece is set, handed out or collected in this lesson than those named here\./);
  });
});

describe('a piece graded in class every time, with new questions each time', () => {
  it('has its plan write the questions of that lesson, since its brief names none', () => {
    const draft = outline();
    draft.lessons[0]!.also = [{ kind: 'inclass', toward: 'Presentation', due: null, standing: true }];
    draft.lessons[2] = { ...draft.lessons[2]!, homework: 'inclass', homeworkToward: 'Presentation', homeworkStanding: true };
    const course = courseFromOutline(req, draft);
    const [first, , third] = orderedLessons(course);
    for (const lesson of [first!, third!]) expect(lessonContext(course, lesson)).toMatch(/brief and rubric are one text for every time and hold no questions or problems, so the ones of this time are written out in full/);
    // A piece run once (a presentation each student gives) scripts nothing for them.
    expect(lessonContext(courseFromOutline(req, outline()), orderedLessons(courseFromOutline(req, outline()))[0]!)).not.toMatch(/the ones of this time/);
  });
});

describe('weekly work the brief has students do before a lesson', () => {
  it('is told the lesson it is due at, so a quiz on the reading is on that reading', () => {
    const course = courseFromOutline(req, outline());
    const [first, second] = orderedLessons(course);
    const weekly = { ...first!, also: [], homework: { kind: 'assignment' as const, toward: 'Weekly response papers', due: second!.id } };
    expect(sectionPrompt(course, weekly, 'assignments')).toMatch(/unless the brief has students do it before a lesson to prepare for it.*The lesson it is due at is "Functionalism": S2\./);
  });
});

describe('a deadline in a lesson of several meetings', () => {
  it('names the first meeting of the next lesson, since "next time" is also this lesson’s next meeting', () => {
    const sessions = [{ kind: 'lecture' as const, minutes: 50 }, { kind: 'problems' as const, minutes: 50 }];
    const told = (course: Course) => {
      const [first, second] = orderedLessons(course);
      return lessonContext(course, { ...first!, also: [], homework: { kind: 'assignment' as const, toward: 'Weekly response papers', due: second!.id } });
    };
    expect(told(courseFromOutline({ ...req, sessions }, outline()))).toMatch(/due at the first meeting of the next lesson/);
    expect(told(courseFromOutline(req, outline()))).toMatch(/due at the start of the next lesson/);
  });
});

describe('a piece that is all questions with one right answer', () => {
  it('is scored by its answers and carries no rubric', async () => {
    const course = courseFromOutline(req, outline());
    const third = orderedLessons(course)[2]!;
    const quiz = { ...course, lessons: { ...course.lessons, [third.id]: { ...third, homework: { kind: 'assignment' as const, toward: 'Weekly response papers' } } } };
    const model = fakeInference(() => ({ title: 'Reading quiz', prompt: 'One point each.', steps: ['Which? A. x B. y', 'Which? A. p B. q'], rubric: { levels: [{ label: 'A', points: 3 }, { label: 'B', points: 2 }, { label: 'C', points: 1 }], criteria: [] }, answerKey: '1. A\n2. B' }));
    const store = new CourseStore(quiz);
    store.apply((await generateSection(model, quiz, third.id, 'assignments')).commands, { label: { key: 'built' }, source: 'ai', undoable: false });
    const [task] = lessonAssignments(store.getState(), orderedLessons(store.getState())[2]!);
    expect(task).toMatchObject({ title: 'Reading quiz', rubricId: null });
    expect(Object.keys(store.getState().rubrics)).toHaveLength(0);
  });
});

describe('a component graded in class with a piece of its own in each lesson', () => {
  it('points no lesson to the first one’s brief: a lab every week is a new lab', () => {
    const draft = outline();
    draft.lessons[0]!.also = [{ kind: 'inclass', toward: 'Presentation', due: null, standing: false }];
    draft.lessons[2] = { ...draft.lessons[2]!, homework: 'inclass', homeworkToward: 'Presentation', homeworkStanding: false };
    const course = courseFromOutline(req, draft);
    expect(courseBackground(course)).not.toMatch(/"Presentation" has its brief and rubric written with/);
    expect(lessonContext(course, orderedLessons(course)[2]!)).not.toMatch(/runs it as it stands/);
    // Held by one lesson only, it is the one brief every lesson scores with.
    expect(courseBackground(courseFromOutline(req, outline()))).toMatch(/"Presentation" has its brief and rubric written with the lesson "Dualism"/);
  });
});

describe('work done in class that is more than its minutes hold', () => {
  it('is asked for again at about half the size', async () => {
    const course = courseFromOutline(req, outline());
    const first = orderedLessons(course)[0]!;
    // The opening segment only lists how the course is graded: its minutes are not the piece's.
    const segments = [
      { id: 'x_0', session: 0, kind: 'warmup' as const, title: 'How the course is graded', minutes: 30, description: 'Weekly response papers 20%, Presentation 20%, Seminar paper 60%.', teacherNotes: '' },
      { id: 'x_1', session: 0, kind: 'practice' as const, title: 'Presentations', minutes: 5, description: 'Students present in turn.', teacherNotes: '' },
    ];
    const timed = { ...course, lessons: { ...course.lessons, [first.id]: { ...first, segments, also: [], homework: { kind: 'inclass' as const, toward: 'Presentation', standing: false } } } };
    const long = Array.from({ length: 80 }, () => 'word').join(' ');
    const model = fakeInference((_r, call) => ({ ...(answer('"Presentation"') as object), steps: call === 1 ? [long, long] : ['Present.', 'Answer one question.'], answerKey: 'Run it in turn.' }));
    await generateSection(model, timed, first.id, 'assignments');
    expect(model.calls).toHaveLength(2);
    expect(model.calls[1]!.prompt).toMatch(/The plan gives this 5 minutes: ask for about half as much/);
    // And a piece that names more minutes than its segment has is asked to say the plan's time.
    const wrongTime = fakeInference((_r, call) => ({ ...(answer('"Presentation"') as object), prompt: call === 1 ? 'Work with your neighbors for 20 minutes.' : 'Work with your neighbors for 5 minutes.', answerKey: 'Run it in turn.' }));
    await generateSection(wrongTime, timed, first.id, 'assignments');
    expect(wrongTime.calls[1]!.prompt).toMatch(/The plan gives this 5 minutes, and the piece says 20/);
  });
});

describe('the sheets of a lesson that holds a piece graded in class', () => {
  it('leave that piece to its own writer: a sheet for it would be a second version', async () => {
    const { handoutsPrompt } = await import('../src/handouts');
    const course = courseFromOutline(req, outline());
    const [first, , third] = orderedLessons(course);
    const plan = { segments: [], keyIdeas: [], vocabulary: [] };
    expect(handoutsPrompt(course, first!, plan)).toMatch(/Graded in this lesson, each printed with its own tasks by another writer: "Presentation"\. Write no sheet for any of them/);
    expect(handoutsPrompt(course, third!, plan)).not.toMatch(/Graded in this lesson/);
  });
});

describe('the first lesson to run a turn students prepare', () => {
  it('introduces and models it, and scores from the next lesson', () => {
    const draft = outline();
    draft.lessons[0]!.also = [];
    draft.lessons[1] = { ...draft.lessons[1]!, homework: 'inclass', homeworkToward: 'Presentation', homeworkStanding: true, also: [] };
    draft.lessons[2] = { ...draft.lessons[2]!, homework: 'inclass', homeworkToward: 'Presentation', homeworkStanding: true };
    const course = courseFromOutline(req, draft);
    const [, second, third] = orderedLessons(course);
    expect(lessonContext(course, second!)).toMatch(/This is the first lesson to run it.*scored turns begin next time/);
    expect(lessonContext(course, third!)).not.toMatch(/This is the first lesson to run it/);
  });
});
