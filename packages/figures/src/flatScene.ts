import { numeral, strokesOf, GLYPH_HEIGHT } from './digits';
import type { Scene } from './binarySearchScene';

/**
 * Binary search as a flat row of numbers: the same poses as the cabinet, drawn for a projector and a printed page.
 * Each number stands in a large cell with its position under it. What is still in play is bracketed; what is set
 * aside is hatched and drawn thin (a line through it would read as a stroke of its numeral); the one being compared
 * has a heavy frame, an arrow over it and the comparison written above ("42 > 23"); a number found is filled. No
 * state is told by colour alone, and nothing glows: the one accent colour is only on what is being looked at now,
 * which is the rule this look takes from the iso-glow skill (isoglow.dev; no code of it is used here).
 *
 * Every mark is a path of straight lines with its own fill, stroke and width written on it, so the page that shows it
 * live, the SVG in a print and the PNG painted without a browser are one drawing.
 *
 * One size of numeral for the whole figure, and a line as heavy as that size bears. Fifteen numbers in one row, some
 * of them "-2.5" and "1.25", were each shrunk to its own cell and drawn with the line of a large numeral: black
 * lumps, on a desk, a phone and a deck alike. The numerals of a figure are now all the size its longest number allows,
 * their lines a fixed part of that size, and where one row would bring that size under what reads, the numbers go on
 * two rows (or three), in order, each row with its own positions and its own piece of the bracket.
 */
export const FLAT = { ink: '#18181a', soft: '#8a8a8f', rule: '#c9c9cc', paper: '#ffffff', page: '#fbfbfa', accent: '#2b46c4' };
const W = 640;
/** The cells' share of the width; the number looked for stands to their right. */
const CELLS = W - 150;
/** A numeral's unit: its height is six of these. Under this a numeral in a 640-wide picture does not read. */
const MIN_UNIT = 2.6;
const MAX_UNIT = 6.2;
/** The share of a cell's width its numeral may take. */
const INNER = 0.86;

type P = [number, number];
const d = (points: P[], closed = false) => points.map(([x, y], i) => `${i ? 'L' : 'M'}${Math.round(x * 10) / 10} ${Math.round(y * 10) / 10}`).join('') + (closed ? 'Z' : '');
const stroke = (path: string, color: string, width: number) => (path ? `<path class="flat" fill="none" stroke="${color}" stroke-width="${Math.round(width * 100) / 100}" stroke-linecap="round" stroke-linejoin="round" d="${path}"/>` : '');
const fillOf = (path: string, color: string) => `<path class="flat" fill="${color}" stroke="none" d="${path}"/>`;
const rect = (x: number, y: number, w: number, h: number): P[] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

/** How heavy a numeral's line may be at a unit: about a seventh of the numeral's width, so its counters stay open. */
export const lineFor = (unit: number, share = 1): number => Math.max(0.9, Math.min(3.4, unit * 0.56) * share);

/** A number in strokes at a given unit, centred in a box, its line as heavy as the unit bears. */
function written(text: string, box: { x: number; y: number; w: number; h: number }, color: string, unit: number, share = 1): string {
  const { strokes, width } = strokesOf(text);
  if (!width) return '';
  const s = Math.min(unit, box.w / width, box.h / GLYPH_HEIGHT);
  const left = box.x + (box.w - width * s) / 2;
  const base = box.y + (box.h + GLYPH_HEIGHT * s) / 2;
  return stroke(strokes.map(([[u0, v0], [u1, v1]]) => d([[left + u0 * s, base - v0 * s], [left + u1 * s, base - v1 * s]])).join(''), color, lineFor(s, share));
}

/** Where everything stands: how many rows, the cell, the one unit of every numeral in the cells, the picture's height. */
export interface Grid {
  rows: number;
  perRow: number;
  cell: number;
  h: number;
  unit: number;
  /** The top of row `r`'s cells. */
  top: (r: number) => number;
  x: (i: number) => number;
  height: number;
}

const ROW_HEAD = 66;
const ROW_FOOT = 44;

