import type { ProviderId } from '@folio/ai';
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

/**
 * What a part sends and gets back, in thousands of tokens a lesson, by who is asked: `write` is the model that writes
 * (Claude Sonnet in Folio's mix, the teacher's model with a key of their own), `sol` the model Folio's mix gives
 * quizzes, graded work and answer keys to (the teacher's own model with a key), `check` the model that reads each
 * plan (none with a provider Folio has no reviewer for). `own` is the size of the part's own request, the first
 * thing sent: what is sent grows with it, since every later call of the part (a mend, the sheets, a reading) carries
 * the same lesson and sources. From the calls of four lessons written through the CLI on 12 October 2026, counted
 * from characters; what a model thinks before it answers is not in them, so the split between sent and written leans
 * a little toward sent. The split is all they are used for: the amounts are the paid ones above.
 */
type Route = 'write' | 'sol' | 'check';
const PROFILE: Record<string, { own: number; routes: Partial<Record<Route, { sent: number; written: number }>> }> = {
  plan: { own: 10.1, routes: { write: { sent: 73.3, written: 15.5 }, sol: { sent: 7.4, written: 1.7 }, check: { sent: 26.4, written: 5.8 } } },
  slides: { own: 15.2, routes: { write: { sent: 26.6, written: 4.3 } } },
  quiz: { own: 7.7, routes: { sol: { sent: 7.7, written: 0.4 } } },
  assignments: { own: 9.9, routes: { sol: { sent: 24.7, written: 5.1 } } },
  study: { own: 13.7, routes: { write: { sent: 13.7, written: 1.9 } } },
  faq: { own: 13.6, routes: { write: { sent: 13.6, written: 0.7 } } },
  discussions: { own: 11.5, routes: { write: { sent: 11.5, written: 0.45 } } },
  // Never measured: a facts step is a writing and a reading of about a lesson's context; a rubric alone one short call.
  facts: { own: 6, routes: { write: { sent: 6, written: 1.5 }, check: { sent: 7, written: 0.8 } } },
  rubrics: { own: 5, routes: { sol: { sent: 5, written: 1 } } },
};

/** A model's price for a thousand tokens sent and written, in dollars. */
export interface RoutePrice {
  sent: number;
  written: number;
}
/** Folio's mix when the amounts were measured: both its models at $2 a million sent and $10 a million written. */
const MIX: RoutePrice = { sent: 0.002, written: 0.01 };

/**
 * What the calls of one part come to at the prices given, with its own request `scale` times the size it had when
 * measured. A route with no price (null) is left out and named in `missing`; a route that is not taken (undefined:
 * no reviewer with this provider) costs nothing and is not missing.
 */
function callsCost(kind: string, prices: Partial<Record<Route, RoutePrice | null>>, scale: number): { usd: number; missing: Route[] } {
  let usd = 0;
  const missing: Route[] = [];
  for (const [route, tokens] of Object.entries(PROFILE[kind]?.routes ?? {}) as [Route, { sent: number; written: number }][]) {
    const price = prices[route];
    if (price === undefined) continue;
    if (price === null) missing.push(route);
    else usd += tokens.sent * scale * price.sent + tokens.written * price.written;
  }
  return { usd, missing };
}
const mixCost = (kind: string, scale: number) => callsCost(kind, { write: MIX, sol: MIX, check: MIX }, scale).usd;

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
  /** The parts by kind: how many, what they take at Folio's mix, and how large their own request is beside the measured one. */
  byKind: { kind: string; count: number; credits: [number, number]; scale: number }[];
}

/** A part of a plan, as far as an estimate reads it (a PlannedTask is one). */
interface Task {
  kind: string;
  state: string;
  lesson: number;
  neededBy?: string;
}

/** A range's ends rounded outward, to ten where the figure is in hundreds and to one below: six to twelve credits stay six to twelve, not nothing to twenty. */
const outward = ([low, high]: [number, number]): [number, number] => (high < 100 ? [Math.floor(low), Math.ceil(high)] : [Math.floor(low / 10) * 10, Math.ceil(high / 10) * 10]);

