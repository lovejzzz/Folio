import { written } from './gradientDescent';

/**
 * How many equal loads fit a budget, one at a time, as a model with no drawing in it: servers into a rack with a
 * power budget, which is how a machine room is filled, and the same sum as batches into a GPU's memory. A course
 * file gives values = [what one server takes, the budget, how many slots the rack has]; the target is unused.
 * Servers go in from the bottom until the next would go over the budget or no slot is left; the model says which
 * of the two stopped it, since that is the lesson: a rack is often full of power before it is full of metal.
 */

export interface RackBudgetInput {
  values: number[];
}

export interface RackStep {
  /** Counted from 1: the server tried. */
  step: number;
  /** What the rack would take with it in. */
  total: number;
  fits: boolean;
}

export interface RackBudgetModel {
  each: number;
  budget: number;
  slots: number;
  steps: RackStep[];
  /** How many went in, and what stopped the next: the budget, the slots, or both at once. */
  fitted: number;
  stoppedBy: 'budget' | 'slots' | 'both';
}

export const RACK_SLOTS_MAX = 8;

export function rackBudgetProblem(input: RackBudgetInput): 'notNumbers' | 'badSetup' | null {
  if (!input.values.every((n) => Number.isFinite(n))) return 'notNumbers';
  const [each, budget, slots] = input.values;
  return input.values.length === 3 && each! > 0 && budget! > 0 && Number.isInteger(slots) && slots! >= 1 && slots! <= RACK_SLOTS_MAX ? null : 'badSetup';
}

export function rackBudget(input: RackBudgetInput): RackBudgetModel {
  const problem = rackBudgetProblem(input);
  if (problem) throw new Error(`rack budget: ${problem}`);
  const [each, budget, slots] = input.values as [number, number, number];
  // Sums of decimals are compared with a little room: three servers of 0.1 are 0.3, not a hair over it.
  const within = (total: number) => total <= budget + 1e-9;
  const steps: RackStep[] = [];
  let fitted = 0;
  for (let k = 1; k <= slots; k++) {
    const total = Math.round(k * each * 1e9) / 1e9;
    steps.push({ step: k, total, fits: within(total) });
    if (!within(total)) break;
    fitted = k;
  }
  const overNext = !within((fitted + 1) * each);
  return { each, budget, slots, steps, fitted, stoppedBy: fitted === slots ? (overNext ? 'both' : 'slots') : 'budget' };
}

const say = (n: number) => (written(n).exact ? written(n).text : `about ${written(n).text}`);
const nth = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'];
const count = (n: number) => `${n} ${n === 1 ? 'server' : 'servers'}`;

export function describeRackStart(m: RackBudgetModel): string {
  return `A rack with ${m.slots} ${m.slots === 1 ? 'slot' : 'slots'} and a budget of ${say(m.budget)}; each server takes ${say(m.each)}. How many fit?`;
}

export function describeRackStep(m: RackBudgetModel, s: RackStep): string {
  const sum = `${s.step} × ${say(m.each)} = ${say(s.total)}`;
  if (s.fits) return `The ${nth[s.step - 1]} server goes in: ${sum} of ${say(m.budget)}, with ${say(m.budget - s.total)} left.`;
  return `The ${nth[s.step - 1]} server would bring it to ${sum}, over the budget of ${say(m.budget)} by ${say(s.total - m.budget)}: it does not go in.`;
}

export function describeRackResult(m: RackBudgetModel): string {
  const used = `${count(m.fitted)} fit, taking ${say(m.fitted * m.each)} of ${say(m.budget)}`;
  if (m.fitted === 0) return `Not one fits: a single server takes ${say(m.each)}, more than the budget of ${say(m.budget)}.`;
  if (m.stoppedBy === 'budget') return `${used}. The budget stopped it, not the room: ${m.slots - m.fitted} of the ${m.slots} slots stay empty.`;
  if (m.stoppedBy === 'slots') return `${used}. The room stopped it, not the budget: every slot is full and ${say(m.budget - m.fitted * m.each)} is unused.`;
  return `${used}. Every slot is full, and one more would also go over the budget.`;
}

export function rackBudgetTable(m: RackBudgetModel): { columns: string[]; rows: string[][] } {
  const cell = (n: number) => (written(n).exact ? written(n).text : `≈ ${written(n).text}`);
  return {
    columns: ['Servers', 'They take', 'Budget', 'Fits?'],
    rows: m.steps.map((s) => [String(s.step), `${s.step} × ${cell(m.each)} = ${cell(s.total)}`, cell(m.budget), s.fits ? `yes, ${cell(m.budget - s.total)} left` : `no, over by ${cell(s.total - m.budget)}`]),
  };
}
