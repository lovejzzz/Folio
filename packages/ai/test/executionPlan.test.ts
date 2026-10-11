import { MATERIAL_KINDS, type Course, type MaterialKind } from '@folio/core';
import { describe, expect, it } from 'vitest';
import { executionPlan, missingTargets, ownToWrite, planOf } from '../src/build';
import { smallCourse } from './fake';

/** The small course with only these materials chosen, and these parts of its first lesson written already. */
function chosen(kinds: MaterialKind[], written: string[] = [], homework: 'assignment' | 'none' = 'assignment'): Course {
  const c = smallCourse();
  const [first, second] = c.lessonOrder as [string, string];
  const stamp = { at: '2026-10-11T00:00:00.000Z', inputs: '', flags: [] };
  return {
    ...c,
    materials: Object.fromEntries(MATERIAL_KINDS.map((k) => [k, { enabled: kinds.includes(k), options: {} }])) as Course['materials'],
    lessons: {
      [first]: { ...c.lessons[first]!, homework: { kind: 'assignment', toward: '' }, gen: Object.fromEntries(written.map((k) => [k, stamp])) as never },
      [second]: { ...c.lessons[second]!, homework: { kind: homework, toward: '' }, also: [] },
    },
  };
}
const said = (c: Course, ids?: string[]) => executionPlan(c, ids).map((t) => `${t.lesson}:${t.kind}:${t.state}${t.neededBy ? `(for ${t.neededBy})` : ''}`);

