import type { Flag, Task } from '@folio/core';
import { RUNNER_ERRORS, type Runner } from '@folio/run';
import { z } from 'zod';
import { corrected } from './answerFix';
import { HARNESS } from './answerHarness';
import type { Inference } from './inference';
import { runJob } from './jobs';
import { oneAtATime } from './runCells';

/**
 * Answers that can be computed are computed. For a question or an answer key that holds code or numbers, the
 * writer's model fills in a form (the item's data, and expressions for what the item claims); a fixed program
 * runs it in the workshop and compares the results with the words stored in the item. An item that fails is
 * given a second form, written afresh: only what fails twice is told to the teacher, with both values.
 * Measured on four courses: 8 items in 49 had a wrong key or a wrong explanation, and no reading had found one.
 */

const INSTRUCTION = `You are given one item from a course as JSON: a quiz question (prompt, numbered choices with the keyed one marked, or a stored answer, and an explanation) or an assignment (steps and its answer key). Write the item's hidden check as DATA for a fixed checking program. You do not write assertions and you never restate the keyed value: the program reads the key, the choices, the answer and the answer key from the stored item itself, runs what you give it, and compares.

Your part is only: (a) Python that builds the data the item gives, and (b) expressions that compute, from that data, what the item claims. Write each expression from what the task tells the student to do, as a careful student would do it. Never tune an expression so that it reproduces the stored value, and do not work the value out yourself: if the stored key is wrong the check is supposed to fail, and a failing check is a good result. You are not asked to make checks pass.

Reply with one JSON object and nothing else (no code fence). Fields:

"checkable": true or false. false only when nothing in the item can be computed by running code (a question of judgement or definition, a free-text answer, an answer that needs the student's own work). Then give "reason_kind": one of "conceptual", "open_answer", "needs_student_work", "needs_data_not_in_item", and stop.

"setup": Python code, run fresh before every expression. It defines exactly the data and names the item gives (the list in the prompt, the array in step 1, the table described in words), with the imports needed. When the item is about a function or class the student writes, write it here exactly as the steps specify it. When the item describes data only in general ("a 4-row, 3-column array", "a sample of 12 observations"), build a small concrete example of it and say so in a comment. Allowed: the standard library, numpy, pandas, scipy, statsmodels, scikit-learn. No files, no network, no input. Under 20 seconds.

For a "choice" question:
"choices": one entry for each choice, {"n": its number, "kind": ...}:
  - "value": the choice states a result (a number, several numbers, a label, True/False). Give once, at the top level, "answer_expr": the expression for the result the question asks for. The program reads the numbers (or the text) from every "value" choice and requires that the keyed choice, and no other, states what answer_expr gives. When only the first k numbers of a choice are the result (the rest belong to a reason), add "first": k. When two choices state the same result and differ only in the reason they give, mark the non-keyed one "concept".
  - "code": the choice is code (an expression, a call, a definition). A choice that is code is always "code", never "claim": do not describe in your own expression what its code would do. The program runs each choice's code exactly as stored, after setup, and puts its value in \`result\` (when the code raised, \`raised\` is True, \`error\` is the exception's class name and \`result\` the exception; what it printed is in \`printed\`). Give once, at the top level, "judge": a boolean expression over \`result\`, \`raised\`, \`error\`, \`printed\` and the setup's names that is true exactly when the code does what the question asks. When the choice's code is a definition or statements, also give "probe": an expression evaluated after it (a call of the function it defines) whose value becomes \`result\`. The program requires judge to be true for the keyed choice and for no other.
  - "claim": the choice is a sentence whose truth can be computed. Give "truth_expr": a boolean expression that is true exactly when the sentence is true. The program requires it to be true for the keyed choice only.
  - "concept": the choice cannot be tested by running code.
  For a wrong choice whose origin the explanation states ("7 comes from adding instead of multiplying"; "the second version returns None"), encode what the explanation SAYS, not what you think happened:
  - on a "value" choice, "origin_expr": the expression for the mistake as the explanation words it. The program requires it to give that choice's stored value. Do not search for some other expression that happens to give the value.
  - on a "code" choice, "says_expr": a boolean expression over \`result\`, \`raised\`, \`error\`, \`printed\` that is true exactly when the choice's code does what the explanation says it does ("this gives 3 rows of 8", "this raises an error", "this returns None"): compute both sides of any comparison.
  Give one of the two for every wrong value or code choice about which the explanation says something that running code can decide; otherwise list that sentence under "unchecked".

For a "truefalse" question: "truth_expr": a boolean expression that is true exactly when the statement is true, computed on concrete data (build an example in setup; a statement about all cases may be tested on two or three concrete cases joined with \`and\`).

For a "numeric" question: "answer_expr": the expression for the answer, in the units and form the question asks (a tuple or list for several numbers). The program compares it with the stored answer, rounded as stored.

For a "short" question: "answer_kind": "code" when the stored answer is code (the program runs the stored answer exactly as written, puts its value in \`result\`, and requires "judge", a boolean expression that is true when it did what was asked; "probe" as above when it is a definition); "value" when it is a computed value (give "answer_expr"); "prose" otherwise.

For every item, also:
"stated": every other computed value the item states: in the prompt (an invented output whose numbers must agree with each other), in the explanation, in the stored answer, and, for an assignment, in the answer key: every numbered line of the key that states a computed value gives one entry per value or run of values. Leave none out because the line is long: a standard deviation, a sum of squares or a fence beside a mean has its own entry, and a key of nine results has nine. Each entry: {"where": "prompt" | "answer" | "explanation" | "answerKey" | "choice:N", "before": the words of the stored text that come immediately before the value, copied exactly, long enough to occur only once; it never contains the value itself and should not contain any other computed value (a run of values such as "about 6.1, 3.2, 1.5 and 0.8" is ONE entry: "before" ends just before the first of them and expr gives the list of all of them in order), "expr": the expression that computes it}. The program finds "before" in the stored text, reads the number that follows it (as many numbers as expr gives), and compares, rounded as stored. Add "occurrence": k when the words occur more than once. Add "kind": "range" when the text gives two bounds the computed value must lie between: "before" ends just before the lower bound and expr gives the single computed value. Add "tolerance": x (an absolute amount) only when the text itself says the value is approximate because of random draws or because it is derived from rounded numbers; never to absorb a disagreement. The program reads a fraction as one value (3/8 is 0.375, 1 1/2 is 1.5: give Fraction(3, 8) or the quotient, never the numerator and the denominator apart) and a number written with a power of ten as one value (3.011 × 10²³ is 3.011e23: give the whole number, never the part before the ×). Use the constants the item itself gives (a molar mass, a rate, g); where it gives none, use the value to as many places as the item's own answers show. For a value that is text (a label, a dtype name, a class name), expr gives the string and the stored text after "before" must start with it.
"verbatim": every piece of code in the stored answer, answer key or explanation that a student or grader would paste and run: {"where": ..., "text": the code copied exactly as stored, character for character, including its quote characters, "expect": optional boolean expression over \`result\` (and \`printed\`, \`raised\`) that is true when it did what the text says, "probe": optional}. The program runs the stored characters.
"unchecked": a list of short phrases, one for each claim in the item that the check does not test, with the reason in two or three words.

Rules: an expression must compute from the setup's names; a bare literal is rejected, and so is a boolean expression forced by a constant (\`... and False\`, \`... or True\`, \`x if False else y\`). Every expression is evaluated in a fresh run of setup, so it must not depend on another expression. A random draw uses the seed the item gives. If only part of the item is computable, check that part and list the rest under "unchecked". If the key itself (the keyed choice, the stored answer, the answer key's values) is not tested by anything you wrote, say so first in "unchecked" as "KEY: not tested, <reason>".

The item:`;

