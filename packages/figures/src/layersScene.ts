import type { LayerLook, LayerTint, SlideVisual } from '@folio/core';
import { d, fillOf, FLAT, stroke } from './flatScene';
import { GLYPH_OUTLINES } from './glyphs';

/**
 * A thing made of layers, drawn as an exploded technical drawing: square plates in a column, seen from above at the
 * isometric angle, top layer first, each face drawn plain, hatched, gridded, dotted, as a row of small bars or as a grid
 * with a dot at each crossing, and each named beside it with a leader line. Put together, the plates close up into one
 * block and the names spread out along the side.
 *
 * Every mark is a path of straight lines with its fill, stroke and width written on it, and the names are outlines of
 * the app's own typeface: the slide, the SVG a teacher downloads and the PNG in a deck or a Word file are one drawing,
 * with no font to be missing.
 */

type Layers = Extract<SlideVisual, { kind: 'layers' }>;
type P = [number, number];
type P3 = [number, number, number];

/** The side of a plate, its thickness, and how far apart the plates stand when drawn apart. */
const SIDE = 100;
const THICK = 4;
const APART = 62;
/** Where a face's pattern stays clear of its edge. */
const INSET = 9;
const COS = Math.cos(Math.PI / 6);
const SIN = Math.sin(Math.PI / 6);
/** The height of a name's letters, the gap between them, and the room a name takes from the next. */
const CAP = 8;
const TRACK = 0.9;
const ROW = 21;
const LINE = 0.9;
const FINE = 0.45;

/** A tint's line colour, and the pale colour of a face it fills. */
export const TINTS: Record<LayerTint, { line: string; face: string }> = {
  none: { line: FLAT.ink, face: '#ffffff' },
  blue: { line: '#3a63c9', face: '#dfe7fa' },
  green: { line: '#2e8f4e', face: '#dbf0e1' },
  red: { line: '#c94040', face: '#f8dede' },
  amber: { line: '#b07a0e', face: '#f6ebd2' },
  violet: { line: '#6d4fbf', face: '#e9e2f7' },
  gray: { line: '#606067', face: '#ececee' },
};

const project = ([x, y, z]: P3): P => [(x - y) * COS, (x + y) * SIN - z];

/** A face of the plate at height z, as plate coordinates turned into the picture's. */
const top = (z: number, pts: P[]): P[] => pts.map(([x, y]) => project([x, y, z]));

/** Where a row of bars stands on a plate: three bars, each colour set a little over so red, green and blue interleave. */
const STRIP_X = [16, 44, 72];
const STRIP_Y: P = [18, 82];
const STRIP_W = 8;
const stripShift = (tint: { line: string }): number => ({ [TINTS.red.line]: 0, [TINTS.green.line]: 9, [TINTS.blue.line]: 18 })[tint.line] ?? 0;

const steps = (a: number, b: number, n: number): number[] => Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));

/** A small block standing on a face: the bars of a filter, drawn as boxes. */
function bar(x: number, y: number, z: number, w: number, h: number, tint: { line: string; face: string }): string {
  const t = 2.2;
  const box = (pts: [number, number][], zz: number) => top(zz, pts);
  const lid = box([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], z + t);
  const front = [...top(z, [[x, y + h], [x + w, y + h]]), ...top(z + t, [[x + w, y + h], [x, y + h]])];
  const side = [...top(z, [[x + w, y], [x + w, y + h]]), ...top(z + t, [[x + w, y + h], [x + w, y]])];
  return [front, side].map((f) => fillOf(d(f, true), tint.line)).join('') + fillOf(d(lid, true), tint.face) + stroke(d(lid, true), tint.line, FINE + 0.2);
}

