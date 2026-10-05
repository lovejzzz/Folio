import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Task } from '@folio/core';
import type { Cell, CellResult, Runner } from '@folio/run';
import { nodeRunner, RUNTIME_DIR } from '@folio/run/node';
import { describe, expect, it } from 'vitest';
import { checkAnswers, worthChecking } from '../src/answerCheck';
import { fakeInference } from './fake';

const base = { lessonId: 'l_1', objectiveIds: [], sourceRefs: [], origin: 'ai' as const, edited: false, flags: [] };
const choice = (id: string, prompt: string, texts: string[], correct: number, explanation: string): Task => ({ ...base, id, kind: 'question', format: 'choice', prompt, choices: texts.map((text, i) => ({ id: `c${i + 1}`, text })), correct: `c${correct}`, answer: '', explanation, difficulty: 2 });

const PROMPT = 'What does `sum([3, 4, 5]) / len([3, 4, 5])` give?';
const right = choice('t_right', PROMPT, ['4.0', '12', '3.0'], 1, 'The sum is 12 and there are 3 values. 12 is the sum alone, before dividing.');
const wrong = choice('t_wrong', PROMPT, ['4.0', '12', '3.0'], 3, 'The sum is 12 and there are 3 values. 12 is the sum alone, before dividing.');
const concept = choice('t_idea', 'Why do teachers set homework?', ['To practise', 'To punish', 'To fill time'], 1, 'Practice.');
const FORM = { checkable: true, setup: 'values = [3, 4, 5]', answer_expr: 'sum(values) / len(values)', choices: [{ n: 1, kind: 'value' }, { n: 2, kind: 'value', origin_expr: 'sum(values)' }, { n: 3, kind: 'value' }], stated: [], verbatim: [], unchecked: [] };

const result = (stdout: string): CellResult => ({ stdout, stderr: '', value: null, error: null, figures: [], figuresDropped: 0, cut: false, loadError: null, sessionLost: false, ms: 1 });
/** A runner that gives each run's verdict from a list, in order. */
function scripted(verdicts: object[]): Runner & { cells: Cell[] } {
  const cells: Cell[] = [];
  return { cells, run: async (cell) => (cells.push(cell), result(`${JSON.stringify(verdicts[cells.length - 1])}\n`)), reset: async () => undefined, versions: async () => ({}), close: () => undefined };
}
const fail = (id: string, what = 'the key') => ({ status: 'FAIL', checks: [{ id, what, status: 'fail', detail: 'stored 3.0 computed 4.0' }] });
const PASS = { status: 'PASS', checks: [{ id: 'key', what: 'the key', status: 'pass', detail: '' }] };

describe('an answer that can be computed', () => {
  it('is given a form only when it holds code or enough numbers', () => {
    expect([right, concept].map(worthChecking)).toEqual([true, false]);
    expect(worthChecking({ ...base, id: 't_a', kind: 'assignment', title: 'T', prompt: 'p', steps: ['Compute `np.mean(x)`.'], rubricId: null, answerKey: '', toward: '' })).toBe(false);
  });

  it('is told to the teacher only when it fails twice on the same claim, with a form written afresh', async () => {
    const model = fakeInference(() => FORM);
    // Twice on the key: a finding. Once, then a pass: the form was wrong, not the item. Twice, on different claims: not the same finding.
    const twice = await checkAnswers(model, scripted([fail('key'), fail('key')]), [wrong]);
    expect(twice.flags.get('t_wrong')).toEqual([{ code: 'answerCheck', values: { claim: 'the key', found: 'stored 3.0 computed 4.0' } }]);
    expect(model.calls).toHaveLength(2);
    expect(model.calls[0]!.prompt).toContain('"keyed": true');
    // A pass is said too: the item is marked as checked, which a teacher can see.
    expect([...(await checkAnswers(model, scripted([PASS]), [right])).held]).toEqual(['t_right']);
    const twiceWrong = await checkAnswers(model, scripted([fail('key'), PASS]), [wrong]);
    expect([twiceWrong.flags.size, twiceWrong.held.size]).toEqual([0, 1]);
    expect((await checkAnswers(model, scripted([fail('key'), fail('origin2')]), [wrong])).flags.size).toBe(0);
    // One stated number, quoted by two forms with more and less of the text before it: the same claim.
    const stated = (what: string) => fail('stated1', what);
    expect((await checkAnswers(model, scripted([stated('answerKey: …so the standard deviation of the sample is '), stated('answerKey: …deviation of the sample is')]), [wrong])).flags.size).toBe(1);
    expect((await checkAnswers(model, scripted([stated('answerKey: …the standard deviation is'), stated('answerKey: …the standard error is')]), [wrong])).flags.size).toBe(0);
  });

  it('is counted as unchecked, and never blamed, when the form does not bind or nothing can be run', async () => {
    const model = fakeInference(() => FORM);
    expect(await checkAnswers(model, scripted([{ status: 'INVALID', checks: [] }]), [right, concept])).toMatchObject({ checked: 0, unchecked: 1 });
    const dead: Runner = { run: () => Promise.reject(new Error('no memory')), reset: async () => undefined, versions: async () => ({}), close: () => undefined };
    expect((await checkAnswers(model, dead, [right])).flags.size).toBe(0);
  });
});

