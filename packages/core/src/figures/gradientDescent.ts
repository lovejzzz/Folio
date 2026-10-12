/**
 * Gradient descent on one parameter, as a model with no drawing in it. The loss is the simplest that has a lowest
 * point: loss(w) = (w - best)^2, whose slope at w is 2 (w - best). Each step moves w against the slope by the
 * learning rate times the slope. Everything shown and said of the demonstration comes from the steps this returns.
 *
 * A course file gives it as three numbers and a target, in the form every demonstration has: values = [where w
 * starts, the learning rate, how many steps], target = the lowest point. With this loss a rate under 0.5 walks down
 * one side, 0.5 lands in one step, between 0.5 and 1 it crosses over and still closes in, 1 bounces between two
 * points for ever, and over 1 each step lands further away: the demonstration says which, since that is its lesson.
 */

export interface GradientDescentInput {
  values: number[];
  target: number;
}

export interface DescentStep {
  /** Counted from 1. */
  step: number;
  w: number;
  loss: number;
  slope: number;
  /** How far w moves: the learning rate times the slope. */
  move: number;
  next: number;
  nextLoss: number;
}

export interface GradientDescentModel {
  start: number;
  rate: number;
  best: number;
  steps: DescentStep[];
  /** How the walk goes with this learning rate. */
  course: 'there' | 'downhill' | 'crossing' | 'bouncing' | 'diverging';
}

export const DESCENT_STEPS_MAX = 8;

/** Why the three numbers cannot be walked, or null. */
export function gradientDescentProblem(input: GradientDescentInput): 'notNumbers' | 'badSetup' | null {
  if (![...input.values, input.target].every((n) => Number.isFinite(n))) return 'notNumbers';
  const [, rate, steps] = input.values;
  return input.values.length === 3 && rate! > 0 && Number.isInteger(steps) && steps! >= 1 && steps! <= DESCENT_STEPS_MAX ? null : 'badSetup';
}

export function gradientDescent(input: GradientDescentInput): GradientDescentModel {
  const problem = gradientDescentProblem(input);
  if (problem) throw new Error(`gradient descent: ${problem}`);
  const [start, rate, count] = input.values as [number, number, number];
  const best = input.target;
  const loss = (w: number) => (w - best) ** 2;
  const steps: DescentStep[] = [];
  let w = start;
  for (let step = 1; step <= count; step++) {
    const slope = 2 * (w - best);
    const next = w - rate * slope;
    steps.push({ step, w, loss: loss(w), slope, move: rate * slope, next, nextLoss: loss(next) });
    w = next;
  }
  const course = start === best ? 'there' : rate < 0.5 ? 'downhill' : rate < 1 ? 'crossing' : rate === 1 ? 'bouncing' : 'diverging';
  return { start, rate, best, steps, course };
}

/**
 * A number as the demonstration writes it: exactly when it has at most three decimals, else rounded to three and
 * said to be ("about"). The model keeps the number itself; only its writing is shortened, and never without a word.
 */
export function written(n: number): { text: string; exact: boolean } {
  const rounded = Math.round(n * 1000) / 1000;
  const text = String(Object.is(rounded, -0) ? 0 : rounded);
  return { text, exact: Math.abs(n - rounded) < 1e-12 };
}
const say = (n: number) => (written(n).exact ? written(n).text : `about ${written(n).text}`);

export function describeDescentStart(m: GradientDescentModel): string {
  return `The loss is lowest at w = ${say(m.best)}. w starts at ${say(m.start)}, where the loss is ${say((m.start - m.best) ** 2)}; the learning rate is ${say(m.rate)}.`;
}

export function describeDescentStep(m: GradientDescentModel, s: DescentStep): string {
  if (s.slope === 0) return `Step ${s.step}. At w = ${say(s.w)} the slope is 0: w is at the lowest point and does not move.`;
  const way = s.slope > 0 ? 'down' : 'up';
  return `Step ${s.step}. At w = ${say(s.w)} the loss is ${say(s.loss)} and the slope is ${say(s.slope)}. The step is ${say(m.rate)} × ${say(s.slope)} = ${say(s.move)}, so w goes ${way} to ${say(s.next)}, where the loss is ${say(s.nextLoss)}.`;
}

export function describeDescentResult(m: GradientDescentModel): string {
  const last = m.steps.at(-1)!;
  const end = `After ${m.steps.length} ${m.steps.length === 1 ? 'step' : 'steps'} w is ${say(last.next)} and the loss is ${say(last.nextLoss)}.`;
  const why: Record<GradientDescentModel['course'], string> = {
    there: 'w started at the lowest point, where the slope is 0, so nothing moved.',
    downhill: 'Each step is shorter than the last, since the slope shrinks as w nears the lowest point.',
    crossing: 'Each step crosses to the other side of the lowest point and lands nearer to it: the learning rate is large, and still small enough.',
    bouncing: 'Every step lands as far on the other side as it started: with this learning rate w never gets nearer.',
    diverging: 'Every step lands further from the lowest point than it started: the learning rate is too large, and the loss grows.',
  };
  return `${end} ${why[m.course]}`;
}

export function gradientDescentTable(m: GradientDescentModel): { columns: string[]; rows: string[][] } {
  const cell = (n: number) => (written(n).exact ? written(n).text : `≈ ${written(n).text}`);
  return {
    columns: ['Step', 'w', 'Loss', 'Slope', 'Learning rate × slope', 'New w'],
    rows: m.steps.map((s) => [String(s.step), cell(s.w), cell(s.loss), cell(s.slope), `${cell(m.rate)} × ${cell(s.slope)} = ${cell(s.move)}`, cell(s.next)]),
  };
}