/**
 * The estimate of a plan. `sent` gives, for a kind of part, the size in thousands of tokens of that part's own
 * request as it would be made now (its lesson, the course, the teacher's sources): what the part takes is scaled by
 * it, so a course with long sources is not priced as one with none. Left out, a part is priced at its measured size.
 */
export function planEstimate(tasks: readonly Task[], sent: Partial<Record<string, number>> = {}): Estimate {
  const run = tasks.filter((t) => t.state === 'run');
  const priced = run.filter((t) => RANGE[t.kind]);
  const byKind: Estimate['byKind'] = [];
  for (const kind of [...new Set(priced.map((t) => t.kind))]) {
    const count = priced.filter((t) => t.kind === kind).length;
    const scale = sent[kind] && PROFILE[kind] ? sent[kind] / PROFILE[kind].own : 1;
    const grown = mixCost(kind, scale) / mixCost(kind, 1);
    byKind.push({ kind, count, scale, credits: [RANGE[kind]!.credits[0] * grown * count, RANGE[kind]!.credits[1] * grown * count] });
  }
  const sum = (i: 0 | 1) => byKind.reduce((n, k) => n + k.credits[i], 0);
  const needed: Estimate['needed'] = [];
  for (const t of run) {
    if (!t.neededBy) continue;
    const row = needed.find((n) => n.kind === t.kind && n.neededBy === t.neededBy);
    if (row) row.lessons.push(t.lesson);
    else needed.push({ kind: t.kind, neededBy: t.neededBy, lessons: [t.lesson] });
  }
  return { parts: run.length, credits: outward([sum(0), sum(1)]), dollars: [sum(0) / MARKUP / 100, sum(1) / MARKUP / 100], reckoned: priced.filter((t) => RANGE[t.kind]!.reckoned).length, unknown: run.length - priced.length, needed, byKind };
}

/**
 * What a teacher's own provider is expected to charge for the plan: each kind's measured amount, turned from the
 * mix's prices to theirs call by call, what is sent at their price for sending and what is written at their price
 * for writing, the plan's reader at the reader's. Two models that charge the same to write and a hundredfold apart
 * to read no longer come to one figure. Null where the model that writes has no known price; `missing` where only
 * the reader has none, and its share is then left out and said.
 */
export function keyDollars(e: Estimate, prices: Partial<Record<Route, RoutePrice | null>>): { dollars: [number, number]; missing: boolean } | null {
  if (prices.write === null || prices.write === undefined) return null;
  let low = 0;
  let high = 0;
  let missing = false;
  for (const k of e.byKind) {
    const theirs = callsCost(k.kind, prices, k.scale);
    const factor = theirs.usd / mixCost(k.kind, k.scale);
    missing ||= theirs.missing.length > 0;
    low += (k.credits[0] / MARKUP / 100) * factor;
    high += (k.credits[1] / MARKUP / 100) * factor;
  }
  return { dollars: [low, high], missing };
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
  /** With a key of one's own: the price of the model that writes, and of the model that reads each plan (undefined where the provider has none, null where its price is not known). */
  prices: { write: RoutePrice | null; check?: RoutePrice | null };
  /** The model that reads each plan, by name, for saying its price is not known. */
  reader?: string;
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
  const theirs = keyDollars(e, { write: pay.prices.write, sol: pay.prices.write, check: pay.prices.check });
  if (!theirs) return [`No price is known for ${pay.model || 'this model'}, so no figure can be given: ${e.parts === 1 ? 'one part is' : `${e.parts} parts are`} to be written, charged by your provider.`];
  const figure = `About ${span(money(theirs.dollars[0]), money(theirs.dollars[1]))} charged by your provider for ${pay.model}, not by Folio. Reckoned from what Folio’s own models were measured to cost, at this model’s prices for what is sent and what is written; not measured on it.`;
  return theirs.missing ? [figure, `Not in the figure: the reading of each plan by ${pay.reader || 'the reviewing model'}, whose price is not known.`] : [figure];
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
  const theirs = keyDollars(e, { write: pay.prices.write, sol: pay.prices.write, check: pay.prices.check });
  return theirs ? `about ${span(money(theirs.dollars[0]), money(theirs.dollars[1]))}${theirs.missing ? ', and more' : ''}` : 'cost not known';
}
