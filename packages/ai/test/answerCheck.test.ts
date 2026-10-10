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
    // And it is said in a teacher's words, not the program's.
    expect(twice.flags.get('t_wrong')).toEqual([{ code: 'answerCheck', values: { claim: 'an answer or its explanation', found: 'worked out, it is 4; the text has 3' } }]);
    // Two forms, then one request to put the item right (which this model answers with nothing to place).
    expect(model.calls.map((c) => c.task)).toEqual(['folio_answer_check', 'folio_answer_check', 'folio_answer_fix']);
    expect(model.calls[0]!.prompt).toContain('"keyed": true');
    // A pass is said too: the item is marked as checked, which a teacher can see.
    expect([...(await checkAnswers(model, scripted([PASS]), [right])).held]).toEqual(['t_right']);
    const twiceWrong = await checkAnswers(model, scripted([fail('key'), PASS]), [wrong]);
    expect([twiceWrong.flags.size, twiceWrong.held.size]).toEqual([0, 1]);
    expect((await checkAnswers(model, scripted([fail('key'), fail('origin2')]), [wrong])).flags.size).toBe(0);
    // What an explanation says of a wrong choice is put right when it can be; when it cannot, the teacher is not told: forms misread it too often.
    const origin = fail('origin2', 'the mistake the explanation names gives this distractor');
    const quiet = await checkAnswers(model, scripted([origin, origin]), [wrong]);
    expect([quiet.flags.size, model.calls.at(-1)!.task]).toEqual([0, 'folio_answer_fix']);
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
describe('a quiz or a plan that need not be asked for twice', () => {
  it('reads a question\'s kind from what it holds when it was left out, and takes the segments of two sessions', async () => {
    const { QuizDraft, PlanDraft } = await import('../src/schemas');
    const q = (more: object) => ({ prompt: 'p', answer: 'a', explanation: 'e', difficulty: 1, objective: 1, ...more });
    const read = QuizDraft.parse({ questions: [q({ choices: ['x', 'y', 'z'], answer: 'y' }), q({ choices: ['True', 'False'], answer: 'True' }), q({ answer: '12.5' }), q({ answer: 'Because the sample is small.' }), q({ format: 'short', choices: ['x', 'y'] })] });
    expect(read.questions.map((x) => x.format)).toEqual(['choice', 'truefalse', 'numeric', 'short', 'short']);
    // The model is still told the field is required.
    expect(JSON.stringify((await import('zod')).z.toJSONSchema(QuizDraft))).toMatch(/"required":\["format"/);
    const seg = { kind: 'teach', session: 1, title: 't', minutes: 10, description: 'd', teacherNotes: '' };
    const plan = (n: number) => PlanDraft.safeParse({ keyIdeas: ['a', 'b'], vocabulary: [], segments: Array.from({ length: n }, () => seg) }).success;
    expect([plan(11), plan(16), plan(25)]).toEqual([true, true, false]);
    // A segment of no minutes (the homework, set as one) is left out, and a session numbered 0 is the first: neither is a reason to write the plan again.
    const loose = PlanDraft.parse({ keyIdeas: ['a', 'b'], vocabulary: [], segments: [seg, { ...seg, session: 0 }, seg, { ...seg, title: 'Homework', minutes: 0 }] });
    expect(loose.segments.map((x) => [x.title, x.session])).toEqual([['t', 2], ['t', 1], ['t', 2]]);
    // (Sessions counted from 0 are moved up together: the lecture stays apart from the lab.)
  });
});

describe('what the check found, said for a teacher', () => {
  it('names where, what was worked out and what the text has, with none of the program\'s own marks', async () => {
    const { plainNote } = await import('../src/answerNote');
    const say = (claim: string, found: string) => Object.values(plainNote({ code: 'answerCheck', values: { claim, found } }).values).join(' | ');
    expect(say('answerKey: …The sample SD calculations are √(', "computed [50.0] not among the stored ['50/5', '160/5', '3.', '2', '6', '2', '6']")).toBe('a value in the answer key, after “The sample SD calculations are √(” | worked out, it is 50; the text there has 50/5, 160/5, 3, 2, …');
    expect(say('computed answer is stated by the keyed choice and by no other', "choices stating the computed value: []; keyed: 3; computed '74.0'")).toBe('the keyed choice is the right one | worked out, the answer is 74, which no choice states; choice 3 is keyed');
    expect(say('stored code of the keyed choice, and of no other, does what is asked', 'choices whose stored code does the job: [2, 3]; keyed: 3; 1: NameError')).toBe('the keyed choice’s code does what is asked | run as written, choices 2 and 3 did it; choice 3 is keyed');
    expect(say('computed truth of the statement equals the keyed choice', 'statement computed False; keyed true')).toBe('the keyed choice is the right one | worked out, the statement is false, and the key has it as true');
    expect(say('stored answer runs as written and does what is asked', "stored answer does not run as written: NameError: name 'df' is not defined\n  File x")).toBe('the answer runs as written | it stops with NameError: name \'df\' is not defined');
    // The program's words are cut at 300 characters: a long list that lost its closing bracket is still read.
    expect(say('answerKey: …The limit is', "computed [1.5] not among the stored ['6', '0', '15', '3', '5', '8")).toBe('a value in the answer key, after “The limit is” | worked out, it is 1.5; the text there has 6, 0, 15, 3, …');
    // Anything unforeseen is still a sentence, never the program's own.
    expect(say('something new', '{"a": [1]}')).toBe('an answer or its explanation | worked out by a program, it comes out differently');
  });
});

describe.skipIf(!existsSync(join(RUNTIME_DIR, 'pyodide-lock.json')))('the checking program, really run', () => {
  it('passes a right key and fails a wrong one, reading the key from the item and never from the form', async () => {
    const model = fakeInference(() => FORM);
    const out = await checkAnswers(model, nodeRunner(), [right, wrong]);
    expect(out).toMatchObject({ checked: 2, unchecked: 0 });
    expect(out.flags.has('t_right')).toBe(false);
    expect(out.flags.get('t_wrong')![0]).toMatchObject({ values: { claim: 'the keyed choice is the right one' } });
    expect(JSON.stringify(out.flags.get('t_wrong'))).toMatch(/worked out, the answer is 4, which choice \d states; choice 3 is keyed/);
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

  it('reads choices as they are written: an expression, code on two lines, commands to choose among', async () => {
    const run = async (task: Task, f: object) => {
      const out = await checkAnswers(fakeInference(() => f), nodeRunner(), [task]);
      return [out.checked, out.flags.size];
    };
    const values = [1, 2, 3, 4].map((n) => ({ n, kind: 'value' }));
    // "(ln 9 − 2)/4" states 0.0493: it was reported as a key no choice states.
    const logs = ['x = (ln 9 − 2)/4', 'x = (ln 9 + 2)/4', 'x = ln(7/4)', 'x = (9 − 2)/4'];
    const solve = { checkable: true, setup: 'import math', answer_expr: '(math.log(9) - 2) / 4', choices: values };
    expect(await run(choice('t_ln', 'Solve e^{4x + 2} = 9 for x.', logs, 1, 'Take the logarithm.'), solve)).toEqual([1, 0]);
    // And a key on the wrong expression is still found.
    expect(await run(choice('t_ln_wrong', 'Solve e^{4x + 2} = 9 for x.', logs, 2, 'Take the logarithm.'), solve)).toEqual([1, 1]);
    // Which command returns the mean? A value was computed and the choices are commands: nothing to compare, nobody blamed.
    const commands = ['`mean("pulse")`', '`mean(pulse[1])`', '`mean(pulse)`', '`mean(c(68, 76))`'];
    expect(await run(choice('t_cmd', 'Which command returns the mean of `pulse`?', commands, 3, 'It averages all four.'), { checkable: true, setup: 'pulse = [68, 76, 80, 72]', answer_expr: 'sum(pulse) / len(pulse)', choices: values })).toEqual([0, 0]);
    // Two statements, each on its own line in its own ticks, are run as two lines: all four came back as SyntaxError.
    const two = ['`xs = [1]`\n`xs = xs + [9]`', '`xs = [1]`\n`xs.append(2)`', '`xs = [2]`\n`xs.append(1)`', '`xs = [1, 2, 3]`\n`xs.pop()`\n`xs.pop(0)`'];
    expect(await run(choice('t_two', 'Which code leaves `xs` as `[1, 2]`?', two, 2, 'It appends 2.'), { checkable: true, setup: '', judge: 'xs == [1, 2]', choices: [1, 2, 3, 4].map((n) => ({ n, kind: 'code' })) })).toEqual([1, 0]);
  }, 180_000);

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
    // Six frequencies stated and a pair computed, none of it there: the form worked out something else, and the key is not blamed.
    const bins = async (expr: string) => {
      const out = await checkAnswers(fakeInference(() => form(expr, 'The 5 mg bins have frequencies ')), nodeRunner(), [key('t_bins', 'The 5 mg bins have frequencies 3, 3, 1, 0, 0, 1. The tallest bins hold 3.')]);
      return [out.checked, out.flags.size];
    };
    expect(await bins('[len("ab"), len("cd")]')).toEqual([0, 0]);
    // Six computed against the six stated are compared, and a wrong one is found.
    expect(await bins('[len(x) for x in ("abc", "abc", "a", "", "", "a")]')).toEqual([1, 0]);
    expect(await bins('[len(x) for x in ("abc", "ab", "a", "", "", "ab")]')).toEqual([1, 1]);
    // A form whose words to look after end on the value itself ("The limit is 14/9") found the next item's numbers: the 14 and the 9 are in those words.
    const past = await checkAnswers(fakeInference(() => form('[len("a" * 14), len("a" * 9), len("a" * 14) / len("a" * 9)]', 'The limit is 14/9')), nodeRunner(), [key('t_past', 'Numerator 14, denominator 9. The limit is 14/9.\n6. Both give 0/0, so factor: the limit is 8.')]);
    expect([past.checked, past.flags.size]).toEqual([0, 0]);
    // Numbers and truths answered together are no one value to look for: the item is left unchecked, not blamed.
    const mixed = await checkAnswers(fakeInference(() => form('(len("a" * 8), 0.0, 32.0, len("a") > 0, len("a") > 5)', 'IQR = ')), nodeRunner(), [key('t_mixed_kinds', 'IQR = 20 − 12 = 8 minutes. The fences are 0 and 32, so 40 is an outlier and 30 is not.')]);
    expect([mixed.checked, mixed.flags.size]).toEqual([0, 0]);
    // A quotient written out states its terms: the 50 of √(50/5) and the 438 of "438 / 8" are what a form computes on the way.
    expect(await run(key('t_top', 'The sample SD is √(50/5) = 3.16.'), form('sum((x - 10) ** 2 for x in (5, 10, 10, 10, 15))', 'The sample SD is √('))).toBe(0);
    expect(await run(key('t_top2', 'The variance is 438 / 8 = 54.75.'), form('sum(d * d for d in (3, 5, 20, 2))', 'The variance is '))).toBe(0);
    expect(await run(key('t_top_wrong', 'The sample SD is √(60/4) = 3.87.'), form('sum((x - 10) ** 2 for x in (5, 10, 10, 10, 15))', 'The sample SD is √('))).toBe(1);
    expect(await run(key('t_among', 'The standard errors are about 2.45 for n = 4 and 1.64 for n = 9.'), { checkable: true, setup: 'sd = 4.91', stated: [{ where: 'answerKey', before: 'The standard errors are about ', expr: '[sd / 4 ** 0.5, sd / 9 ** 0.5]' }] })).toBe(0);
    expect(await run(key('t_among_wrong', 'The standard errors are about 2.45 for n = 4 and 1.94 for n = 9.'), { checkable: true, setup: 'sd = 4.91', stated: [{ where: 'answerKey', before: 'The standard errors are about ', expr: '[sd / 4 ** 0.5, sd / 9 ** 0.5]' }] })).toBe(1);
    // And a wrong one still fails: 2/4 where three fourths was meant.
    expect(await run(key('t_wrong_frac', 'The dot sits at 2/4.'), form('Fraction(3, 4)', 'The dot sits at '))).toBe(1);
  }, 180_000);

  it('does not blame an item for what the form could not fit: a fragment with no names, an error the item names, values no choice words that way', async () => {
    const fragment: Task = { ...base, id: 't_frag', kind: 'question', format: 'short', prompt: 'A list is D → F → J. `current` points to F and `new` to a node holding H. Write the two assignments that insert H after F. What does `[].pop()` raise?', choices: [], correct: null, answer: '`new.next = current.next` then `current.next = new`. It raises IndexError.', explanation: '', difficulty: 2 };
    const formA = { checkable: true, setup: 'x = 1', verbatim: [{ where: 'answer', text: 'current.next = new' }, { where: 'prompt', text: '[].pop()' }] };
    const fences = choice('t_fence', 'Delays 2, 4, 5, 7, 8, 10, 24: which conclusion follows from the 1.5 × IQR rule?', ['Q1 = 4.5 and Q3 = 9; the upper fence is 15.75, so 24 is a possible outlier.', 'Q1 = 5 and Q3 = 10; the upper fence is 17.5, so 24 is a possible outlier.', 'Use `IQR(x)`; `range(x)` gives two numbers.'], 1, 'The fence is Q3 + 1.5 × IQR.');
    const formB = { checkable: true, setup: 'import numpy as np\nx = np.array([2, 4, 5, 7, 8, 10, 24])', answer_expr: '(np.percentile(x, 25), np.percentile(x, 75), np.percentile(x, 75) + 1.5 * (np.percentile(x, 75) - np.percentile(x, 25)), True)', choices: [{ n: 1, kind: 'value' }, { n: 2, kind: 'value' }, { n: 3, kind: 'value', origin_expr: 'float(x.max() - x.min())' }] };
    const gym = choice('t_gym', 'Passes fall from 130 to 70 when the price rises from $8 to $12. By the midpoint method, demand is:', ['Elastic', 'Inelastic', 'Unit elastic', 'Perfectly inelastic'], 1, 'The midpoint elasticity is 1.5.');
    const formC = { checkable: true, setup: 'e = abs(((70 - 130) / 100) / ((12 - 8) / 10))', answer_expr: '"Elastic" if e > 1 else "Inelastic"', choices: [1, 2, 3, 4].map((n) => ({ n, kind: 'value' })) };
    const prose: Task = { ...base, id: 't_prose', kind: 'question', format: 'short', prompt: 'Scores 4, 7, 9, 11, 13, 30: find Q1, Q3 and the upper fence by the rule taught (medians of the halves).', choices: [], correct: null, answer: 'Q1 = 7, Q3 = 13, IQR = 6, so the fences are −2 and 22; 30 is beyond 22 and the whisker ends at 13.', explanation: '', difficulty: 2 };
    const formD = { checkable: true, setup: 'q1, q3 = 7, 13', answer_kind: 'value', answer_expr: '(q1 + 0, q3 + 0, q3 - q1, q1 - 1.5 * (q3 - q1), q3 + 1.5 * (q3 - q1))' };
    const pick = (r: { prompt: string }) => (r.prompt.includes('Delays') ? formB : r.prompt.includes('Passes') ? formC : r.prompt.includes('Scores 4') ? formD : formA);
    const out = await checkAnswers(fakeInference(pick), nodeRunner(), [fragment, fences, gym, prose]);
    expect([...out.flags.values()]).toEqual([]);
  }, 120_000);

  it('does not blame a key for how the form wrote its number: as text, or as the digits before a power of ten', async () => {
    const volume = (id: string, keyed: number) => choice(id, 'A 25.0 mL sample is diluted with 57.0 mL of water. What is the final volume?', ['32.0 mL', '82.0 mL', '57.0 mL'], keyed, 'Add the volumes.');
    const text = { checkable: true, setup: 'v = 25.0 + 57.0', answer_expr: "f'{v:.4f}'", choices: [1, 2, 3].map((n) => ({ n, kind: 'value' })) };
    const sheet = (id: string, answerKey: string): Task => ({ ...base, id, kind: 'assignment', title: 'Sheet', prompt: '', steps: ['Find the hydrogen ion concentration at pH 3.2 with `10 ** -3.2`.'], rubricId: null, answerKey, toward: '' });
    const digits = (expr: string) => ({ checkable: true, setup: 'h = 10 ** -3.2', stated: [{ where: 'answerKey', before: '≈ ', expr }] });
    const mass = (id: string, keyed: number) => choice(id, 'A 3.0 mL sample has density 2.9 g/mL. What is its mass?', ['1.0 g', '8.7 g', '9 g'], keyed, 'Multiply.');
    const near = { checkable: true, setup: 'm = 3.0 * 2.9', answer_expr: 'm', choices: [1, 2, 3].map((n) => ({ n, kind: 'value' })) };
    const pick = (r: { prompt: string }) => (r.prompt.includes('density 2.9') ? near : r.prompt.includes('diluted') ? text : r.prompt.includes('7.1 × 10') ? digits('h') : digits('h * 1e4'));
    const out = await checkAnswers(fakeInference(pick), nodeRunner(), [volume('t_vol', 2), volume('t_vol_wrong', 1), sheet('t_ph', 'At pH 3.2, [H⁺] = 10^{−3.2} ≈ 6.3 × 10⁻⁴ M.'), sheet('t_ph_wrong', 'At pH 3.2, [H⁺] ≈ 7.1 × 10⁻⁴ M.'), mass('t_mass', 2), mass('t_mass_wrong', 3)]);
    // Beside "8.7 g", "9 g" does not state 8.7.
    expect([out.flags.has('t_mass'), out.flags.has('t_mass_wrong')]).toEqual([false, true]);
    // The right keys pass or go unchecked; the wrong ones are still caught.
    expect([out.flags.has('t_vol'), out.flags.has('t_vol_wrong'), out.flags.has('t_ph'), out.flags.has('t_ph_wrong')]).toEqual([false, true, false, true]);
  }, 120_000);

  it('reads a negative fraction as one number, lets words decide between choices with the same numbers, and doubts its own model of a mistake', async () => {
    const sheet = (id: string, answerKey: string): Task => ({ ...base, id, kind: 'assignment', title: 'Sheet', prompt: '', steps: ['Evaluate the limit of `(x**3 + 5*x - 1) / (x**2 + 2)` at −2.'], rubricId: null, answerKey, toward: '' });
    const limit = { checkable: true, setup: 'x = -2', stated: [{ where: 'answerKey', before: 'give ((−2)³ + 5(−2) − 1)/6 = ', expr: '(x**3 + 5*x - 1) / (x**2 + 2)' }] };
    const hiker = (id: string, keyed: number) => choice(id, 'A hiker walks 8.0 km west and then 6.0 km north. What is the displacement?', ['14 km at 37° north of west', '10 km at 37° north of west', '10 km at 53° north of west', '10 km at 37° north of east'], keyed, 'Use the components.');
    const walk = { checkable: true, setup: 'import math', answer_expr: '(math.hypot(8, 6), round(math.degrees(math.atan2(6, 8))))', choices: [1, 2, 3, 4].map((n) => ({ n, kind: 'value' })) };
    const fiber = choice('t_fiber', 'A glass fiber is 0.0068 m long. What is its length in millimeters?', ['0.0000068 mm', '0.0068 mm', '6.8 mm'], 3, 'Multiply by 1000; the first choice reverses the conversion.');
    const mm = { checkable: true, setup: 'm = 0.0068', answer_expr: 'm * 1000', choices: [{ n: 1, kind: 'value', origin_expr: 'round(m / 1000, 3)' }, { n: 2, kind: 'value' }, { n: 3, kind: 'value' }] };
    const pick = (r: { prompt: string }) => (r.prompt.includes('hiker') ? walk : r.prompt.includes('fiber') ? mm : limit);
    const out = await checkAnswers(fakeInference(pick), nodeRunner(), [sheet('t_lim', 'Direct substitution and the quotient law give ((−2)³ + 5(−2) − 1)/6 = −19/6.'), sheet('t_lim_wrong', 'Direct substitution and the quotient law give ((−2)³ + 5(−2) − 1)/6 = 19/6.'), hiker('t_hiker', 2), hiker('t_hiker_wrong', 3), fiber]);
    expect(['t_lim', 't_lim_wrong', 't_hiker', 't_hiker_wrong', 't_fiber'].map((id) => out.flags.has(id))).toEqual([false, true, false, true, false]);
  }, 120_000);

  it('reads a count spelled out, and does not look for a value past an anchor that already holds it', async () => {
    const sheet = (id: string, answerKey: string): Task => ({ ...base, id, kind: 'assignment', title: 'Sheet', prompt: '', steps: ['Count the bonds of each carbon in propane with `3 + 1`.'], rubricId: null, answerKey, toward: '' });
    const bonds = (before: string, expr: string) => ({ checkable: true, setup: 'c, h = 1, 3', stated: [{ where: 'answerKey', before, expr }] });
    const pick = (r: { prompt: string }) => (r.prompt.includes('lie close') ? bonds('−0.2488 and −0.2513 lie close to that number', '-0.2488') : bonds('three with hydrogen, totaling ', 'c + h'));
    const out = await checkAnswers(fakeInference(pick), nodeRunner(), [
      sheet('t_word', 'Each end carbon forms one bond with carbon and three with hydrogen, totaling four. The middle carbon forms 2.'),
      sheet('t_word_wrong', 'Each end carbon forms one bond with carbon and three with hydrogen, totaling five. The middle carbon forms 2.'),
      sheet('t_anchor', 'The secant slopes approach −0.25: −0.2488 and −0.2513 lie close to that number on opposite sides. (3 points) Total: 10 points'),
    ]);
    expect(['t_word', 't_word_wrong', 't_anchor'].map((id) => out.flags.has(id))).toEqual([false, true, false]);
    // The terms of a vector carry their signs set off by a space, and a format string holds no value.
    const cross = (r: { prompt: string }) => (r.prompt.includes('printf') ? { checkable: true, setup: 'cost = 125.45', stated: [{ where: 'answerKey', before: 'Total cost: $', occurrence: 1, expr: 'cost' }] } : { checkable: true, setup: 'import numpy as np\nc = np.cross([1, 2, -1], [3, -1, 0])', stated: [{ where: 'answerKey', before: 'C × D = ', expr: 'c.tolist()' }] });
    const more = await checkAnswers(fakeInference(cross), nodeRunner(), [
      sheet('t_vec', 'The correct cross product is C × D = −1î − 3ĵ − 7k̂. Use `np.cross`.'),
      sheet('t_vec_wrong', 'The correct cross product is C × D = −1î + 3ĵ − 7k̂. Use `np.cross`.'),
      sheet('t_fmt', 'Use `System.out.printf("Total cost: $%.2f%n", totalCost);` Expected output: Total cost: $125.45'),
    ]);
    expect(['t_vec', 't_vec_wrong', 't_fmt'].map((id) => more.flags.has(id))).toEqual([false, true, false]);
    // A root is the number it names.
    const rooted = (id: string, answerKey: string): Task => ({ ...base, id, kind: 'assignment', title: 'Sheet', prompt: '', steps: ['Evaluate the limit with `math.sqrt(5) / 2`.'], rubricId: null, answerKey, toward: '' });
    const roots = await checkAnswers(fakeInference(() => ({ checkable: true, setup: 'import math', stated: [{ where: 'answerKey', before: 'The limit is ', expr: 'math.sqrt(5) / 2' }] })), nodeRunner(), [rooted('t_root', 'The limit is √5/2, about 1.118.'), rooted('t_root_wrong', 'The limit is √3/2, about 0.866.')]);
    expect([roots.flags.has('t_root'), roots.flags.has('t_root_wrong')]).toEqual([false, true]);
    // A debt is written −$24.
    const debt = (id: string, answer: string): Task => ({ ...base, id, kind: 'question', format: 'numeric', prompt: 'Half of a $360 crop is the family share; the store bill is $204. What is left? Use a minus sign for debt.', choices: [], correct: null, answer, explanation: 'Half of 360 is 180, and 180 less 204 is a debt.', difficulty: 2 });
    const owed = await checkAnswers(fakeInference(() => ({ checkable: true, setup: 'left = 360 / 2 - 204', answer_kind: 'value', answer_expr: 'left' })), nodeRunner(), [debt('t_debt', '−$24'), debt('t_debt_wrong', '$24')]);
    expect([owed.flags.has('t_debt'), owed.flags.has('t_debt_wrong')]).toEqual([false, true]);
  }, 120_000);

  it('puts right a key the numbers contradict, and keeps the correction only when it then holds', async () => {
    const work: Task = { ...base, id: 't_key', kind: 'assignment', title: 'Wait times', prompt: 'Wait times in minutes: 2, 3, 4, 4, 4, 5, 6, 8.', steps: ['Find the median wait time.'], rubricId: null, answerKey: '1. Sorted: 2, 3, 4, 4, 4, 5, 6, 8. Median = (4 + 5) ÷ 2 = 4.5 minutes.', toward: '' };
    const form = { checkable: true, setup: 'import numpy as np\nx = np.array([2, 3, 4, 4, 4, 5, 6, 8])', stated: [{ where: 'answerKey', before: 'Median = (4 + 5) ÷ 2 =', expr: 'float(np.median(x))' }] };
    const fixedForm = { ...form, stated: [{ where: 'answerKey', before: 'Median = (4 + 4) ÷ 2 =', expr: 'float(np.median(x))' }] };
    const model = fakeInference((r) => (r.task === 'folio_answer_fix' ? { changes: [{ find: '(4 + 5) ÷ 2 = 4.5 minutes', replace: '(4 + 4) ÷ 2 = 4 minutes' }] } : r.prompt.includes('(4 + 4)') ? fixedForm : form));
    const out = await checkAnswers(model, nodeRunner(), [work]);
    expect(out.flags.size).toBe(0);
    expect((out.fixed.get('t_key') as { answerKey: string }).answerKey).toContain('Median = (4 + 4) ÷ 2 = 4 minutes');
    // A correction that does not hold is not kept: the item stands as written, with its note.
    const stubborn = fakeInference((r) => (r.task === 'folio_answer_fix' ? { changes: [{ find: '4.5 minutes', replace: '5 minutes' }] } : form));
    const kept = await checkAnswers(stubborn, nodeRunner(), [work]);
    expect(kept.fixed.size).toBe(0);
    expect(kept.flags.has('t_key')).toBe(true);
  }, 240_000);

  it('runs a stored answer as it is stored: a curly quote in code is a failure, not something to tidy first', async () => {
    const short: Task = { ...base, id: 't_code', kind: 'question', format: 'short', prompt: 'Write an expression for the number of rows whose `city` is Austin.', choices: [], correct: null, answer: '`(df["city"] == “Austin”).sum()`', explanation: '', difficulty: 2 };
    const form = { checkable: true, setup: 'import pandas as pd\ndf = pd.DataFrame({"city": ["Austin", "Reno", "Austin"]})', answer_kind: 'code', judge: 'result == (df["city"] == "Austin").sum()' };
    const out = await checkAnswers(fakeInference(() => form), nodeRunner(), [short]);
    expect(JSON.stringify(out.flags.get('t_code'))).toContain('SyntaxError');
  }, 120_000);
});

describe('the keys to a lesson\'s sheets', () => {
  it('are checked as a quiz is: a key that is wrong is put right, its number with it, and a key that holds is left', async () => {
    const { keysChecked, changedNumbers } = await import('../src/keyCheck');
    const sheet = (id: string, title: string, key: string) => ({ id, title, kind: 'worksheet' as const, usedIn: 'Practice', copies: 'One each', blocks: [{ type: 'para' as const, text: 'Fill in (e^h − 1)/h for h = 0.01, 0.001 and the mean of `[3, 4, 5]`.' }], key, supports: false });
    const sheets = [sheet('x_1', 'Secants', 'h = 0.01 gives 1.01005 and h = 0.001 gives 1.00050; the mean is 4.'), sheet('x_2', 'No key', '')];
    const lesson = { id: 'l_1' } as never;
    // Two forms fail on the same claim, the correction is made, and the corrected key holds.
    const model = fakeInference((req) => (req.task === 'folio_answer_fix' ? { changes: [{ find: '1.01005', replace: '1.00502' }] } : FORM));
    const out = await keysChecked(model, scripted([fail('key'), fail('key'), PASS]), lesson, sheets as never);
    expect(out.handouts.map((h) => h.key)).toEqual(['h = 0.01 gives 1.00502 and h = 0.001 gives 1.00050; the mean is 4.', '']);
    expect(out.flags).toEqual([]);
    // The number that changed, for the plan that carried it too.
    expect(out.changed).toEqual([{ find: '1.01005', replace: '1.00502' }]);
    expect(changedNumbers('IQR = 8 minutes.', 'The IQR is 8 minutes.')).toEqual([]);
    // A correction that does not hold leaves the key as written, with a note that says which key.
    const stuck = await keysChecked(model, scripted([fail('key'), fail('key'), fail('key'), fail('key')]), lesson, sheets as never);
    expect(stuck.handouts[0]!.key).toContain('1.01005');
    expect(stuck.flags).toEqual([{ code: 'answerCheck', values: { claim: 'the key to “Secants”: an answer or its explanation', found: 'worked out, it is 4; the text has 3' } }]);
    // No runner, no check, and the keys as they are.
    expect((await keysChecked(model, undefined, lesson, sheets as never)).handouts).toEqual(sheets);
  });
});