/** The grid for these numbers: as few rows as keep the longest number at a size that reads. */
export function gridOf(values: readonly number[]): Grid {
  const count = Math.max(values.length, 1);
  const widest = Math.max(4, ...values.map((v) => strokesOf(numeral(v)).width));
  // A cell is as wide as its row allows, up to what the longest number needs at the largest size: long numbers get wide cells.
  const widestCell = Math.max(60, Math.min(118, (widest * MAX_UNIT) / INNER + 6));
  const cellAt = (perRow: number) => Math.min(widestCell, CELLS / perRow);
  // Never nearer than four units to the cell's frame on either side.
  const unitAt = (perRow: number) => Math.min(MAX_UNIT, Math.min((cellAt(perRow) - 6) * INNER, cellAt(perRow) - 14) / widest);
  let rows = 1;
  while (rows < 3 && unitAt(Math.ceil(count / rows)) < MIN_UNIT) rows += 1;
  const perRow = Math.ceil(count / rows);
  const cell = cellAt(perRow);
  const unit = unitAt(perRow);
  const h = Math.max(34, Math.min(84, unit * GLYPH_HEIGHT / 0.56));
  const left = (CELLS - cell * perRow) / 2 + 14;
  return { rows, perRow, cell, h, unit, top: (r) => ROW_HEAD + r * (h + ROW_HEAD + ROW_FOOT), x: (i) => left + (i % perRow) * cell, height: rows * (h + ROW_HEAD + ROW_FOOT) + 6 };
}

/** The measure of the flat figure for these numbers: its width is fixed, its height follows its rows. */
export const flatView = (values: readonly number[]): { width: number; height: number } => ({ width: W, height: Math.round(gridOf(values).height) });

/** Diagonal lines across a cell: set aside, told by line and not by shade. */
function hatch(x: number, y: number, w: number, h: number): string {
  const lines: string[] = [];
  for (let t = -h + 8; t < w; t += 9) lines.push(d([[Math.max(x, x + t), y + Math.max(0, -t)], [Math.min(x + w, x + t + h), y + Math.min(h, w - t)]]));
  return stroke(lines.join(''), FLAT.rule, 1.2);
}

function cellOf(i: number, value: number, state: string, g: Grid): string {
  const x = g.x(i) + 3;
  const y = g.top(Math.floor(i / g.perRow));
  const w = g.cell - 6;
  const box = d(rect(x, y, w, g.h), true);
  const room = Math.min(w * INNER, w - 8);
  const inner = { x: x + (w - room) / 2, y: y + g.h * 0.18, w: room, h: g.h * 0.64 };
  const place = written(String(i + 1), { x, y: y + g.h + 7, w, h: 13 }, FLAT.soft, 2.1);
  if (state === 'found') return fillOf(box, FLAT.accent) + stroke(box, FLAT.accent, 3) + written(numeral(value), inner, FLAT.paper, g.unit) + place;
  if (state === 'aside') return fillOf(box, FLAT.page) + hatch(x, y, w, g.h) + stroke(box, FLAT.rule, 1.6) + written(numeral(value), inner, FLAT.soft, g.unit, 0.6) + place;
  const look = state === 'look';
  return fillOf(box, FLAT.paper) + stroke(box, look ? FLAT.accent : FLAT.ink, look ? 4 : 2) + written(numeral(value), inner, FLAT.ink, g.unit, look ? 1 : 0.85) + place;
}

/** A square bracket under the cells still in play, a piece under each row it reaches. */
function bracket(lo: number, hi: number, g: Grid): string {
  if (hi - lo < 0.02) return '';
  const pieces: string[] = [];
  for (let r = 0; r < g.rows; r++) {
    const from = Math.max(lo, r * g.perRow);
    const to = Math.min(hi, (r + 1) * g.perRow);
    if (to - from < 0.02) continue;
    const y = g.top(r) + g.h + 32;
    const left = g.x(r * g.perRow);
    const a = left + (from - r * g.perRow) * g.cell + 3;
    const b = left + (to - r * g.perRow) * g.cell - 3;
    // An end that is the range's own end is closed; one where the range runs on to the next row is left open.
    pieces.push(d([...(from === lo ? [[a, y - 8] as P] : []), [a, y], [b, y], ...(to === hi ? [[b, y - 8] as P] : [])]));
  }
  return stroke(pieces.join(''), FLAT.ink, 2.6);
}