/**
 * The form, field by field as the checking program reads it. A model that must answer in a given shape gives
 * exactly that shape: asked for "an object", the paid models gave an empty one every time, and the check ran on
 * nothing while looking as if it worked (it had only been tried through a command line that does not hold the
 * model to the shape).
 */
const expr = z.string().default('');
const count = z.number().nullable().default(null);
export const AnswerForm = z.object({
  checkable: z.boolean(),
  reason_kind: z.string().default(''),
  setup: z.string().default(''),
  answer_expr: expr,
  answer_kind: z.enum(['', 'code', 'value', 'prose']).default(''),
  first: count,
  judge: expr,
  probe: expr,
  truth_expr: expr,
  tolerance: count,
  choices: z.array(z.object({ n: z.number().int(), kind: z.enum(['value', 'code', 'claim', 'concept']), origin_expr: expr, says_expr: expr, truth_expr: expr, first: count })).default([]),
  stated: z.array(z.object({ where: z.string(), before: z.string(), expr: z.string(), occurrence: count, kind: z.enum(['', 'range']).default(''), tolerance: count })).default([]),
  verbatim: z.array(z.object({ where: z.string(), text: z.string(), expect: expr, probe: expr, occurrence: count })).default([]),
  unchecked: z.array(z.string()).default([]),
});
type Form = z.infer<typeof AnswerForm>;

