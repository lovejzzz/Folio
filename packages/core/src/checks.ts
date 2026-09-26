/**
 * Deterministic checks run on generated content before it is committed.
 * Each returns plain sentences; an empty list means the item passed.
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

export function checkQuestion(q: DraftQuestion): string[] {
  const problems: string[] = [];
  if (!q.prompt.trim()) problems.push('The question has no text.');
  if (q.format === 'choice' || q.format === 'truefalse') {
    const choices = q.choices.map(norm);
    if (q.format === 'choice' && choices.length < 3) problems.push('A multiple-choice question needs at least three choices.');
    if (q.format === 'truefalse' && choices.length !== 2) problems.push('A true/false question needs exactly two choices.');
    if (choices.some((c) => !c)) problems.push('One of the choices is empty.');
    if (new Set(choices).size !== choices.length) problems.push('Two of the choices are the same.');
    if (!choices.includes(norm(q.answer))) problems.push('The answer is not one of the choices.');
  } else if (!q.answer.trim()) {
    problems.push('The question has no model answer.');
  }
  if (q.format === 'numeric') problems.push(...checkNumeric(q));
  return problems;
}

function checkNumeric(q: DraftQuestion): string[] {
  const stated = parseNumber(q.answer);
  if (stated === null) return ['The answer to a numeric question is not a number.'];
  if (!q.expression) return [];
  const computed = evaluate(q.expression);
  if (computed === null) return [];
  const tolerance = Math.max(1e-6, Math.abs(computed) * 0.005);
  if (Math.abs(computed - stated) > tolerance) {
    return [`The stated answer (${q.answer.trim()}) does not match the working (${round(computed)}).`];
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

export function checkMinutes(segmentMinutes: number[], target: number): string[] {
  const total = segmentMinutes.reduce((a, b) => a + b, 0);
  const slack = Math.max(3, Math.round(target * 0.1));
  if (Math.abs(total - target) > slack) {
    return [`The segments add up to ${total} minutes, not ${target}.`];
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
