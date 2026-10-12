import { MATERIAL_KINDS, type Course, type MaterialKind } from '@folio/core';
import { describe, expect, it } from 'vitest';
import { InferenceError, runBuild, targetKey, type BuildTarget } from '../src';
import { buildPlan, toRun } from '../src/buildPlan';
import { fakeInference, smallCourse } from './fake';

const STAMP = { at: '2026-10-11T00:00:00.000Z', inputs: '', flags: [] };
type Written = Partial<Record<1 | 2, string[]>>;

/**
 * The small course (two lessons) with these materials chosen and these parts of each lesson written. Both lessons
 * set an assignment unless told otherwise; `facts` gives lesson 1 a settled case, as a course written without plans has.
 */
function course(kinds: MaterialKind[], written: Written = {}, opts: { homework2?: 'assignment' | 'none'; facts?: boolean } = {}): Course {
  const c = smallCourse();
  const [first, second] = c.lessonOrder as [string, string];
  const gen = (n: 1 | 2) => Object.fromEntries((written[n] ?? []).map((k) => [k, STAMP])) as never;
  const aCase = { id: 'c1', title: 'A leaf in the dark', known: 'A leaf kept two days in the dark.', question: 'What does the iodine show?', answer: 'No starch.', notShown: '', unsupported: [] };
  return {
    ...c,
    materials: Object.fromEntries(MATERIAL_KINDS.map((k) => [k, { enabled: kinds.includes(k), options: {} }])) as Course['materials'],
    lessons: {
      [first]: { ...c.lessons[first]!, homework: { kind: 'assignment', toward: '' }, gen: gen(1), cases: opts.facts ? [aCase] : [] },
      [second]: { ...c.lessons[second]!, homework: { kind: opts.homework2 ?? 'assignment', toward: '' }, also: [], gen: gen(2) },
    },
  };
}

const said = (c: Course, targets?: BuildTarget[]) => buildPlan(c, targets).map((t) => `${t.lesson}:${t.kind}:${t.state}${t.neededBy ? `(for ${t.neededBy})` : ''}`);
const at = (c: Course, n: 1 | 2, kind: BuildTarget['kind']): BuildTarget => ({ lessonId: c.lessonOrder[n - 1]!, kind });

/** The parts a build really takes up, with a model that fails every call: each part it starts, or gives up for want of what it is written from. */
async function taken(c: Course, targets?: BuildTarget[]): Promise<string[]> {
  const seen = new Set<string>();
  const inference = fakeInference(() => {
    throw new InferenceError('server', 'down');
  });
  await runBuild({ inference, getCourse: () => c, commit: () => {}, onEvent: (e) => void seen.add(targetKey(e.target)), signal: new AbortController().signal }, toRun(buildPlan(c, targets)));
  return [...seen].sort();
}

/** One row of the matrix: the plan, said, and that the build takes up exactly the plan's parts to run. */
async function row(c: Course, targets: BuildTarget[] | undefined, expected: string[]): Promise<void> {
  expect(said(c, targets)).toEqual(expected);
  expect(await taken(c, targets)).toEqual(toRun(buildPlan(c, targets)).map(targetKey).sort());
}