interface Check {
  id: string;
  what: string;
  status: 'pass' | 'fail' | 'invalid';
  detail: string;
}
interface Verdict {
  status: 'PASS' | 'FAIL' | 'INVALID' | 'UNCHECKABLE';
  checks: Check[];
}

/** Worth a form: an item with code in it, or with enough numbers that something was worked out. */
export function worthChecking(task: Task): boolean {
  if (task.kind === 'discussion') return false;
  const text = task.kind === 'question' ? [task.prompt, ...task.choices.map((c) => c.text), task.answer, task.explanation].join(' ') : [...task.steps, task.answerKey].join(' ');
  if (task.kind === 'assignment' && !task.answerKey.trim()) return false;
  return /`[^`]+`|\b(print|def|import|return)\b|[=<>]=|\w\(.*\)/.test(text) || (text.match(/\d+(\.\d+)?/g) ?? []).length >= 4;
}

/** The item as the form's writer sees it: choices by number, the keyed one marked. */
function shownItem(task: Task): unknown {
  if (task.kind !== 'question') return task.kind === 'assignment' ? { kind: 'assignment', title: task.title, prompt: task.prompt, steps: task.steps, answerKey: task.answerKey } : {};
  const choices = task.choices.map((c, i) => ({ n: i + 1, text: c.text, keyed: c.id === task.correct }));
  return { kind: 'question', format: task.format, prompt: task.prompt, ...(choices.length ? { choices } : {}), answer: task.answer, explanation: task.explanation };
}

/** The libraries the form's setup brings in, named where the runner looks for them before it runs anything. */
function imports(form: Form): string {
  const found = form.setup.split('\n').filter((l) => /^\s*(import|from)\s+[\w.]+/.test(l)).map((l) => `    ${l.trim()}`);
  return found.length ? `def _libraries():\n${found.join('\n')}\n` : '';
}

async function runForm(runner: Runner, task: Task, form: Form): Promise<Verdict | null> {
  await runner.reset();
  const code = `${HARNESS}\n${imports(form)}print(run_check('item.json', 'check.json'))`;
  const res = await runner.run({ code, files: [{ path: 'item.json', data: JSON.stringify(task) }, { path: 'check.json', data: JSON.stringify(form) }] });
  if (res.error && RUNNER_ERRORS.includes(res.error.type)) throw new Error(res.error.message);
  try {
    const out = JSON.parse(res.stdout.trim().split('\n').at(-1) ?? '') as Verdict;
    return Array.isArray(out.checks) ? out : null;
  } catch {
    // The program itself did not finish (too long, out of memory): the item was not checked, which is not a fault of the item.
    return null;
  }
}

// The instruction is the same for every item and nine tenths of what is sent: given apart, it is read from the cache after the first call.
async function fill(inference: Inference, task: Task, signal?: AbortSignal): Promise<Form> {
  const result = await runJob(inference, { task: 'folio_answer_check', system: 'You write data for a checking program. Reply with one JSON object and nothing else.', context: INSTRUCTION, prompt: JSON.stringify(shownItem(task), null, 1), effort: 'medium', schema: AnswerForm, repair: false, signal });
  return result.value;
}

/** What one claim is: the key, a wrong choice's origin, a stated value. Forms number stated values as they list them, so those are told apart by what they point at. */
const claim = (c: Check): string => {
  if (!/^(stated|verbatim)/.test(c.id)) return c.id;
  // By where it points, not by how much of the text around it a form quoted: two forms failing on one number with
  // anchors of different lengths were taken for two claims, and a real error went unsaid.
  const [where, ...rest] = c.what.split(':');
  const words = rest.join(':').replace(/[…\s]+/g, ' ').trim();
  return `${where}:${c.id.startsWith('stated') ? words.slice(-16) : words.slice(0, 16)}`;
};

const ORIGIN = 'the mistake the explanation names';

export interface AnswerChecks {
  /** What failed twice, by task: for the teacher. */
  flags: Map<string, Flag[]>;
  /** Items put right by what was computed, as they now stand: each held when checked again. */
  fixed: Map<string, Task>;
  /** The items whose claims were computed and held. */
  held: Set<string>;
  checked: number;
  /** Items no check could bind to or run for: counted, never shown as a problem. */
  unchecked: number;
}

async function checkOne(inference: Inference, runner: Runner, task: Task, signal?: AbortSignal): Promise<Flag[] | null> {
  const once = async (): Promise<Verdict | null> => {
    const form = await fill(inference, task, signal);
    return oneAtATime(runner, () => runForm(runner, task, form));
  };
  const first = await once();
  if (!first || first.status === 'UNCHECKABLE' || first.status === 'INVALID') return null;
  if (first.status === 'PASS') return [];
  // A form can be wrong where the item is right (one in nine was): a second, written afresh, must fail on the same claim.
  const second = await once();
  if (!second || second.status !== 'FAIL') return [];
  const again = new Set(second.checks.filter((c) => c.status === 'fail').map(claim));
  const failed = first.checks.filter((c) => c.status === 'fail' && again.has(claim(c)));
  // The key first, and two at most: when the keyed code does not run, everything said of the choices fails with it.
  const told = [...failed.filter((c) => c.id === 'key'), ...failed.filter((c) => c.id !== 'key')].slice(0, 2);
  return told.map((c) => ({ code: 'answerCheck' as const, values: { claim: c.what.slice(0, 200), found: c.detail.slice(0, 300) } }));
}

/**
 * Check every item worth checking. A check that cannot be had (the model, the runner) never costs the item:
 * it is then counted as unchecked. Stopping still stops.
 */
export async function checkAnswers(inference: Inference, runner: Runner, tasks: Task[], signal?: AbortSignal): Promise<AnswerChecks> {
  const out: AnswerChecks = { flags: new Map(), fixed: new Map(), held: new Set(), checked: 0, unchecked: 0 };
  const one = async (task: Task) => {
    const flags = await checkOne(inference, runner, task, signal).catch((error: unknown) => (signal?.aborted ? Promise.reject(error) : null));
    if (flags === null) out.unchecked += 1;
    else out.checked += 1;
    if (!flags?.length) return void (flags && out.held.add(task.id));
    // Put right by what was computed, and kept only if it then holds: otherwise the item stands as written, with its note.
    const again = await corrected(inference, task, shownItem(task), flags, signal).catch(() => null);
    const holds = again ? await checkOne(inference, runner, again, signal).catch(() => null) : null;
    if (again && holds && !holds.length) out.fixed.set(task.id, again);
    else {
      // What an explanation says of a wrong choice ("22.0 omits the initial velocity", when that gives 18.0) is put right when it
      // can be; when it cannot, the form misread the mistake as often as the item misstated it, and the teacher is not told.
      const loud = flags.filter((f) => !(f.code === 'answerCheck' && f.values.claim.startsWith(ORIGIN)));
      if (loud.length) out.flags.set(task.id, loud);
    }
  };
  // The first alone: its call puts the instruction in the cache, and the rest, sent together after it, read it there
  // for a tenth of the price. Sent all at once, every call paid to write it and none read it.
  const [first, ...rest] = tasks.filter(worthChecking);
  if (first) await one(first);
  await Promise.all(rest.map(one));
  return out;
}

type Fill = { type: string; payload: { tasks?: Task[] } };

/** A quiz or a lesson's assignments as written, with what the answer check found noted on each item it failed. */
export async function withAnswerChecks<C extends { type: string; payload: unknown }>(inference: Inference, runner: Runner | undefined, written: { commands: C[]; flagged: number }, signal?: AbortSignal): Promise<{ commands: C[]; flagged: number }> {
  const tasks = written.commands.flatMap((c) => (c.type === 'tasks.fill' ? ((c as Fill).payload.tasks ?? []) : []));
  if (!runner || !tasks.some(worthChecking)) return written;
  const checked = await checkAnswers(inference, runner, tasks, signal);
  const { flags, held } = checked;
  const { fixed } = checked;
  if (!flags.size && !held.size && !fixed.size) return written;
  const mark = (t: Task): Task => (fixed.has(t.id) ? { ...fixed.get(t.id)!, checked: true } : flags.has(t.id) ? { ...t, flags: [...t.flags, ...flags.get(t.id)!] } : held.has(t.id) ? { ...t, checked: true } : t);
  const noted = (c: C): C => (c.type === 'tasks.fill' ? { ...c, payload: { ...(c.payload as object), tasks: ((c as Fill).payload.tasks ?? []).map(mark) } } : c);
  return { commands: written.commands.map(noted), flagged: written.flagged + flags.size };
}
