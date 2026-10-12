import type { Price, ProviderId } from '@folio/ai';
import { MARKUP, type Pack } from './credits';

/**
 * What a build's plan is expected to take, as a range, before anything is written. Read from the same plan the build
 * runs (buildPlan), part by part: nothing for what is written, nothing for a lesson that sets no such work, and the
 * parts a chosen one cannot be written without counted with it.
 *
 * In Folio credits at Folio's own mix of models (a credit is a cent; a call costs three times its model price).
 * Where each pair comes from, and how far it can be trusted:
 * - plan 84 to 117: measured, paid, 9 October 2026, four lessons of one course (28 to 39 cents of calls), by how many
 *   of its segments were written again.
 * - slides 25 to 62: 25 measured on those four lessons. Since then a deck follows its lesson step by step, and decks
 *   written through the CLI came out up to two and a half times as long; not measured paid again.
 * - quiz 16, study guide 14, FAQ 10, discussion prompts 7, graded work with its rubric and key 32: measured on the
 *   same four lessons, one figure each. The upper figure is half as much again, an allowance and not a measurement.
 * - lesson facts 15 to 60 and rubrics alone 6 to 12: never run paid. Reckoned from the size of what is sent and
 *   written at the models' prices: facts are one writing and one reading, or two of each when the reading finds a
 *   fault, and either can be asked once more; a rubric alone is one short call, asked once more if it fails.
 * A range from four lessons is what was seen, not a limit: the words beside the figure say so.
 */
const RANGE: Record<string, { credits: [number, number]; reckoned?: true }> = {
  plan: { credits: [84, 117] },
  slides: { credits: [25, 62] },
  quiz: { credits: [16, 24] },
  study: { credits: [14, 21] },
  faq: { credits: [10, 15] },
  discussions: { credits: [7, 11] },
  assignments: { credits: [32, 48] },
  facts: { credits: [15, 60], reckoned: true },
  rubrics: { credits: [6, 12], reckoned: true },
};

/** What Folio's mix pays for a million tokens written, in dollars: both its models' price when the ranges were measured. */
const MIX_OUTPUT = 10;

export interface Estimate {
  /** Parts the plan runs. */
  parts: number;
  /** Folio credits, low and high, rounded outward to ten. */
  credits: [number, number];
  /** The same at the models' own prices, in dollars, before Folio's markup. */
  dollars: [number, number];
  /** Parts whose figure is reckoned from size and not measured. */
  reckoned: number;
  /** Parts with no figure at all: counted, never as nothing. */
  unknown: number;
  /** Parts the teacher did not ask for by name, each with the part that needs it. */
  needed: { kind: string; neededBy: string; lessons: number[] }[];
}

/** A part of a plan, as far as an estimate reads it (a PlannedTask is one). */
interface Task {
  kind: string;
  state: string;
  lesson: number;
  neededBy?: string;
}

export function planEstimate(tasks: readonly Task[]): Estimate {
  const run = tasks.filter((t) => t.state === 'run');
  const priced = run.filter((t) => RANGE[t.kind]);
  const sum = (i: 0 | 1) => priced.reduce((n, t) => n + RANGE[t.kind]!.credits[i], 0);
  const credits: [number, number] = [Math.floor(sum(0) / 10) * 10, Math.ceil(sum(1) / 10) * 10];
  const needed: Estimate['needed'] = [];
  for (const t of run) {
    if (!t.neededBy) continue;
    const row = needed.find((n) => n.kind === t.kind && n.neededBy === t.neededBy);
    if (row) row.lessons.push(t.lesson);
    else needed.push({ kind: t.kind, neededBy: t.neededBy, lessons: [t.lesson] });
  }
  return { parts: run.length, credits, dollars: [sum(0) / MARKUP / 100, sum(1) / MARKUP / 100], reckoned: priced.filter((t) => RANGE[t.kind]!.reckoned).length, unknown: run.length - priced.length, needed };
}

/**
 * How a model's price stands to the mix the ranges were measured on: 1 for Folio's own mix; for a teacher's own key,
 * the model's price for what it writes over the mix's. Null where no price is known: no figure is then given.
 */
export function priceFactor(provider: ProviderId | null, price: Price | null): number | null {
  if (provider === 'folio') return 1;
  return price ? (price.output * 1e6) / MIX_OUTPUT : null;
}

const NAMES: Record<string, string> = { plan: 'lesson plan', slides: 'slide deck', quiz: 'quiz', study: 'study guide', faq: 'FAQ', discussions: 'discussion prompts', assignments: 'graded work', rubrics: 'rubrics', facts: 'facts' };
const money = (usd: number) => (usd < 0.1 ? `${Math.max(1, Math.round(usd * 100))}¢` : `$${usd.toFixed(2)}`);
const span = (a: string, b: string) => (a === b ? a : `${a} to ${b}`);
const lessonsOf = (n: number[]) => (n.length === 1 ? `lesson ${n[0]}` : n.length === 2 ? `lessons ${n[0]} and ${n[1]}` : `${n.length} lessons`);

