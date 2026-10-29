import { orderedLessons, type Course } from '@folio/core';
import { describe, expect, it } from 'vitest';
import { handoutsPrompt } from '../src/handouts';
import { ledTurnScripted, preparedPieces } from '../src/ledTurn';
import { unlistedProblems } from '../src/onScreen';
import { smallCourse } from './fake';

/** A seminar whose leadership a student prepares, as the grade card has it, held by the first lesson. */
const seminar = (prepared = true): Course => {
  const c = smallCourse();
  const first = orderedLessons(c)[0]!;
  return {
    ...c,
    grading: [{ id: 'g1', item: 'Seminar leadership', weight: 10, judged: 'levels', card: { who: 'individual', prepared, handIn: 'none', allowed: '', length: '', source: '' } }],
    lessons: { ...c.lessons, [first.id]: { ...first, homework: { kind: 'inclass', toward: 'Seminar leadership', standing: true }, also: [] } },
  } as Course;
};
const segment = (title: string, description: string, shown?: string[]) => ({ title, description, teacherNotes: '', shown });

describe('a turn a student prepares', () => {
  it('is known from the card', () => {
    expect(preparedPieces(seminar(), orderedLessons(seminar())[0]!)).toEqual(['Seminar leadership']);
    expect(preparedPieces(seminar(false), orderedLessons(seminar(false))[0]!)).toEqual([]);
  });

  it('is asked for again when the plan lists questions for the leader, and left alone when the questions are the leader\'s', () => {
    const course = seminar();
    const lesson = orderedLessons(course)[0]!;
    // Four course-written questions on the screen for the leader's discussion, in six lessons of seven.
    const scripted = [segment('Seminar leadership: the leader leads discussion', 'The leader leads the discussion with the questions on the screen.', ['Q1. Where does theory sit in a proposal?', 'Q2. What does a researcher risk?'])];
    expect(ledTurnScripted(scripted, course, lesson)).toMatchObject([{ index: null, flag: { code: 'schemaIssue', values: { path: 'segments' } } }]);
    expect(JSON.stringify(ledTurnScripted(scripted, course, lesson)[0]!.flag)).toContain('Seminar leadership: the leader leads discussion');
    const own = [segment('Seminar leadership: the leader leads discussion', 'The leader leads the discussion on their own questions; the teacher suggests none.', ['Creswell and Creswell, ch. 2'])];
    expect(ledTurnScripted(own, course, lesson)).toEqual([]);
    // Another segment's questions are the plan's to list.
    const other = [segment('Building an ERIC search', 'Work through the questions on the screen.', ['What are the concepts in the question?'])];
    expect(ledTurnScripted(other, course, lesson)).toEqual([]);
    expect(ledTurnScripted(scripted, seminar(false), orderedLessons(seminar(false))[0]!)).toEqual([]);
  });

  it('gets no sheet of questions from the sheets\' writer', () => {
    const course = seminar();
    const lesson = orderedLessons(course)[0]!;
    const plan = { keyIdeas: [], segments: lesson.segments };
    expect(handoutsPrompt(course, lesson, plan)).toContain('Run in this lesson by a student who prepared it: "Seminar leadership". What they ask and show is theirs: print no questions');
    expect(handoutsPrompt(course, lesson, plan)).not.toContain('print them as a sheet under the piece\'s name');
    const daily = seminar(false);
    expect(handoutsPrompt(daily, orderedLessons(daily)[0]!, plan)).toContain('print them as a sheet under the piece\'s name');
  });
});

describe('what a plan says is on the screen', () => {
  it('is asked for, once, when nothing is listed for it', () => {
    // "Two gap sentences … are on the screen" with nothing under shown: the sheet said "on the screen", the slide "work from the sheet", and the sentences were nowhere.
    const unlisted = [segment('Name the gap', 'Two gap sentences for the six studies are on the screen. Students choose the stronger.')];
    const problems = unlistedProblems(unlisted);
    expect(problems).toMatchObject([{ index: null, advisory: true, flag: { code: 'schemaIssue', values: { path: 'segments' } } }]);
    expect(JSON.stringify(problems[0]!.flag)).toContain('Name the gap');
    expect(unlistedProblems([segment('Name the gap', 'Two gap sentences for the six studies are on the screen.', ['Version 1: No one has studied absence in ninth grade.', 'Version 2: Few studies follow ninth graders through the year.'])])).toEqual([]);
    expect(unlistedProblems([segment('Break', 'Leave the code on the screen over the break.')])).toEqual([]);
    expect(unlistedProblems([segment('Demo', 'The teacher types and runs the query on the screen.')])).toEqual([]);
  });
});