describe('what a build of a course would do', () => {
  it('is only what was chosen: slides alone, a plan alone, a quiz alone, a guide alone', () => {
    expect(said(chosen(['slides']))).toEqual(['1:slides:run', '2:slides:run']);
    expect(said(chosen(['plan']))).toEqual(['1:plan:run', '2:plan:run']);
    expect(said(chosen(['quiz']))).toEqual(['1:quiz:run', '2:quiz:run']);
    expect(said(chosen(['study']))).toEqual(['1:study:run', '2:study:run']);
    expect(said(chosen(['plan', 'slides'])).filter((x) => /quiz|study|assignments/.test(x))).toEqual([]);
  });

  it('names the work a chosen material needs, and whose need it is: rubrics alone, with no graded work written', () => {
    expect(said(chosen(['rubrics']))).toEqual(['1:assignments:run(for rubrics)', '2:assignments:run(for rubrics)']);
    // Chosen together it is the teacher's own choice, written once.
    expect(said(chosen(['assignments', 'rubrics']))).toEqual(['1:assignments:run', '2:assignments:run']);
  });

  it('writes no graded work again for rubrics when the work is written already', () => {
    expect(said(chosen(['rubrics'], ['assignments']))).toEqual(['1:assignments:done(for rubrics)', '2:assignments:run(for rubrics)']);
  });

  it('has nothing to write for a lesson that sets no such work', () => {
    expect(said(chosen(['assignments', 'quiz'], [], 'none'))).toEqual(['1:assignments:run', '1:quiz:run', '2:assignments:noWork', '2:quiz:run']);
  });

  it('leaves out what is written: resuming is of what remains, and nothing remains when all of it is', () => {
    expect(said(chosen(['plan', 'slides', 'quiz'], ['plan', 'slides']))).toEqual(['1:plan:done', '1:slides:done', '1:quiz:run', '2:plan:run', '2:slides:run', '2:quiz:run']);
    const all = chosen(['slides'], ['slides']);
    const done = { ...all, lessons: { ...all.lessons, [all.lessonOrder[1]!]: { ...all.lessons[all.lessonOrder[1]!]!, gen: all.lessons[all.lessonOrder[0]!]!.gen } } };
    expect(executionPlan(done).every((t) => t.state === 'done')).toBe(true);
    expect(missingTargets(done)).toEqual([]);
  });

  it('is the list the queue runs: the same parts, the same lessons, in the same order', () => {
    for (const c of [chosen(['rubrics']), chosen(['plan', 'slides', 'quiz'], ['plan']), chosen(['assignments', 'study'], [], 'none')]) {
      expect(missingTargets(c)).toEqual(executionPlan(c).filter((t) => t.state === 'run').map(({ lessonId, kind }) => ({ lessonId, kind })));
    }
    const c = chosen(['slides', 'quiz']);
    expect(said(c, [c.lessonOrder[1]!])).toEqual(['2:slides:run', '2:quiz:run']);
  });

  it('changes with the choice: a material turned off is no longer in it', () => {
    const before = chosen(['plan', 'slides', 'quiz']);
    const after = { ...before, materials: { ...before.materials, quiz: { enabled: false, options: {} } } };
    expect(said(after).some((x) => x.includes('quiz'))).toBe(false);
  });

  it('does not take graded work once written for a rubric that exists: lost, the lesson is said to have none, and the work is not written again', () => {
    // As it was found: rubrics alone, every lesson's graded work written, and the course holding no rubric at all.
    const base = chosen(['rubrics'], ['assignments']);
    const [first, second] = base.lessonOrder as [string, string];
    const piece = (id: string, lessonId: string, rubricId: string | null) => ({ id, lessonId, kind: 'assignment' as const, title: 'Lab report', prompt: 'Write it up.', steps: [], rubricId, answerKey: '', toward: '', objectiveIds: [], sourceRefs: [], origin: 'ai' as const, edited: false, flags: [] });
    const lost: Course = {
      ...base,
      rubrics: {},
      tasks: { a1: piece('a1', first, null), a2: piece('a2', second, 'r_gone') },
      lessons: { [first]: { ...base.lessons[first]!, taskIds: ['a1'] }, [second]: { ...base.lessons[second]!, taskIds: ['a2'], gen: base.lessons[first]!.gen } },
    };
    // The work is done and stays; the rubrics alone are a part to run, in the queue like any other.
    expect(said(lost)).toEqual(['1:assignments:done(for rubrics)', '1:rubrics:run', '2:assignments:done(for rubrics)', '2:rubrics:run']);
    expect(missingTargets(lost)).toEqual([{ lessonId: first, kind: 'rubrics' }, { lessonId: second, kind: 'rubrics' }]);
    // With its rubric in the course it is done; with rubrics not chosen nobody asks.
    const kept: Course = { ...lost, rubrics: { r1: { id: 'r1', title: 'Lab report', levels: [], criteria: [] } }, tasks: { ...lost.tasks, a1: piece('a1', first, 'r1'), a2: piece('a2', second, 'r1') } };
    expect(said(kept)).toEqual(['1:assignments:done(for rubrics)', '2:assignments:done(for rubrics)']);
    expect(said({ ...lost, materials: { ...lost.materials, rubrics: { enabled: false, options: {} }, assignments: { enabled: true, options: {} } } })).toEqual(['1:assignments:done', '2:assignments:done']);
  });

  it('plans a part asked for by itself as that part alone, written again or not', () => {
    const c = chosen(['plan', 'slides', 'quiz'], ['plan', 'slides']);
    const first = c.lessonOrder[0]!;
    expect(planOf(c, [{ lessonId: first, kind: 'slides' }]).map((t) => `${t.lesson}:${t.kind}:${t.state}`)).toEqual(['1:slides:run']);
    // The rest of the course still lacks four parts: none of them is in it.
    expect(missingTargets(c)).toHaveLength(4);
    expect(planOf(c, [{ lessonId: 'gone', kind: 'quiz' }])).toEqual([]);
  });

  it('says which lessons lean on graded work that is not being written, by the pieces\' names', () => {
    const c = chosen(['slides']);
    const named: Course = { ...c, lessons: Object.fromEntries(Object.entries(c.lessons).map(([id, l]) => [id, { ...l, homework: { kind: 'inclass' as const, toward: 'Participation' } }])) };
    expect(ownToWrite(named)).toEqual([{ lesson: 1, pieces: ['Participation'] }, { lesson: 2, pieces: ['Participation'] }]);
    expect(ownToWrite({ ...named, materials: { ...named.materials, rubrics: { enabled: true, options: {} } } })).toEqual([]);
    expect(ownToWrite(chosen(['slides'], [], 'none')).map((x) => x.lesson)).toEqual([]);
  });
});

