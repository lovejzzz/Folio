import { CourseStore, MATERIAL_KINDS, orderedLessons, parseCourse, type Assignment, type Course } from '@folio/core';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { executionPlan, missingTargets, runBuild, type BuildHost } from '../src/build';
import { lessonRubrics, piecesLackingRubric, rubricAlonePrompt, scoringBroken, scoringSaid, siblingRubric, unchecked } from '../src/rubricAlone';
import { fakeInference } from './fake';

/**
 * Graded work Folio really wrote (data structures, the frozen batch; test/fixtures/batch1-data-structures.json), with
 * its rubrics taken away as a deletion or a lossy file would leave it: the work stands, and points at no rubric.
 * Each piece says: "Each criterion earns 1–4 points, for a total of 12 points."
 */
const real = parseCourse(JSON.parse(readFileSync(new URL('./fixtures/batch1-data-structures.json', import.meta.url), 'utf8')) as unknown);
const lost = (keep: string[] = []): Course => ({
  ...real,
  materials: Object.fromEntries(MATERIAL_KINDS.map((k) => [k, { enabled: true, options: {} }])) as Course['materials'],
  rubrics: Object.fromEntries(Object.entries(real.rubrics).filter(([id]) => keep.includes(id))),
  tasks: Object.fromEntries(Object.entries(real.tasks).map(([id, t]) => [id, t.kind === 'assignment' && t.rubricId && !keep.includes(t.rubricId) ? { ...t, rubricId: null } : t])),
});
const scored = Object.values(real.tasks).filter((t): t is Assignment => t.kind === 'assignment' && Boolean(t.rubricId));
const levels = [{ label: 'Exemplary', points: 4 }, { label: 'Proficient', points: 3 }, { label: 'Developing', points: 2 }, { label: 'Beginning', points: 1 }];
const criteria = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `Criterion ${i + 1}`, descriptors: ['a', 'b', 'c', 'd'] }));
const host = (store: CourseStore, model: ReturnType<typeof fakeInference>, signal = new AbortController().signal): BuildHost => ({ inference: model, getCourse: () => store.getState(), commit: (_t, commands) => void store.apply(commands, { label: { key: 't' }, source: 'ai' }), signal }) as BuildHost;
const words = (c: Course) => JSON.stringify(scored.map((t) => c.tasks[t.id]).map((t) => (t?.kind === 'assignment' ? [t.title, t.prompt, t.steps, t.answerKey] : null)));

describe('what a piece says of its own scoring', () => {
  it('is read from the real pieces: a criterion earns up to 4, the total is 12', () => {
    for (const piece of scored) expect(scoringSaid(piece)).toMatchObject({ top: 4, total: 12 });
    expect(scoringSaid(scored[0]!).sentences).toContain('Each criterion earns 1–4 points, for a total of 12 points.');
    expect(scoringSaid({ ...scored[0]!, prompt: 'Write an essay.', steps: ['Argue a thesis.'] })).toEqual({ sentences: [] });
  });

  it('is kept by three criteria of four levels and broken by four, as all four real rubrics written alone were', () => {
    const said = scoringSaid(scored[0]!);
    expect(scoringBroken({ levels, criteria: criteria(3) }, said)).toBeNull();
    expect(scoringBroken({ levels, criteria: criteria(4) }, said)).toContain('the total is 12; 4 criteria of up to 4 make 16: give exactly 3 criteria');
    expect(scoringBroken({ levels: levels.map((lv) => ({ ...lv, points: lv.points * 25 })), criteria: criteria(3) }, said)).toContain('at most 4');
    expect(scoringBroken({ levels, criteria: criteria(5) }, { sentences: [] })).toBeNull();
  });

  it('is put to the writer in the piece\'s own words, with the count it comes to', () => {
    const c = lost();
    const first = orderedLessons(c)[0]!;
    const asked = rubricAlonePrompt(c, first, piecesLackingRubric(c, first)[0]!);
    expect(asked).toContain('"Each criterion earns 1–4 points, for a total of 12 points."');
    expect(asked).toContain('That is exactly 3 criteria, the top level worth 4.');
    expect(asked).toContain('Every piece of "Problem sets" in the course is scored on this one rubric');
    expect(asked).toContain('is not to be changed in any word');
  });
});

