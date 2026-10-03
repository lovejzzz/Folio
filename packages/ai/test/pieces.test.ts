import { CourseStore, lessonAssignments, lessonPieces, orderedLessons, project, setsWork, type Course } from '@folio/core';
import { describe, expect, it } from 'vitest';
import { OutlineDraft, courseFromOutline, generateSection, lessonContext, outlinePrompt, sectionPrompt, type NewCourseRequest } from '../src';
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
    expect(lessonContext(course, first!)).toMatch(/also holds, each written separately: the piece graded in class "Presentation" \(run in the lesson\); the graded assignment "Seminar paper" \(set before students leave\)/);
    expect(lessonContext(course, third!)).toMatch(/Due at the start of this lesson: "Seminar paper" \(set in "Dualism"\); "Weekly response papers" \(set in "Functionalism"\); the short step \(set in "Functionalism", an ungraded step\)/);
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

  it('writes each piece once, sets a standing piece again as it stands, and labels each by its component', async () => {
    const store = new CourseStore(courseFromOutline(req, outline()));
    const model = fakeInference((r) => answer(r.prompt));
    const [first, second] = orderedLessons(store.getState());
    store.apply((await generateSection(model, store.getState(), first!.id, 'assignments')).commands, { label: { key: 'built' }, source: 'ai', undoable: false });
    expect(model.calls).toHaveLength(3);
    // The standing piece is asked for as one text for every week.
    expect(model.calls[0]!.prompt).toMatch(/set again and again through the course in the same form/);
    store.apply((await generateSection(model, store.getState(), second!.id, 'assignments')).commands, { label: { key: 'built' }, source: 'ai', undoable: false });
    // Only the prospectus is written for the second lesson: the response paper is the first lesson's, as it stands.
    expect(model.calls).toHaveLength(4);
    const course: Course = store.getState();
    const titles = (n: number) => lessonAssignments(course, orderedLessons(course)[n]!).map((a) => [a.title, a.toward]);
    expect(titles(0)).toEqual([['Response paper', 'Weekly response papers'], ['Presenting and leading', 'Presentation'], ['Seminar paper', 'Seminar paper']]);
    expect(titles(1)).toEqual([['Response paper', 'Weekly response papers'], ['Prospectus', 'Seminar paper']]);
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
