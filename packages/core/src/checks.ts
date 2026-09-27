import type { Flag } from './flags';

/**
 * Deterministic checks run on generated content before it is committed.
 * Each returns flags (codes, not sentences); an empty list means the item passed.
 */

export interface DraftQuestion {
  format: 'choice' | 'truefalse' | 'short' | 'numeric';
  prompt: string;
  choices: string[];
  answer: string;
  /** For arithmetic questions: an expression whose value is the answer. */
  expression?: string | null;
}

const norm = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ');

export function checkQuestion(q: DraftQuestion): Flag[] {
  const problems: Flag[] = [];
  if (!q.prompt.trim()) problems.push({ code: 'noPrompt' });
  if (q.format === 'choice' || q.format === 'truefalse') {
    const choices = q.choices.map(norm);
    if (q.format === 'choice' && choices.length < 3) problems.push({ code: 'tooFewChoices' });
    if (q.format === 'truefalse' && choices.length !== 2) problems.push({ code: 'trueFalseChoices' });
    if (choices.some((c) => !c)) problems.push({ code: 'emptyChoice' });
    if (new Set(choices).size !== choices.length) problems.push({ code: 'duplicateChoices' });
    if (!choices.includes(norm(q.answer))) problems.push({ code: 'answerNotInChoices' });
  } else if (!q.answer.trim()) {
    problems.push({ code: 'noModelAnswer' });
  }
  if (q.format === 'numeric') problems.push(...checkNumeric(q));
  return problems;
}

/**
 * The right answer gives itself away by length: clearly longer than every
 * wrong choice. Test-wise students pick the longest option; models tend to
 * write the right one with more care, so it is.
 */
export function answerStandsOut(q: DraftQuestion): boolean {
  if (q.format !== 'choice' || q.choices.length < 3) return false;
  const right = q.choices.find((c) => norm(c) === norm(q.answer));
  if (right === undefined) return false;
  const others = q.choices.filter((c) => c !== right).map((c) => c.trim().length);
  const longest = Math.max(...others);
  const mean = others.reduce((a, b) => a + b, 0) / others.length;
  const length = right.trim().length;
  return length > longest * 1.15 && length >= mean * 1.3;
}

function checkNumeric(q: DraftQuestion): Flag[] {
  const stated = parseNumber(q.answer);
  if (stated === null) return [{ code: 'answerNotNumber' }];
  if (!q.expression) return [];
  const computed = evaluate(q.expression);
  if (computed === null) return [];
  const tolerance = Math.max(1e-6, Math.abs(computed) * 0.005);
  if (Math.abs(computed - stated) > tolerance) {
    return [{ code: 'answerMismatch', values: { stated: q.answer.trim(), computed: round(computed) } }];
  }
  return [];
}

function round(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000);
}

export function parseNumber(value: string): number | null {
  const match = value.replace(/,/g, '').match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/i);
  if (!match) return null;
  const n = Number(match[0]);
  if (!Number.isFinite(n)) return null;
  return n;
}

/** Duplicate prompts within one batch, by normalised text. */
export function duplicatePrompts(prompts: string[]): string[] {
  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const p of prompts) {
    const key = norm(p);
    if (seen.has(key)) dupes.push(p);
    seen.add(key);
  }
  return dupes;
}

export function checkMinutes(segmentMinutes: number[], target: number): Flag[] {
  const total = segmentMinutes.reduce((a, b) => a + b, 0);
  const slack = Math.max(3, Math.round(target * 0.1));
  if (Math.abs(total - target) > slack) {
    return [{ code: 'minutesMismatch', values: { total, target } }];
  }
  return [];
}

/**
 * A tiny arithmetic evaluator: numbers, + - * / ^, parentheses, sqrt().
 * Returns null for anything it does not understand.
 */
export function evaluate(expression: string): number | null {
  const tokens = expression.replace(/×/g, '*').replace(/÷/g, '/').match(/\d+(?:\.\d+)?|sqrt|[()+\-*/^]|\S/g);
  if (!tokens) return null;
  let pos = 0;
  const peek = (): string | undefined => tokens[pos];
  const next = (): string | undefined => tokens[pos++];

  function primary(): number {
    const t = next();
    if (t === undefined) throw new Error('end');
    if (t === '(') {
      const v = sum();
      if (next() !== ')') throw new Error('paren');
      return v;
    }
    if (t === '-') return -primary();
    if (t === 'sqrt') return Math.sqrt(primary());
    const n = Number(t);
    if (Number.isNaN(n)) throw new Error('token');
    return n;
  }
  function power(): number {
    const base = primary();
    if (peek() === '^') {
      next();
      return base ** power();
    }
    return base;
  }
  function product(): number {
    let v = power();
    while (peek() === '*' || peek() === '/') v = next() === '*' ? v * power() : v / power();
    return v;
  }
  function sum(): number {
    let v = product();
    while (peek() === '+' || peek() === '-') v = next() === '+' ? v + product() : v - product();
    return v;
  }

  try {
    const value = sum();
    return pos === tokens.length && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}