/** What is drawn on a plate's face, or in place of the plate for a row of bars. */
function face(look: LayerLook, z: number, tint: { line: string; face: string }): string {
  const a = INSET;
  const b = SIDE - INSET;
  const line = tint.line === FLAT.ink ? FLAT.soft : tint.line;
  // Lines along one edge, as a polarizer's grain runs.
  if (look === 'hatch') return steps(a, b, 13).map((x) => stroke(d(top(z, [[x, a], [x, b]])), line, FINE)).join('');
  if (look === 'grid' || look === 'cells') {
    const n = look === 'grid' ? 9 : 6;
    const at = steps(a, b, n);
    const lines = at.flatMap((v): [P, P][] => [[[v, a], [v, b]], [[a, v], [b, v]]]).map(([p, q]) => stroke(d(top(z, [p, q])), line, look === 'grid' ? FINE + 0.3 : FINE)).join('');
    if (look === 'grid') return lines;
    const dot = (x: number, y: number) => fillOf(d(top(z, [[x - 1.6, y - 1.6], [x + 1.6, y - 1.6], [x + 1.6, y + 1.6], [x - 1.6, y + 1.6]]), true), FLAT.ink);
    const mid = at.slice(0, -1).map((v, i) => (v + at[i + 1]!) / 2);
    return lines + mid.flatMap((x) => mid.map((y) => dot(x, y))).join('');
  }
  if (look === 'dots') {
    const at = steps(a, b, 10);
    const dot = (x: number, y: number) => fillOf(d(top(z, [[x - 0.7, y - 0.7], [x + 0.7, y - 0.7], [x + 0.7, y + 0.7], [x - 0.7, y + 0.7]]), true), line);
    return at.flatMap((x) => at.map((y) => dot(x, y))).join('');
  }
  if (look === 'strips') {
    // Three long bars along the plate's depth, as a display's colour filters stand; each colour a step over from the last.
    return STRIP_X.map((x) => bar(x + stripShift(tint), STRIP_Y[0], z, STRIP_W, STRIP_Y[1] - STRIP_Y[0], tint)).join('');
  }
  return '';
}

/** One plate at height z: its two near sides, its top, and what is drawn on the top. A row of bars has no plate. */
function plate(look: LayerLook, z: number, tintName: LayerTint): string {
  const tint = TINTS[tintName];
  if (look === 'strips') return face(look, z, tint);
  const lid = top(z + THICK, [[0, 0], [SIDE, 0], [SIDE, SIDE], [0, SIDE]]);
  const front = [project([0, SIDE, z]), project([SIDE, SIDE, z]), project([SIDE, SIDE, z + THICK]), project([0, SIDE, z + THICK])];
  const side = [project([SIDE, 0, z]), project([SIDE, SIDE, z]), project([SIDE, SIDE, z + THICK]), project([SIDE, 0, z + THICK])];
  const edge = tint.line;
  return [
    fillOf(d(front, true), tintName === 'none' ? '#e4e4e1' : tint.face),
    stroke(d(front, true), edge, LINE),
    fillOf(d(side, true), tintName === 'none' ? '#d6d6d2' : tint.face),
    stroke(d(side, true), edge, LINE),
    fillOf(d(lid, true), tint.face),
    face(look, z + THICK, tint),
    stroke(d(lid, true), edge, LINE),
  ].join('');
}

/** Subscript digits (CO₂, CuCl₂) as small digits set low. */
const SUB = '₀₁₂₃₄₅₆₇₈₉';

/** A name in the app's typeface, as written, with its width: a character with no outline leaves a space. */
export function lettered(name: string): { polygons: P[][]; width: number } {
  const polygons: P[][] = [];
  let at = 0;
  for (const raw of name) {
    const sub = SUB.indexOf(raw);
    const ch = sub >= 0 ? String(sub) : raw;
    const glyph = GLYPH_OUTLINES[ch] ?? GLYPH_OUTLINES[ch.toLowerCase()] ?? GLYPH_OUTLINES[' ']!;
    const size = sub >= 0 ? CAP * 0.62 : CAP;
    const drop = sub >= 0 ? CAP * 0.22 : 0;
    for (const run of glyph.contours) polygons.push(run.map(([u, v]): P => [at + u * size, -v * size + drop]));
    at += glyph.advance * size + TRACK;
  }
  return { polygons, width: Math.max(0, at - TRACK) };
}

/** A name set with its baseline at (x, y): to the right of x, or ending at x. */
export function nameAt(name: string, x: number, y: number, right: boolean): string {
  const { polygons, width } = lettered(name);
  const left = right ? x : x - width;
  const path = polygons.map((poly) => d(poly.map(([u, v]): P => [left + u, y + v]), true)).join('');
  return path ? fillOf(path, FLAT.ink) : '';
}

export interface LayersPicture {
  svg: string;
  width: number;
  height: number;
}

/** The parts' heights: the top part highest. Apart, a plate's gap; together, the plates touch. */
const heights = (v: Layers): number[] => v.parts.map((_, i) => (v.parts.length - 1 - i) * (v.open ? APART : THICK));

