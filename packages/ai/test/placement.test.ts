import { describe, expect, it } from 'vitest';
import { orderedLessons } from '@folio/core';
import { OutlineDraft, courseFromOutline, outlinePrompt, type NewCourseRequest } from '../src';
import { gradingIn } from '../src/gradingIn';
import { formOf, placedWork } from '../src/placement';

const PHYSICS = 'Mechanics for first-year students. Weekly problem sets 20%, recitation group problems 10%, two midterms 20% each, final exam 30%.';
const tests = (brief: string, n: number) => placedWork(gradingIn(brief), n).flatMap((held, i) => held.filter((p) => p.kind === 'test').map((p) => `${i + 1} ${p.toward}`));

describe('where a course’s recurring work and its tests fall', () => {
  it('reads from the brief’s words what kind of work each component is and how often it comes', () => {
    const forms = (brief: string) => Object.fromEntries(gradingIn(brief).map((st) => [st.item, [formOf(st).kind, formOf(st).every, formOf(st).nominated]]));
    expect(forms(PHYSICS)).toEqual({ 'Weekly problem sets': ['assignment', true, false], 'Recitation group problems': ['inclass', true, false], 'Midterm 1': ['test', false, false], 'Midterm 2': ['test', false, false], 'Final exam': ['test', false, false] });
    // A final proposal is a paper, a take-home midterm is homework, and a paper's lessons are the outline's to name.
    const methods = forms('An annotated bibliography 15%, a take-home midterm 20%, a methods section 20%, the final proposal of 4,000 words 35%, and seminar leadership of one week\'s discussion 10%.');
    expect([methods['Final proposal'], methods['Take-home midterm'], methods['Seminar leadership']]).toEqual([['assignment', false, true], ['assignment', false, true], ['inclass', true, false]]);
  });

  it('has every lesson hold what runs in every lesson, so each lesson’s writers are told of it', () => {
    const held = placedWork(gradingIn('Reading quizzes at the start of most classes 15%, a midterm 35%, a final exam 40%, participation in discussion 10%.'), 4);
    expect(held.map((l) => l.filter((p) => p.kind === 'inclass').map((p) => [p.toward, p.standing]))).toEqual(Array.from({ length: 4 }, () => [['Participation in discussion', true]]));
  });

  it('spreads each run of tests through the course on its own, the final last, none in the first lesson', () => {
    expect(tests(PHYSICS, 14)).toEqual(['5 Midterm 1', '9 Midterm 2', '14 Final exam']);
    expect(tests('Homework problems each week 20%, four in-class quizzes 20%, two exams 20% each, a final exam 20%.', 30)).toEqual(['6 In-class quizzes', '10 Exam 1', '12 In-class quizzes', '18 In-class quizzes', '20 Exam 2', '24 In-class quizzes', '30 Final exam']);
    // A quiz every lesson starts at the second, and gives way to an exam sat in the same lesson.
    const calc = placedWork(gradingIn('Weekly online homework 15%, weekly recitation quizzes 15%, two midterms 20% each, final exam 30%.'), 6);
    expect(calc.map((held) => held.filter((p) => p.kind === 'test').map((p) => p.toward))).toEqual([[], ['Midterm 1'], ['Weekly recitation quizzes'], ['Midterm 2'], ['Weekly recitation quizzes'], ['Final exam']]);
  });

  it('gives a course the same work in every lesson however the outline placed it, and keeps the outline’s lessons for a paper', async () => {
    const req: NewCourseRequest = { brief: 'Statistics. Weekly lab worksheets 20%, a midterm 25%, a final exam 30%, and a data analysis project with a short report 25%.', lessonCount: 4, minutesPerLesson: 75, quizSize: 5, level: 'Undergraduate', language: 'en', materials: ['plan', 'assignments'], sources: [] };
    const lesson = (more: object) => ({ title: 'T', summary: 'S.', objectives: ['Do it'], ...more });
    const outline = (lessons: object[]) => OutlineDraft.parse({ title: 'S', summary: 'S.', subject: 'Statistics', level: 'Undergraduate', grading: [{ item: 'Lab worksheets', weight: 20 }, { item: 'Midterm exam', weight: 25 }, { item: 'Final', weight: 30 }, { item: 'Project', weight: 25 }], lessons });
    const held = (lessons: object[]) => orderedLessons(courseFromOutline(req, outline(lessons))).map((l) => [l.homework, ...l.also].map((p) => `${p.kind} ${p.toward}`));
    const one = held([lesson({ homework: 'inclass', homeworkToward: 'Lab worksheets' }), lesson({ homework: 'assignment', homeworkToward: 'Project', homeworkDue: 4 }), lesson({ homework: 'test', homeworkToward: 'Midterm exam' }), lesson({ homework: 'test', homeworkToward: 'Final' })]);
    const other = held([lesson({ homework: 'assignment', homeworkToward: 'Lab worksheets', homeworkDue: 2 }), lesson({ homework: 'test', homeworkToward: 'Midterm exam', also: [{ kind: 'assignment', toward: 'Project', due: 4 }] }), lesson({ homework: 'none' }), lesson({ homework: 'test', homeworkToward: 'Final' })]);
    expect(one).toEqual([['inclass Weekly lab worksheets'], ['test Midterm', 'inclass Weekly lab worksheets', 'assignment Data analysis project'], ['inclass Weekly lab worksheets'], ['test Final exam', 'inclass Weekly lab worksheets']]);
    expect(other).toEqual(one);
    // A paper the outline made due in the lesson before the final moves on to the first lesson clear of a test and its eve.
    const late = orderedLessons(courseFromOutline({ ...req, lessonCount: 6 }, outline([lesson({ homework: 'assignment', homeworkToward: 'Project', homeworkDue: 2 }), lesson({}), lesson({}), lesson({}), lesson({}), lesson({})])));
    const project = [late[0]!.homework, ...late[0]!.also].find((p) => p.toward === 'Data analysis project')!;
    expect(late.findIndex((l) => l.id === project.due) + 1).toBe(4);
    expect(outlinePrompt(req)).toContain('every lesson holds "Weekly lab worksheets"; the tests are taken in these lessons, and nowhere else: lesson 2: "Midterm"; lesson 4: "Final exam".');
    expect(outlinePrompt(req)).toContain('Under "homework" and "also" you place only "Data analysis project"');
    // An outline that leaves out the one piece it was to place is asked once more, by that piece's name and no other.
    const { generateOutline } = await import('../src');
    const { fakeInference } = await import('./fake');
    const bare = [lesson({ homework: 'none' }), lesson({ homework: 'none' }), lesson({ homework: 'none' }), lesson({ homework: 'none' })];
    const model = fakeInference((_r, call) => outline(call > 1 ? [bare[0]!, lesson({ homework: 'assignment', homeworkToward: 'Data analysis project', homeworkDue: 4 }), bare[2]!, bare[3]!] : bare));
    await generateOutline(model, req);
    expect(model.calls).toHaveLength(2);
    expect(model.calls[1]!.prompt).toMatch(/No lesson holds these graded components, named exactly as under "grading": Data analysis project\./);
  });
});