/** Over the number being compared: an arrow, and the comparison written out with its sign. */
function pointer(scene: Scene, g: Grid): string {
  const weight = scene.pose.pull.reduce((n, p) => n + p, 0);
  if (weight < 0.02) return '';
  const centre = (i: number): P => [g.x(i) + g.cell / 2, g.top(Math.floor(i / g.perRow))];
  const [x, y] = scene.pose.pull.reduce<P>((at, p, i) => [at[0] + (p * centre(i)[0]) / weight, at[1] + (p * centre(i)[1]) / weight], [0, 0]);
  const top = y - 30;
  const arrow = stroke(d([[x, top], [x, y - 8]]), FLAT.accent, 3) + fillOf(d([[x - 7, y - 16], [x + 7, y - 16], [x, y - 5]], true), FLAT.accent);
  const mid = scene.pose.pull.findIndex((p) => p > 0.98);
  const value = scene.values[mid];
  if (value === undefined) return arrow;
  const sign = scene.target === value ? '=' : scene.target < value ? '<' : '>';
  return arrow + written(`${numeral(scene.target)} ${sign} ${numeral(value)}`, { x: Math.max(8, Math.min(CELLS - 190, x - 110)), y: top - 30, w: 220, h: 26 }, FLAT.accent, 4.2);
}

/** The number looked for, in a frame of its own at the right, with a magnifier's ring over it in place of a word. */
function sought(scene: Scene, g: Grid): string {
  const x = W - 100;
  const y = g.top(0);
  const box = d(rect(x, y, 84, 84), true);
  const ring = Array.from({ length: 17 }, (_, i): P => [x + 42 + 9 * Math.cos((i / 16) * Math.PI * 2), y - 22 + 9 * Math.sin((i / 16) * Math.PI * 2)]);
  return fillOf(box, FLAT.paper) + stroke(box, FLAT.ink, 2) + stroke(d(rect(x + 5, y + 5, 74, 74), true), FLAT.ink, 1.2) + written(numeral(scene.target), { x: x + 11, y: y + 16, w: 62, h: 52 }, FLAT.ink, MAX_UNIT) + stroke(d(ring), FLAT.ink, 2.2) + stroke(d([[x + 49, y - 15], [x + 57, y - 6]]), FLAT.ink, 2.6);
}

/** The whole flat figure as the inside of an SVG. */
export function flatBody(scene: Scene): string {
  const g = gridOf(scene.values);
  // Each cell says its place and its state in the markup too: what a test, or a reader of the page's source, goes by.
  const cells = scene.values.map((v, i) => `<g data-drawer="${i}" data-state="${scene.pose.state[i] ?? 'play'}">${cellOf(i, v, scene.pose.state[i] ?? 'play', g)}</g>`);
  // An empty list is an empty frame: there is nothing to compare, and the figure says so by having nothing in it.
  const empty = scene.values.length ? '' : stroke(d(rect(g.x(0) + 3, g.top(0), g.cell - 6, g.h), true), FLAT.rule, 2);
  return [fillOf(d(rect(0, 0, W, g.height), true), FLAT.page), empty, ...cells, bracket(scene.pose.lo, scene.pose.hi, g), pointer(scene, g), sought(scene, g)].join('');
}

/** A frame of the flat figure as a picture of its own: every colour and width is on its marks, so it needs no stylesheet. */
export function flatSvg(scene: Scene, label: string): string {
  const escaped = label.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const view = flatView(scene.values);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${view.width} ${view.height}" role="img" aria-label="${escaped}">${flatBody(scene)}</svg>`;
}
