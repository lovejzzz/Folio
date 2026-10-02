import { describe, expect, it } from 'vitest';
import { orderedLessons, parseCourse, type Assignment, type Course } from '../src';
import { sampleCourse } from '../src/sample';

/** The sample makes new IDs each time it is made: every test damages copies of this one. */
const sample = sampleCourse();

/** A saved copy of the sample, damaged by `harm`, read back the way Folio reads every course. */
function readBack(harm: (raw: Course) => void): Course {
  const raw = structuredClone(sample);
  harm(raw);
  return parseCourse(raw);
}

describe('a course read back', () => {
  it('that agrees with itself comes back as it was', () => {
    expect(parseCourse(structuredClone(sample))).toEqual(sample);
  });

  it('lists each lesson once, only lessons that exist, and none is lost', () => {
    const course = readBack((raw) => {
      const [a, b] = raw.lessonOrder as [string, string];
      raw.lessonOrder = [a, a, 'gone', b];
    });
    const ids = Object.keys(sample.lessons);
    expect(course.lessonOrder.slice(0, 2)).toEqual(sample.lessonOrder.slice(0, 2));
    expect([...course.lessonOrder].sort()).toEqual([...ids].sort());
  });

  it('keys each entity by its own ID, keeping the first of two that share one', () => {
    const course = readBack((raw) => {
      const lesson = Object.values(raw.lessons)[0]!;
      delete raw.lessons[lesson.id];
      raw.lessons.wrongKey = lesson;
    });
    const first = orderedLessons(course)[0]!;
    expect(course.lessons[first.id]).toBe(first);
    expect(course.lessons.wrongKey).toBeUndefined();
  });

  it('drops a task listed in the wrong lesson, or of a lesson that is gone, and lists one left out', () => {
    const [first, second] = orderedLessons(sample);
    const moved = first!.taskIds[0]!;
    const course = readBack((raw) => {
      raw.lessons[second!.id]!.taskIds.unshift(moved);
      raw.lessons[first!.id]!.taskIds = raw.lessons[first!.id]!.taskIds.filter((id) => id !== moved);
      raw.tasks.orphan = { ...raw.tasks[moved]!, id: 'orphan', lessonId: 'gone' };
    });
    expect(course.lessons[second!.id]!.taskIds).not.toContain(moved);
    expect(course.lessons[first!.id]!.taskIds).toContain(moved);
    expect(course.tasks.orphan).toBeUndefined();
  });

  it('lets go of a rubric, objective, source or syllabus that is gone', () => {
    const assignment = Object.values(sample.tasks).find((t): t is Assignment => t.kind === 'assignment' && t.rubricId !== null)!;
    const lesson = orderedLessons(sample)[0]!;
    const course = readBack((raw) => {
      delete raw.rubrics[assignment.rubricId!];
      raw.lessons[lesson.id]!.objectiveIds.push('gone');
      raw.syllabus = { sourceId: 'gone', check: null };
      raw.sourceOrder.push('gone');
    });
    expect((course.tasks[assignment.id] as Assignment).rubricId).toBeNull();
    expect(course.lessons[lesson.id]!.objectiveIds).not.toContain('gone');
    expect(course.syllabus).toBeNull();
    expect(course.sourceOrder).not.toContain('gone');
  });
});

describe('a flag written by a newer Folio', () => {
  it('is read as a plain note, and the course still opens', () => {
    const course = readBack((raw) => void Object.values(raw.tasks)[0]!.flags.push({ code: 'aCodeFromTheFuture', values: { n: 1 } } as never));
    expect(Object.values(course.tasks)[0]!.flags.at(-1)).toEqual({ code: 'note', values: { text: 'This needs a look. Reload Folio to see why.' } });
  });
});