/** Why a part nobody ticked is written: said before the build, with the lessons it is written for. */
function neededLine(n: Estimate['needed'][number]): string {
  const of = lessonsOf(n.lessons);
  if (n.kind === 'facts') return `Also part of this: the facts of ${of}, settled once first for the ${NAMES[n.neededBy] ?? n.neededBy}, since no lesson plan is written.`;
  if (n.kind === 'plan') return `Also written: the lesson plan of ${of}, which the ${NAMES[n.neededBy] ?? n.neededBy} is written from.`;
  if (n.kind === 'assignments') return `Also written: the graded work of ${of}, since a rubric is written with the work it scores.`;
  return `Also written: the ${NAMES[n.kind] ?? n.kind} of ${of}, which the ${NAMES[n.neededBy] ?? n.neededBy} needs.`;
}

export interface Paying {
  provider: ProviderId | null;
  model: string;
  /** The model's price with a key of one's own; null where none is known. */
  price: Price | null;
  /** Folio credits held; null while not known. */
  balance: number | null;
  packs: readonly Pack[];
}

/** The pack that covers so many credits, the smallest that does. */
const covering = (short: number, packs: readonly Pack[]) => [...packs].sort((a, b) => a.credits - b.credits).find((p) => p.credits >= short);

/** With Folio credits: what is used, what that is worth, and whether anything has to be bought. Three things, kept apart. */
function creditLines(e: Estimate, pay: Paying): string[] {
  const [low, high] = e.credits;
  const used = `About ${span(low.toLocaleString('en-US'), high.toLocaleString('en-US'))} credits (${span(money(low / 100), money(high / 100))} of credits at the standard rate).`;
  if (pay.balance === null) return [used];
  if (pay.balance >= high) return [used, `You have ${pay.balance.toLocaleString('en-US')}: nothing to buy.`];
  const short = high - pay.balance;
  const pack = covering(short, pay.packs);
  const buy = pack ? `the $${pack.usd} pack (${pack.credits.toLocaleString('en-US')} credits) covers it` : pay.packs.length ? 'more than one pack is needed' : 'buying credits opens soon';
  return [used, pay.balance >= low ? `You have ${pay.balance.toLocaleString('en-US')}: it may be enough, and may fall up to ${short.toLocaleString('en-US')} short; ${buy}.` : `You have ${pay.balance.toLocaleString('en-US')}: ${span((low - pay.balance).toLocaleString('en-US'), short.toLocaleString('en-US'))} more are needed; ${buy}.`];
}

/** With a key of one's own: what the provider is expected to charge, or that no figure can be given, and why. */
function keyLines(e: Estimate, pay: Paying): string[] {
  if (pay.provider === 'local') return ['Written by a model on your own computer: no provider charges for it.'];
  const factor = priceFactor(pay.provider, pay.price);
  if (factor === null) return [`No price is known for ${pay.model || 'this model'}, so no figure can be given: ${e.parts === 1 ? 'one part is' : `${e.parts} parts are`} to be written, charged by your provider.`];
  return [`About ${span(money(e.dollars[0] * factor), money(e.dollars[1] * factor))} charged by your provider for ${pay.model}, not by Folio. Reckoned from what Folio’s own models were measured to cost, by this model’s price; not measured on it.`];
}

/**
 * The sentences beside a button that starts a build: the range, who is paid, what else is written, and how far the
 * figure can be trusted. An empty plan says there is nothing to pay; a part without a figure is said, never added as nothing.
 */
export function estimateLines(e: Estimate, pay: Paying): string[] {
  if (e.parts === 0) return ['Everything chosen is written: there is nothing left to pay for.'];
  const lines = e.unknown === e.parts ? [`${e.parts === 1 ? 'One part is' : `${e.parts} parts are`} to be written, and what ${e.parts === 1 ? 'it costs' : 'they cost'} is not known.`] : pay.provider === 'folio' ? creditLines(e, pay) : keyLines(e, pay);
  for (const n of e.needed) lines.push(neededLine(n));
  if (e.unknown && e.unknown !== e.parts) lines.push(`${e.unknown === 1 ? 'One part is' : `${e.unknown} parts are`} not in the figure: what ${e.unknown === 1 ? 'it costs' : 'they cost'} is not known.`);
  if (e.reckoned) lines.push(`${e.reckoned === 1 ? 'One short step is' : `${e.reckoned} short steps are`} in the figure by reckoning, not by measurement (a lesson’s facts, a rubric alone).`);
  lines.push('An estimate from a few measured lessons, not a bill and not a limit: a part that fails is asked once more, and one a check finds a fault in is written again once.');
  return lines;
}

/** The figure alone, for a line with no room for more ("Paused · 3 parts left · about 60 to 110 credits"); the sentences go with it as its description. */
export function estimateShort(e: Estimate, pay: Paying): string {
  if (e.parts === 0) return '';
  if (e.unknown === e.parts) return 'cost not known';
  if (pay.provider === 'folio') return `about ${span(e.credits[0].toLocaleString('en-US'), e.credits[1].toLocaleString('en-US'))} credits`;
  if (pay.provider === 'local') return 'no provider charge';
  const factor = priceFactor(pay.provider, pay.price);
  return factor === null ? 'cost not known' : `about ${span(money(e.dollars[0] * factor), money(e.dollars[1] * factor))}`;
}