describe('a lesson\'s rubrics alone, as a part of a build', () => {
  it('are in the plan and the queue where graded work stands without one, and nowhere else', () => {
    const c = lost();
    const lacking = orderedLessons(c).flatMap((l) => piecesLackingRubric(c, l)).map((t) => t.id);
    expect(lacking.sort()).toEqual(scored.map((t) => t.id).sort());
    expect(missingTargets(c).filter((t) => t.kind === 'rubrics')).toHaveLength(new Set(scored.map((t) => t.lessonId)).size);
    expect(executionPlan(real).some((t) => t.kind === 'rubrics')).toBe(false);
  });

  it('are written, attached, and leave every word of the work as it was', async () => {
    const store = new CourseStore(lost());
    const before = words(store.getState());
    const model = fakeInference(() => ({ levels, criteria: criteria(3) }));
    const summary = await runBuild(host(store, model), missingTargets(store.getState()).filter((t) => t.kind === 'rubrics'));
    expect(summary).toMatchObject({ failed: 0, built: new Set(scored.map((t) => t.lessonId)).size });
    const after = store.getState();
    expect(words(after)).toBe(before);
    for (const t of scored) {
      const now = after.tasks[t.id] as Assignment;
      const rubric = after.rubrics[now.rubricId ?? ''];
      expect(rubric?.criteria).toHaveLength(3);
      // Its own title, not the title of the piece it was taken from.
      expect(rubric?.title).toBe(now.title);
    }
    expect(missingTargets(after).some((t) => t.kind === 'rubrics')).toBe(false);
    // One piece of the component was written for; the other took its rubric, and no assignment was asked for again.
    expect(model.calls.map((c) => c.task)).toEqual(['folio_rubric']);
  });

  it('are asked for once more when the scoring is not the piece\'s, with the fault said, and kept when the second fits', async () => {
    const store = new CourseStore(lost());
    const model = fakeInference((_req, call) => ({ levels, criteria: criteria(call === 1 ? 4 : 3) }));
    const first = orderedLessons(store.getState())[0]!;
    const commands = await lessonRubrics(model, store.getState(), first.id);
    expect(commands).toHaveLength(1);
    expect(model.calls[1]!.prompt).toContain('A first answer was not usable: the piece says the total is 12; 4 criteria of up to 4 make 16');
  });

  it('fail the part when no rubric that fits can be had: nothing is attached, the part stays to be run, and the build is not done', async () => {
    const store = new CourseStore(lost());
    const before = JSON.stringify(store.getState().rubrics);
    const summary = await runBuild(host(store, fakeInference(() => ({ levels, criteria: criteria(4) }))), missingTargets(store.getState()).filter((t) => t.kind === 'rubrics'));
    expect(summary.built).toBe(0);
    expect(summary.failed).toBeGreaterThan(0);
    expect(JSON.stringify(store.getState().rubrics)).toBe(before);
    expect(missingTargets(store.getState()).some((t) => t.kind === 'rubrics')).toBe(true);
  });

  it('are not counted as done when the build is stopped', async () => {
    const store = new CourseStore(lost());
    const stop = new AbortController();
    stop.abort();
    const summary = await runBuild(host(store, fakeInference(() => ({ levels, criteria: criteria(3) })), stop.signal), missingTargets(store.getState()).filter((t) => t.kind === 'rubrics'));
    expect(summary.built).toBe(0);
    expect(missingTargets(store.getState()).some((t) => t.kind === 'rubrics')).toBe(true);
  });
});

describe('a rubric taken from another piece of the component', () => {
  it('is taken only when it keeps this piece\'s scoring, and under this piece\'s title', () => {
    const [a, b] = scored;
    if (!a || !b || a.toward !== b.toward) return;
    const c = lost([a.rubricId!]);
    const other = c.tasks[b.id] as Assignment;
    const taken = siblingRubric(c, other);
    expect(taken?.title).toBe(other.title);
    expect(taken?.criteria.map((x) => x.name)).toEqual(real.rubrics[a.rubricId!]!.criteria.map((x) => x.name));
    // A sibling of four criteria under a piece that says twelve is not taken.
    const wide: Course = { ...c, rubrics: { [a.rubricId!]: { ...c.rubrics[a.rubricId!]!, criteria: [...c.rubrics[a.rubricId!]!.criteria, { id: 'x_more', name: 'Extra', descriptors: {} }] } } };
    expect(siblingRubric(wide, other)).toBeNull();
  });

  it('is not taken on a name and a total alone: the two pieces must say the same of their scoring', () => {
    const [a, b] = scored;
    if (!a || !b || a.toward !== b.toward) return;
    const c = lost([a.rubricId!]);
    const other = { ...(c.tasks[b.id] as Assignment), prompt: 'Each of three parts earns 1–4 points, for a total of 12 points, by the criteria your section leader gives.', steps: ['Do it.'] };
    expect(scoringSaid(other)).toMatchObject({ total: 12 });
    expect(siblingRubric({ ...c, tasks: { ...c.tasks, [b.id]: other } }, other)).toBeNull();
    // And a piece that says nothing of its scoring shares no contract.
    expect(siblingRubric(c, { ...(c.tasks[b.id] as Assignment), prompt: 'Write an essay.', steps: ['Argue a thesis.'] })).toBeNull();
  });
});

