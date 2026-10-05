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
    expect((await checkAnswers(model, scripted([fail('key'), PASS]), [wrong])).flags.size).toBe(0);
    expect((await checkAnswers(model, scripted([fail('key'), fail('origin2')]), [wrong])).flags.size).toBe(0);
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

  it('runs a stored answer as it is stored: a curly quote in code is a failure, not something to tidy first', async () => {
    const short: Task = { ...base, id: 't_code', kind: 'question', format: 'short', prompt: 'Write an expression for the number of rows whose `city` is Austin.', choices: [], correct: null, answer: '`(df["city"] == “Austin”).sum()`', explanation: '', difficulty: 2 };
    const form = { checkable: true, setup: 'import pandas as pd\ndf = pd.DataFrame({"city": ["Austin", "Reno", "Austin"]})', answer_kind: 'code', judge: 'result == (df["city"] == "Austin").sum()' };
    const out = await checkAnswers(fakeInference(() => form), nodeRunner(), [short]);
    expect(JSON.stringify(out.flags.get('t_code'))).toContain('SyntaxError');
  }, 120_000);
});