describe('one plan for every start of a build: the whole course', () => {
  it('one material alone: the plan; slides, a quiz or a guide with the lesson facts they need', async () => {
    await row(course(['plan']), undefined, ['1:plan:run', '2:plan:run']);
    await row(course(['slides']), undefined, ['1:facts:run(for slides)', '1:slides:run', '2:facts:run(for slides)', '2:slides:run']);
    await row(course(['quiz']), undefined, ['1:facts:run(for quiz)', '1:quiz:run', '2:facts:run(for quiz)', '2:quiz:run']);
    await row(course(['study']), undefined, ['1:facts:run(for study)', '1:study:run', '2:facts:run(for study)', '2:study:run']);
  });

  it('rubrics: with their work; alone, the work is in the plan and marked; where a lesson sets none, nothing', async () => {
    await row(course(['plan', 'assignments', 'rubrics']), undefined, ['1:plan:run', '1:assignments:run', '2:plan:run', '2:assignments:run']);
    const alone = said(course(['rubrics']));
    expect(alone).toContain('1:assignments:run(for rubrics)');
    expect(alone).toContain('2:assignments:run(for rubrics)');
    expect(said(course(['rubrics'], {}, { homework2: 'none' })).filter((x) => x.startsWith('2:'))).toEqual(['2:assignments:noWork(for rubrics)']);
    await row(course(['rubrics']), undefined, alone);
  });

  it('written, then a material turned off or added: only what is chosen and unwritten', async () => {
    const all = { 1: ['plan', 'slides', 'quiz'], 2: ['plan', 'slides', 'quiz'] };
    await row(course(['plan', 'slides', 'quiz'], all), undefined, ['1:plan:done', '1:slides:done', '1:quiz:done', '2:plan:done', '2:slides:done', '2:quiz:done']);
    await row(course(['plan', 'slides'], all), undefined, ['1:plan:done', '1:slides:done', '2:plan:done', '2:slides:done']);
    await row(course(['plan', 'slides', 'quiz', 'study'], all), undefined, ['1:plan:done', '1:slides:done', '1:quiz:done', '1:study:run', '2:plan:done', '2:slides:done', '2:quiz:done', '2:study:run']);
  });

  it('stopped half way: Resume has what is left and no more', async () => {
    await row(course(['plan', 'slides', 'quiz'], { 1: ['plan', 'slides', 'quiz'], 2: ['plan'] }), undefined, ['1:plan:done', '1:slides:done', '1:quiz:done', '2:plan:done', '2:slides:run', '2:quiz:run']);
  });
});

describe('one plan for every start of a build: parts asked for by name', () => {
  it('a written part asked for again is that part alone', async () => {
    const c = course(['plan', 'slides', 'quiz'], { 1: ['plan', 'slides', 'quiz'], 2: ['plan', 'slides', 'quiz'] });
    await row(c, [at(c, 1, 'slides')], ['1:slides:run']);
  });

  it('a part whose plan was never written brings the plan, and the unwritten plans before it', async () => {
    const c = course(['plan', 'slides'], { 1: [], 2: [] });
    await row(c, [at(c, 2, 'slides')], ['1:plan:run(for slides)', '2:plan:run(for slides)', '2:slides:run']);
    // The failed ones tried again together: each part once, a plan asked for by name standing as asked.
    await row(c, [at(c, 1, 'plan'), at(c, 1, 'slides'), at(c, 2, 'slides'), at(c, 1, 'slides')], ['1:plan:run', '1:slides:run', '2:plan:run(for slides)', '2:slides:run']);
  });

  it('in a course without plans a part brings the lesson facts unless they are settled', async () => {
    const c = course(['slides', 'quiz'], {}, { facts: true });
    await row(c, [at(c, 1, 'slides')], ['1:slides:run']);
    await row(c, [at(c, 2, 'slides'), at(c, 2, 'quiz')], ['2:facts:run(for slides)', '2:slides:run', '2:quiz:run']);
  });

  it('rubrics asked of a lesson whose work is unwritten: the work, marked; of one that sets none: nothing to run', async () => {
    const c = course(['rubrics'], {}, { homework2: 'none', facts: true });
    await row(c, [at(c, 1, 'rubrics')], ['1:assignments:run(for rubrics)']);
    await row(c, [at(c, 2, 'rubrics')], ['2:rubrics:noWork']);
    await row(c, [at(c, 2, 'assignments')], ['2:assignments:noWork']);
  });

  it('a lesson that is gone, and no parts at all, are an empty plan', async () => {
    const c = course(['plan']);
    await row(c, [{ lessonId: 'gone', kind: 'quiz' }], []);
    await row(c, [], []);
  });
});