describe('what could not be checked', () => {
  it('is said on the piece: scoring spoken of in words no rule reads, or not spoken of at all, is not taken for kept', async () => {
    expect(unchecked(scored[0]!)).toBe('');
    const vague = { ...scored[0]!, prompt: 'Your work is scored on the rubric, with more weight on the analysis than on the code.', steps: ['Do it.'] };
    expect(unchecked(vague)).toContain('could not check it against (“Your work is scored on the rubric, with more weight on the analysis than on the code.”)');
    expect(unchecked({ ...scored[0]!, prompt: 'Write an essay.', steps: ['Argue a thesis.'] })).toContain('says nothing of how it is scored');
    const store = new CourseStore({ ...lost(), tasks: { ...lost().tasks, [scored[0]!.id]: { ...vague, rubricId: null } } });
    const first = scored[0]!.lessonId;
    const commands = await lessonRubrics(fakeInference(() => ({ levels, criteria: criteria(4) })), store.getState(), first);
    store.apply(commands, { label: { key: 't' }, source: 'ai' });
    const now = store.getState().tasks[scored[0]!.id] as Assignment;
    expect(now.rubricId).toBeTruthy();
    expect(now.flags.map((f) => (f.code === 'reviewNote' ? f.values.where : ''))).toContain('Rubric');
  });
});


describe('a piece scored answer by answer', () => {
  it('lacks no rubric, whatever its component is called', async () => {
    const { scoredByAnswer } = await import('@folio/core');
    const piece = (prompt: string) => ({ prompt, steps: [] }) as never;
    // As four courses had them.
    expect(scoredByAnswer(piece('Each question has one correct answer and earns 1 point for a correct response or 0 points otherwise.'))).toBe(true);
    expect(scoredByAnswer(piece('Each correct answer earns 1 point; an incorrect or unanswered question earns 0 points.'))).toBe(true);
    expect(scoredByAnswer(piece('Six questions, 2 points each.'))).toBe(true);
    expect(scoredByAnswer(piece('One point for each correct answer.'))).toBe(true);
    // In words: a chemistry course's clicker rounds were given a rubric of levels beside "one point" an answer.
    expect(scoredByAnswer(piece('Each correct answer earns one point; an incorrect answer earns zero points.'))).toBe(true);
    expect(scoredByAnswer(piece('Each question is worth two points.'))).toBe(true);
    expect(scoredByAnswer(piece('Each answer should make one point clearly, with evidence.'))).toBe(false);
    // A piece scored on criteria says points too, and still takes a rubric.
    expect(scoredByAnswer(piece('Each criterion earns 1–4 points, for a total of 12 points.'))).toBe(false);
    expect(scoredByAnswer(piece('Write a lab report. It is scored with the rubric below, out of 16 points.'))).toBe(false);
    expect(scoredByAnswer(piece('Answer the three questions in a paragraph each.'))).toBe(false);
  });
});

describe('an ungraded step toward a piece the same lesson sets', () => {
  // A lesson Folio really wrote (the reading before 0.0.40): it sets Essay 1 and, toward it, an ungraded draft. The draft
  // was given a rubric of four criteria and sixteen points, and a note that there was nothing to hold the rubric to.
  const lessonWithStep = parseCourse(JSON.parse(readFileSync(new URL('./fixtures/r40-composition-step.json', import.meta.url), 'utf8')) as unknown);
  const lesson = orderedLessons(lessonWithStep)[0]!;
  const draft = Object.values(lessonWithStep.tasks).find((t): t is Assignment => t.kind === 'assignment' && t.title.startsWith('A working draft'))!;
  const essay = Object.values(lessonWithStep.tasks).find((t): t is Assignment => t.kind === 'assignment' && t.title === 'Essay 1')!;
  const without = (ids: string[]): Course => ({ ...lessonWithStep, tasks: Object.fromEntries(Object.entries(lessonWithStep.tasks).map(([id, t]) => [id, ids.includes(id) && t.kind === 'assignment' ? { ...t, rubricId: null } : t])) });

  it('is the real case: the draft says it is ungraded, and has a rubric', () => {
    expect(draft.prompt).toContain('This is an ungraded step toward Essay 1');
    expect(draft.rubricId).toBeTruthy();
    expect(draft.toward).toBe(essay.toward);
  });

  it('lacks no rubric, while the piece it leads to does when it has none', () => {
    const lacking = piecesLackingRubric(without([draft.id, essay.id]), lesson).map((t) => t.title);
    expect(lacking).toEqual(['Essay 1']);
  });
});
