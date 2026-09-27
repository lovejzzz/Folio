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
});
