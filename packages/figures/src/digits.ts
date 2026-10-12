/**
 * Numerals as strokes, in the manner of a seven-segment stamp: the figure's numbers are drawn with the same lines
 * as its parts, so a frame is the same picture in a browser, in a PNG made without one, and in print, with no font
 * to be missing.
 */

type Seg = [number, number, number, number];
const A: Seg = [0, 6, 4, 6];
const B: Seg = [4, 6, 4, 3];
const C: Seg = [4, 3, 4, 0];
const D: Seg = [0, 0, 4, 0];
const E: Seg = [0, 0, 0, 3];
const F: Seg = [0, 3, 0, 6];
const G: Seg = [0, 3, 4, 3];

const GLYPHS: Record<string, { segs: Seg[]; width: number }> = {
  '0': { segs: [A, B, C, D, E, F], width: 4 },
  '1': { segs: [[2, 6, 2, 0]], width: 4 },
  '2': { segs: [A, B, G, E, D], width: 4 },
  '3': { segs: [A, B, G, C, D], width: 4 },
  '4': { segs: [F, G, B, C], width: 4 },
  '5': { segs: [A, F, G, C, D], width: 4 },
  '6': { segs: [A, F, G, E, D, C], width: 4 },
  '7': { segs: [A, B, C], width: 4 },
  '8': { segs: [A, B, C, D, E, F, G], width: 4 },
  '9': { segs: [A, B, C, D, F, G], width: 4 },
  '-': { segs: [[0.6, 3, 3.4, 3]], width: 4 },
  '.': { segs: [[0.5, 0, 0.5, 0.35]], width: 1 },
  // Signs of a comparison, for the line over the number being compared.
  '<': { segs: [[3.6, 5.2, 0.4, 3], [0.4, 3, 3.6, 0.8]], width: 4 },
  '>': { segs: [[0.4, 5.2, 3.6, 3], [3.6, 3, 0.4, 0.8]], width: 4 },
  '=': { segs: [[0.4, 4, 3.6, 4], [0.4, 2, 3.6, 2]], width: 4 },
  ' ': { segs: [], width: 2 },
};

const GAP = 1.6;
export const GLYPH_HEIGHT = 6;

/** The strokes of a number, each from [u, v] to [u, v], in a box `width` wide and six high, its corner at the origin. */
export function strokesOf(text: string): { strokes: [[number, number], [number, number]][]; width: number } {
  const strokes: [[number, number], [number, number]][] = [];
  let at = 0;
  for (const ch of text) {
    const glyph = GLYPHS[ch];
    // Never passed over: a label missing a character would be another number.
    if (!glyph) throw new Error(`figure: no stroke for "${ch}"`);
    for (const [u0, v0, u1, v1] of glyph.segs) strokes.push([[at + u0, v0], [at + u1, v1]]);
    at += glyph.width + GAP;
  }
  return { strokes, width: Math.max(0, at - GAP) };
}

/** The most characters a drawer's label holds at a size a class can read, and the most drawers the cabinet has. */
export const NUMERAL_MAX = 5;
export const DRAWERS_MAX = 15;

/**
 * A number exactly as a label writes it, or null when it cannot be written there in full: digits, a minus sign and a
 * decimal point, five characters at most. Nothing is rounded: a label that showed 0 for 0.00000001 beside a sentence
 * that said 1e-8 was the figure and its words disagreeing, which is the one thing they may not do.
 */
export function numeralOf(n: number): string | null {
  const text = String(Object.is(n, -0) ? 0 : n);
  return /^-?\d+(?:\.\d+)?$/.test(text) && text.length <= NUMERAL_MAX ? text : null;
}

export type CabinetLimit = 'tooMany' | 'tooLong';

/** Why the cabinet cannot be drawn for a list that can be searched, or null. The search itself is unaffected. */
export function cabinetLimit(values: readonly number[], target: number): CabinetLimit | null {
  if (values.length > DRAWERS_MAX) return 'tooMany';
  return [...values, target].every((n) => numeralOf(n) !== null) ? null : 'tooLong';
}

/** A number as a label writes it: exactly, or an error. The cabinet is drawn only for lists within `cabinetLimit`. */
export function numeral(value: number): string {
  const text = numeralOf(value);
  if (text === null) throw new Error(`figure: ${value} cannot be written on a label`);
  return text;
}
