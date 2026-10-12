import { buildPlan, toRun } from '@folio/ai';
import { CourseStore, cmd, orderedLessons, staleItems, type Course } from '@folio/core';
import { sampleCourse } from '@folio/core/sample';
import { describe, expect, it } from 'vitest';
import { afterPlan } from './afterPlan';

const key = (s: { lessonId: string; kind: string }) => `${s.lessonId}:${s.kind}`;
/** The sample course as a teacher who chose no study guides has it: none written, the material off. */
function withoutStudy(): Course {
  const course = sampleCourse();
  for (const lesson of orderedLessons(course)) delete lesson.gen.study;
  course.materials.study.enabled = false;
  return course;
}
const apply = (course: Course, ...commands: Parameters<CourseStore['apply']>[0]) => {
  const store = new CourseStore(course);
  store.apply(commands, { label: { key: 'preview' }, source: 'ai' });
  return store.getState();
};

describe('what follows a plan asked for in words', () => {
  it('a material added later: each lesson\'s part is written for the first time, by the build\'s own plan', () => {
    const before = withoutStudy();
    const after = apply(before, cmd('material.set', { kind: 'study', enabled: true }));
    const work = afterPlan(after, new Set(staleItems(before).map(key)));
    expect(work.build.map((t) => t.kind)).toEqual(['study', 'study', 'study', 'study']);
    // What the preview prices is what a build started now runs, part for part.
    expect(work.tasks.map(key)).toEqual(toRun(buildPlan(after)).map(key));
    expect(work.updates).toEqual([]);
    expect(work.kept).toEqual([]);
  });

  it('a change that makes parts out of date: those are written again, and the teacher\'s own are kept and named', () => {
    const before = sampleCourse();
    const first = orderedLessons(before)[0]!;
    first.gen.slides = { ...first.gen.slides!, edited: true };
    const after = apply(before, cmd('lesson.update', { lessonId: first.id, title: 'Asking good questions' }));
    const work = afterPlan(after, new Set(staleItems(before).map(key)));
    expect(work.updates.length).toBeGreaterThan(0);
    expect(work.updates.every((u) => u.lessonId === first.id)).toBe(true);
    expect(work.updates.map((u) => u.kind)).not.toContain('slides');
    expect(work.kept).toEqual([{ lessonId: first.id, kind: 'slides' }]);
    expect(work.tasks.map(key).sort()).toEqual(work.updates.map(key).sort());
    expect(work.build).toEqual([]);
  });

  it('a change that touches nothing written: nothing follows', () => {
    const before = sampleCourse();
    const work = afterPlan(before, new Set(staleItems(before).map(key)));
    expect(work).toEqual({ updates: [], build: [], tasks: [], kept: [] });
  });

  it('leaves alone what was out of date before the plan', () => {
    const course = sampleCourse();
    const before = apply(course, cmd('lesson.update', { lessonId: orderedLessons(course)[0]!.id, title: 'Renamed earlier' }));
    const stale = new Set(staleItems(before).map(key));
    expect(stale.size).toBeGreaterThan(0);
    expect(afterPlan(before, stale).updates).toEqual([]);
  });
});
