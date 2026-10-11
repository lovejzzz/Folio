import { CourseStore, MATERIAL_KINDS, orderedLessons, parseCourse, type Course } from '@folio/core';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { executionPlan } from '../src/build';
import { fillRubrics, piecesLackingRubric, rubricAlonePrompt, siblingRubric } from '../src/rubricAlone';
import { fakeInference } from './fake';

/**
 * Graded work Folio really wrote (data structures, the frozen batch; test/fixtures/batch1-data-structures.json), with
 * its rubrics taken away as a deletion or a lossy file would leave it: the work stands, and points at no rubric.
 */
const real = parseCourse(JSON.parse(readFileSync(new URL('./fixtures/batch1-data-structures.json', import.meta.url), 'utf8')) as unknown);
const lost = (keep: string[] = []): Course => ({
  ...real,
  materials: Object.fromEntries(MATERIAL_KINDS.map((k) => [k, { enabled: true, options: {} }])) as Course['materials'],
  rubrics: Object.fromEntries(Object.entries(real.rubrics).filter(([id]) => keep.includes(id))),
  tasks: Object.fromEntries(Object.entries(real.tasks).map(([id, t]) => [id, t.kind === 'assignment' && t.rubricId && !keep.includes(t.rubricId) ? { ...t, rubricId: null } : t])),
});
const scored = Object.values(real.tasks).filter((t) => t.kind === 'assignment' && t.rubricId);
const draft = { levels: [{ label: 'Exemplary', points: 4 }, { label: 'Proficient', points: 3 }, { label: 'Developing', points: 2 }, { label: 'Beginning', points: 1 }], criteria: [{ name: 'Correctness', descriptors: ['a', 'b', 'c', 'd'] }, { name: 'Reasoning', descriptors: ['a', 'b', 'c', 'd'] }] };

describe('a rubric for work that stands without one', () => {
  it('is wanted for the real pieces that had one, and for no piece marked in points', () => {
    expect(scored.length).toBeGreaterThan(0);
    const c = lost();
    const lacking = orderedLessons(c).flatMap((l) => piecesLackingRubric(c, l)).map((t) => t.id);
    expect(lacking.sort()).toEqual(scored.map((t) => t.id).sort());
    expect(executionPlan(c).filter((t) => t.state === 'noRubric').length).toBeGreaterThan(0);
  });

  it('is written alone, attached to the piece, and leaves every word of the piece as it was', async () => {
    const store = new CourseStore(lost());
    const before = JSON.stringify(scored.map((t) => store.getState().tasks[t.id]).map((t) => (t?.kind === 'assignment' ? [t.title, t.prompt, t.steps, t.answerKey] : null)));
    const model = fakeInference(() => draft);
    const result = await fillRubrics(model, () => store.getState(), (commands) => void store.apply(commands, { label: { key: 't' }, source: 'ai' }));
    expect(result.failed).toBe(0);
    expect(result.given).toBe(scored.length);
    const after = store.getState();
    expect(JSON.stringify(scored.map((t) => after.tasks[t.id]).map((t) => (t?.kind === 'assignment' ? [t.title, t.prompt, t.steps, t.answerKey] : null)))).toBe(before);
    for (const t of scored) {
      const now = after.tasks[t.id];
      expect(now?.kind === 'assignment' && now.rubricId && after.rubrics[now.rubricId]?.criteria.length).toBeTruthy();
    }
    expect(executionPlan(after).some((t) => t.state === 'noRubric')).toBe(false);
    // The writer was shown the piece and told not to change it; no assignment was asked for again.
    expect(model.calls.every((c) => c.task === 'folio_rubric')).toBe(true);
    expect(model.calls[0]!.prompt).toContain('is not to be changed in any word');
  });

  it('takes the rubric another piece of the same component has, without asking a model', async () => {
    const twice = scored.filter((t) => t.kind === 'assignment' && scored.some((o) => o.id !== t.id && o.kind === 'assignment' && o.toward === t.toward && t.toward));
    if (twice.length < 2 || twice[0]!.kind !== 'assignment') return;
    const kept = twice[0]!.rubricId!;
    const c = lost([kept]);
    const other = c.tasks[twice[1]!.id];
    expect(other?.kind === 'assignment' && siblingRubric(c, other)?.criteria.map((x) => x.name)).toEqual(real.rubrics[kept]!.criteria.map((x) => x.name));
  });

  it('is counted as not given where the answer is no rubric, and the piece stays as it was', async () => {
    const store = new CourseStore(lost());
    const result = await fillRubrics(fakeInference(() => ({ levels: draft.levels, criteria: [] })), () => store.getState(), (commands) => void store.apply(commands, { label: { key: 't' }, source: 'ai' }));
    expect(result.given).toBe(0);
    expect(result.failed).toBeGreaterThan(0);
  });

  it('is asked for in terms every piece of a run can be scored on, since the rest take it (a first real run gave a second problem set the first one\'s functions)', () => {
    const c = lost();
    const first = orderedLessons(c)[0]!;
    const piece = piecesLackingRubric(c, first)[0]!;
    expect(piece.toward).toBe('Problem sets');
    expect(rubricAlonePrompt(c, first, piece)).toContain('Every piece of "Problem sets" in the course is scored on this one rubric');
    expect(rubricAlonePrompt(c, first, { ...piece, toward: '' })).not.toContain('is scored on this one rubric');
  });
});