/** The drawing as an SVG document, with its measure. */
export function layersSvg(v: Layers): LayersPicture {
  const z = heights(v);
  // Drawn from the bottom up, so a higher plate covers the one under it.
  const body = v.parts.map((p, i) => ({ p, i })).reverse().map(({ p, i }) => plate(p.look, z[i]!, p.tint)).join('');
  // A name beside each part: the nearer corners of its plate, left and right in turn, out to a column of names.
  const corner = (i: number, right: boolean): P => {
    if (v.parts[i]!.look !== 'strips') return project(right ? [SIDE, 0, z[i]! + THICK / 2] : [0, SIDE, z[i]! + THICK / 2]);
    const shift = stripShift(TINTS[v.parts[i]!.tint]);
    return project(right ? [STRIP_X.at(-1)! + STRIP_W + shift, STRIP_Y[0], z[i]! + 1] : [STRIP_X[0]! + shift, STRIP_Y[1], z[i]! + 1]);
  };
  const marks: string[] = [];
  const reach = 40;
  const rightX = project([SIDE, 0, 0])[0] + reach;
  const leftX = project([0, SIDE, 0])[0] - reach;
  // Each side's names keep at least a row apart; together, the stack is too short for that, and they spread.
  const sides: Record<'left' | 'right', number[]> = { left: [], right: [] };
  v.parts.forEach((_, i) => sides[i % 2 === 0 ? 'right' : 'left'].push(i));
  const rows = new Map<number, number>();
  for (const key of ['left', 'right'] as const) {
    let last = -Infinity;
    for (const i of sides[key]) {
      const y = Math.max(corner(i, key === 'right')[1], last + ROW);
      rows.set(i, y);
      last = y;
    }
  }
  if (v.labels)
    v.parts.forEach((p, i) => {
      const right = i % 2 === 0;
      const [cx, cy] = corner(i, right);
      const y = rows.get(i)!;
      const end = right ? rightX : leftX;
      const elbow: P = [right ? cx + 10 : cx - 10, y];
      marks.push(stroke(d([[cx, cy], elbow, [end, y]]), FLAT.soft, FINE + 0.15));
      marks.push(fillOf(d([[cx - 1.1, cy - 1.1], [cx + 1.1, cy - 1.1], [cx + 1.1, cy + 1.1], [cx - 1.1, cy + 1.1]], true), FLAT.ink));
      marks.push(nameAt(p.name.trim() || `part ${i + 1}`, right ? end + 5 : end - 5, y + CAP / 2, right));
    });
  // The measure: the plates, the bars on them, and the names.
  const widest = Math.max(0, ...v.parts.map((p) => lettered(p.name.trim() || 'part 00').width));
  const xs = [project([0, SIDE, 0])[0], project([SIDE, 0, 0])[0], ...(v.labels ? [leftX - 5 - widest, rightX + 5 + widest] : [])];
  const tops = [project([0, 0, z[0]! + THICK + 3])[1], ...(v.labels ? [...rows.values()].map((y) => y - CAP) : [])];
  const bottoms = [project([SIDE, SIDE, 0])[1], ...(v.labels ? [...rows.values()].map((y) => y + CAP) : [])];
  const pad = 14;
  const x0 = Math.min(...xs) - pad;
  const y0 = Math.min(...tops) - pad;
  const width = Math.ceil(Math.max(...xs) + pad - x0);
  const height = Math.ceil(Math.max(...bottoms) + pad - y0);
  // The painter for PNGs reads only straight paths in absolute numbers: the offset is applied to the numbers themselves.
  const moved = (svg: string) => svg.replace(/d="([^"]*)"/g, (_, path: string) => `d="${path.replace(/(-?[\d.]+) (-?[\d.]+)/g, (__, x: string, y: string) => `${Math.round((Number(x) - x0) * 10) / 10} ${Math.round((Number(y) - y0) * 10) / 10}`)}"`);
  const names = v.parts.map((p) => p.name.trim()).filter(Boolean).join(', ');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width * 3}" height="${height * 3}" role="img" aria-label="${escape(`An exploded drawing of its layers, top to bottom: ${names}`)}"><rect width="${width}" height="${height}" fill="${FLAT.page}"/>${moved(body + marks.join(''))}</svg>`;
  return { svg, width, height };
}

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}
