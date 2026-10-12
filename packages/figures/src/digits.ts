import { GLYPH_OUTLINES } from './glyphs';

/**
 * Numerals as outlines of the app's own typeface (glyphs.ts), filled: a frame is the same picture in a browser, in a
 * PNG painted without one, and in print, with no font to be missing. They were strokes in the manner of a
 * seven-segment stamp, which could not be told from a display's and whose "1" was a bar.
 */

/** The height of a capital, and of every digit, in the units numbers are laid out in. */
export const GLYPH_HEIGHT = 6;

type Pt = [number, number];

/** A number's outlines, each a closed run of points [u, v] (v upward), in a box `width` wide and six high with its corner at the origin. */
export function outlineOf(text: string): { polygons: Pt[][]; width: number } {
  const polygons: Pt[][] = [];
  let at = 0;
  for (const ch of text) {
    const glyph = GLYPH_OUTLINES[ch];
    // Never passed over: a label missing a character would be another number.
    if (!glyph) throw new Error(`figure: no outline for "${ch}"`);
    for (const run of glyph.contours) polygons.push(run.map(([u, v]): Pt => [at + u * GLYPH_HEIGHT, v * GLYPH_HEIGHT]));
    at += glyph.advance * GLYPH_HEIGHT;
  }
  return { polygons, width: at };
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

/**
 * Whether the cabinet's small labels are too small for these numbers to be read on a slide: more than three
 * characters on a label, or more than ten drawers. The cabinet still draws them, and correctly; a teacher is told,
 * and offered the row of numbers, which gives long numbers wide cells.
 */
export function cabinetCramped(values: readonly number[], target: number): boolean {
  return values.length > 10 || [...values, target].some((n) => (numeralOf(n) ?? '').length > 3);
}