// The checking program needs numpy: these run where the runtime has been fetched.
describe.skipIf(!existsSync(join(RUNTIME_DIR, 'pyodide-lock.json')))('the checking program, really run', () => {
  it('passes a right key and fails a wrong one, reading the key from the item and never from the form', async () => {
    const model = fakeInference(() => FORM);
    const out = await checkAnswers(model, nodeRunner(), [right, wrong]);
    expect(out).toMatchObject({ checked: 2, unchecked: 0 });
    expect(out.flags.has('t_right')).toBe(false);
    expect(out.flags.get('t_wrong')![0]).toMatchObject({ values: { claim: 'computed answer is stated by the keyed choice and by no other' } });
    expect(JSON.stringify(out.flags.get('t_wrong'))).toContain('keyed: 3');
  }, 120_000);

  it('reads an answer of several parts, a list and a number, against the numbers the choice states', async () => {
    const q = choice('t_parts', 'Proportions 0.50, 0.25, 0.25 and observed counts 66, 24, 30: which expected counts and degrees of freedom?', ['Expected counts 66, 24, 30; df = 3', 'Expected counts 60, 30, 30; df = 2'], 2, 'Multiply each proportion by the total, 120.');
    const form = { checkable: true, setup: 'import numpy as np\nobserved = np.array([66, 24, 30])\nprops = [0.50, 0.25, 0.25]', answer_expr: '([p * observed.sum() for p in props], len(props) - 1)', choices: [{ n: 1, kind: 'value' }, { n: 2, kind: 'value' }] };
    const out = await checkAnswers(fakeInference(() => form), nodeRunner(), [q]);
    expect(out).toMatchObject({ checked: 1 });
    expect(out.flags.size).toBe(0);
  }, 120_000);

  it('takes a whole number for itself only, and a decimal to one unit of its last place', async () => {
    const count = choice('t_count', 'With `labels = [1, 0, 1, 1, 0]`, how many are 1, and what share is that?', ['2, a share of 0.6', '3, a share of 0.6', '3, a share of 0.7'], 1, 'Count the ones.');
    const form = { checkable: true, setup: 'labels = [1, 0, 1, 1, 0]', answer_expr: '(sum(labels), sum(labels) / len(labels))', choices: [{ n: 1, kind: 'value' }, { n: 2, kind: 'value' }, { n: 3, kind: 'value' }] };
    // The key says 2 where the count is 3: at one unit it passed, and so did the right choice beside it.
    const out = await checkAnswers(fakeInference(() => form), nodeRunner(), [count, choice('t_count_right', count.prompt, ['2, a share of 0.6', '3, a share of 0.6', '3, a share of 0.7'], 2, 'Count the ones.')]);
    expect([out.flags.has('t_count'), out.flags.has('t_count_right')]).toEqual([true, false]);
  }, 120_000);

  it('does not take a whole number further on for a decimal result', async () => {
    const key = (sd: string): Task => ({ ...choice('t_sd', 'Explain the spread of `[3, 4, 5, 7]`.', ['It varies', 'It does not'], 1, `The standard deviation is approximately ${sd}; a 95% interval leaves 100*(1-0.95)/2 in each tail.`), id: `t_sd_${sd}` });
    const form = { checkable: true, setup: 'import statistics\nvalues = [3, 4, 5, 7]', choices: [{ n: 1, kind: 'concept' }, { n: 2, kind: 'concept' }], stated: [{ where: 'explanation', before: 'deviation is approximately', expr: 'statistics.stdev(values)' }] };
    // 1.708 is the value. Given as 1.2, the "1" of the formula after it used to pass for it, to half a unit.
    const out = await checkAnswers(fakeInference(() => form), nodeRunner(), [key('1.71'), key('1.2')]);
    expect([out.flags.has('t_sd_1.71'), out.flags.has('t_sd_1.2')]).toEqual([false, true]);
  }, 120_000);

  it('reads numbers as a class writes them: a fraction, a mixed number, and a number times a power of ten', async () => {
    const key = (id: string, answerKey: string): Task => ({ ...base, id, kind: 'assignment', title: 'Sheet', prompt: '', steps: ['Work out parts 1, 2, 3 and 4 with `len`.'], rubricId: null, answerKey, toward: '' });
    const form = (expr: string, before: string) => ({ checkable: true, setup: 'from fractions import Fraction\nmol = 0.500\navogadro = 6.022e23', stated: [{ where: 'answerKey', before, expr }] });
    // Each is really checked (an item that is not would also show no fault), and what it found is counted.
    const run = async (task: Task, f: object) => {
      const out = await checkAnswers(fakeInference(() => f), nodeRunner(), [task]);
      expect(out.checked).toBe(1);
      return out.flags.size;
    };
    expect(await run(key('t_sci', 'The sample holds 3.011 × 10²³ atoms.'), form('mol * avogadro', 'The sample holds '))).toBe(0);
    expect(await run(key('t_sci2', 'The sample holds 3.011 x 10^23 atoms.'), form('mol * avogadro', 'The sample holds '))).toBe(0);
    expect(await run(key('t_frac', 'Line 2 is marked at 1/3, 2/3 and 3/3.'), form('[Fraction(k, 3) for k in (1, 2, 3)]', 'Line 2 is marked at '))).toBe(0);
    expect(await run(key('t_mixed', 'Together they make 1 1/2 strips.'), form('Fraction(3, 4) * 2', 'Together they make '))).toBe(0);
    // Results set among numbers that are not results: the 4 and the 9 are sample sizes.
    expect(await run(key('t_among', 'The standard errors are about 2.45 for n = 4 and 1.64 for n = 9.'), { checkable: true, setup: 'sd = 4.91', stated: [{ where: 'answerKey', before: 'The standard errors are about ', expr: '[sd / 4 ** 0.5, sd / 9 ** 0.5]' }] })).toBe(0);
    expect(await run(key('t_among_wrong', 'The standard errors are about 2.45 for n = 4 and 1.94 for n = 9.'), { checkable: true, setup: 'sd = 4.91', stated: [{ where: 'answerKey', before: 'The standard errors are about ', expr: '[sd / 4 ** 0.5, sd / 9 ** 0.5]' }] })).toBe(1);
    // And a wrong one still fails: 2/4 where three fourths was meant.
    expect(await run(key('t_wrong_frac', 'The dot sits at 2/4.'), form('Fraction(3, 4)', 'The dot sits at '))).toBe(1);
  }, 180_000);

  it('runs a stored answer as it is stored: a curly quote in code is a failure, not something to tidy first', async () => {
    const short: Task = { ...base, id: 't_code', kind: 'question', format: 'short', prompt: 'Write an expression for the number of rows whose `city` is Austin.', choices: [], correct: null, answer: '`(df["city"] == “Austin”).sum()`', explanation: '', difficulty: 2 };
    const form = { checkable: true, setup: 'import pandas as pd\ndf = pd.DataFrame({"city": ["Austin", "Reno", "Austin"]})', answer_kind: 'code', judge: 'result == (df["city"] == "Austin").sum()' };
    const out = await checkAnswers(fakeInference(() => form), nodeRunner(), [short]);
    expect(JSON.stringify(out.flags.get('t_code'))).toContain('SyntaxError');
  }, 120_000);
});
