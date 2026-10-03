import { describe, expect, it } from 'vitest';
import { CourseStore, cellState, cmd, lessonAssignments, orderedLessons, parseCourse, project, staleItems } from '../src';
import { sampleCourse } from '../src/sample';

const label = { label: { key: 't' }, source: 'teacher' as const };

describe('homework', () => {
  it('reads a course saved before homework existed as an assignment in every lesson', () => {
    const saved = JSON.parse(JSON.stringify(sampleCourse())) as { lessons: Record<string, Record<string, unknown>> };
    for (const l of Object.values(saved.lessons)) delete l.homework;
    const course = parseCourse(saved);
    for (const l of orderedLessons(course)) expect(l.homework).toEqual({ kind: 'assignment', toward: '' });
    expect(staleItems(course)).toEqual([]);
  });

  it('takes away the written assignment and its rubric when a lesson sets no homework, and undo brings them back', () => {
    const store = new CourseStore(sampleCourse());
    const lesson = orderedLessons(store.getState())[1]!;
    const [assignment] = lessonAssignments(store.getState(), lesson);
    expect(assignment?.rubricId).toBeTruthy();
    store.apply([cmd('lesson.homework', { lessonId: lesson.id, homework: { kind: 'none', toward: '' } })], label);
    const now = store.getState();
    const after = now.lessons[lesson.id]!;
    expect(lessonAssignments(now, after)).toEqual([]);
    expect(now.rubrics[assignment!.rubricId!]).toBeUndefined();
    expect(after.gen.assignments).toBeUndefined();
    expect(cellState(now, after, 'assignments')).toBe('none');
    expect(cellState(now, after, 'rubrics')).toBe('none');
    expect(staleItems(now)).toEqual([]);
    expect(JSON.stringify(project(now, 'assignments', { audience: 'teacher' }))).not.toContain(assignment!.title);
    store.undo();
    expect(lessonAssignments(store.getState(), store.getState().lessons[lesson.id]!)).toHaveLength(1);
  });

  it('puts a written assignment out of date when it becomes a step, and a step has no rubric', () => {
    const store = new CourseStore(sampleCourse());
    const lesson = orderedLessons(store.getState())[0]!;
    store.apply([cmd('lesson.homework', { lessonId: lesson.id, homework: { kind: 'step', toward: 'Final project' } })], label);
    const now = store.getState();
    expect(staleItems(now).map((s) => [s.kind, s.reasons])).toEqual([['assignments', ['homework']]]);
    expect(cellState(now, now.lessons[lesson.id]!, 'rubrics')).toBe('none');
  });

  it('marks a section written before homework existed out of date when it becomes a step, and exports no rubric kept for a step', () => {
    const store = new CourseStore(sampleCourse());
    const lesson = orderedLessons(store.getState())[0]!;
    // Written before homework was stamped.
    delete store.getState().lessons[lesson.id]!.gen.assignments!.basis.homework;
    store.apply([cmd('lesson.homework', { lessonId: lesson.id, homework: { kind: 'step', toward: '' } })], label);
    expect(staleItems(store.getState()).map((s) => s.kind)).toContain('assignments');
    store.apply([cmd('review.keep', { lessonId: lesson.id, kind: 'assignments' })], label);
    const rubricTitle = store.getState().rubrics[lessonAssignments(store.getState(), store.getState().lessons[lesson.id]!)[0]!.rubricId!]!.title;
    expect(JSON.stringify(project(store.getState(), 'rubrics', { audience: 'student' }))).not.toContain(rubricTitle);
  });

  it('keeps a test’s answer key for the teacher: the student copy has the questions and no key', () => {
    const store = new CourseStore(sampleCourse());
    const lesson = orderedLessons(store.getState())[0]!;
    const [assignment] = lessonAssignments(store.getState(), lesson);
    store.apply(
      [
        cmd('lesson.homework', { lessonId: lesson.id, homework: { kind: 'test', toward: 'Unit test' } }),
        cmd('task.update', { taskId: assignment!.id, fields: { title: 'Unit test', steps: ['Find the median of 3, 9, 4. (2 points)'], answerKey: '1. 4 (2 points)\nTotal: 2 points', rubricId: null } }),
      ],
      label,
    );
    const now = store.getState();
    expect(cellState(now, now.lessons[lesson.id]!, 'rubrics')).toBe('none');
    const teacher = JSON.stringify(project(now, 'assignments', { audience: 'teacher' }));
    const student = JSON.stringify(project(now, 'assignments', { audience: 'student' }));
    expect(teacher).toContain('Total: 2 points');
    expect(teacher).toContain('Questions');
    expect(student).toContain('Find the median of 3, 9, 4.');
    expect(student).not.toContain('Total: 2 points');
    expect(student).toContain('Taken in class');
  });

  it('reads an assignment saved before answer keys as having none, and gives in-class graded work a rubric', () => {
    const saved = JSON.parse(JSON.stringify(sampleCourse())) as { tasks: Record<string, Record<string, unknown>> };
    for (const t of Object.values(saved.tasks)) delete t.answerKey;
    const course = parseCourse(saved);
    const lesson = orderedLessons(course)[0]!;
    expect(lessonAssignments(course, lesson)[0]!.answerKey).toBe('');
    const store = new CourseStore(course);
    store.apply([cmd('lesson.homework', { lessonId: lesson.id, homework: { kind: 'inclass', toward: 'Presentation' } })], label);
    expect(cellState(store.getState(), store.getState().lessons[lesson.id]!, 'rubrics')).not.toBe('none');
  });
});
