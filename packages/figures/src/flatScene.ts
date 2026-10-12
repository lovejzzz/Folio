import { numeral, strokesOf, GLYPH_HEIGHT } from './digits';
import type { Scene } from './binarySearchScene';

/**
 * Binary search as a flat row of numbers: the same poses as the cabinet, drawn for a projector and a printed page.
 * Each number stands in a large cell with its position under it. What is still in play is bracketed; what is set
 * aside is hatched and drawn thin (a line through it would read as a stroke of its numeral); the one being compared has a heavy frame, an arrow over it and the comparison
 * written above ("42 > 23"); a number found is filled. No state is told by colour alone, and nothing glows: the one
 * accent colour is only on what is being looked at now, which is the rule this look takes from the iso-glow skill
 * (isoglow.dev; no code of it is used here). Lines are two units and more, numerals a cell high.
 *
 * Every mark is a path of straight lines with its own fill, stroke and width written on it, so the page that shows it
 * live, the SVG in a print and the PNG painted without a browser are one drawing.
 */
export const FLAT = { ink: '#18181a', soft: '#8a8a8f', rule: '#c9c9cc', paper: '#ffffff', page: '#fbfbfa', accent: '#2b46c4' };
const W = 640;
// A row needs less height than the cabinet: drawn in a shorter frame, it is half again as wide in the same slide.
const H = 250;
/** The flat figure's own measure. */
export const FLAT_VIEW = { width: W, height: H };

type P = [number, number];
const d = (points: P[], closed = false) => points.map(([x, y], i) => `${i ? 'L' : 'M'}${Math.round(x * 10) / 10} ${Math.round(y * 10) / 10}`).join('') + (closed ? 'Z' : '');
const stroke = (path: string, color: string, width: number) => (path ? `<path class="flat" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" d="${path}"/>` : '');
const fillOf = (path: string, color: string) => `<path class="flat" fill="${color}" stroke="none" d="${path}"/>`;
const rect = (x: number, y: number, w: number, h: number): P[] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

/** A number in strokes, centred in a box: its height is the box's or less, its lines `weight` wide. */
function written(text: string, box: { x: number; y: number; w: number; h: number }, color: string, weight: number): string {
  const { strokes, width } = strokesOf(text);
  if (!width) return '';
  const s = Math.min(box.w / width, box.h / GLYPH_HEIGHT);
  const left = box.x + (box.w - width * s) / 2;
  const base = box.y + (box.h + GLYPH_HEIGHT * s) / 2;
  return stroke(strokes.map(([[u0, v0], [u1, v1]]) => d([[left + u0 * s, base - v0 * s], [left + u1 * s, base - v1 * s]])).join(''), color, weight);
}

interface Row {
  x0: number;
  cell: number;
  y: number;
  h: number;
}

function rowOf(count: number): Row {
  const cell = Math.min(72, (W - 150) / Math.max(count, 1));
  return { x0: (W - 110 - cell * Math.max(count, 1)) / 2 + 8, cell, y: 104, h: Math.min(84, cell * 1.25) };
}

/** Diagonal lines across a cell: set aside, told by line and not by shade. */
function hatch(x: number, y: number, w: number, h: number): string {
  const lines: string[] = [];
  for (let t = -h + 8; t < w; t += 9) lines.push(d([[Math.max(x, x + t), y + Math.max(0, -t)], [Math.min(x + w, x + t + h), y + Math.min(h, w - t)]]));
  return stroke(lines.join(''), FLAT.rule, 1.2);
}

function cellOf(i: number, value: number, state: string, row: Row): string {
  const x = row.x0 + i * row.cell + 3;
  const w = row.cell - 6;
  const box = d(rect(x, row.y, w, row.h), true);
  const inner = { x: x + w * 0.14, y: row.y + row.h * 0.22, w: w * 0.72, h: row.h * 0.56 };
  const place = written(String(i + 1), { x, y: row.y + row.h + 8, w, h: 12 }, FLAT.soft, 1.3);
  if (state === 'found') return fillOf(box, FLAT.accent) + stroke(box, FLAT.accent, 3) + written(numeral(value), inner, FLAT.paper, 3.2) + place;
  if (state === 'aside') return fillOf(box, FLAT.page) + hatch(x, row.y, w, row.h) + stroke(box, FLAT.rule, 1.6) + written(numeral(value), inner, FLAT.soft, 1.8) + place;
  const look = state === 'look';
  return fillOf(box, FLAT.paper) + stroke(box, look ? FLAT.accent : FLAT.ink, look ? 4 : 2) + written(numeral(value), inner, FLAT.ink, look ? 3.2 : 2.6) + place;
}

/** A square bracket under the cells still in play, from the left edge of `lo` to the right edge of `hi - 1`. */
function bracket(lo: number, hi: number, row: Row): string {
  if (hi - lo < 0.02) return '';
  const y = row.y + row.h + 30;
  const a = row.x0 + lo * row.cell + 3;
  const b = row.x0 + hi * row.cell - 3;
  return stroke(d([[a, y - 8], [a, y], [b, y], [b, y - 8]]), FLAT.ink, 2.6);
}

/** Over the number being compared: an arrow, and the comparison written out with its sign. */
function pointer(scene: Scene, row: Row): string {
  const weight = scene.pose.pull.reduce((n, p) => n + p, 0);
  if (weight < 0.02) return '';
  const at = scene.pose.pull.reduce((n, p, i) => n + p * i, 0) / weight;
  const x = row.x0 + (at + 0.5) * row.cell;
  const top = row.y - 34;
  const arrow = stroke(d([[x, top], [x, row.y - 8]]), FLAT.accent, 3) + fillOf(d([[x - 7, row.y - 16], [x + 7, row.y - 16], [x, row.y - 5]], true), FLAT.accent);
  const mid = Math.round(at);
  const value = scene.values[mid];
  if (value === undefined || weight < 0.98) return arrow;
  const sign = scene.target === value ? '=' : scene.target < value ? '<' : '>';
  return arrow + written(`${numeral(scene.target)} ${sign} ${numeral(value)}`, { x: Math.max(10, Math.min(W - 250, x - 120)), y: top - 44, w: 240, h: 30 }, FLAT.accent, 3);
}

/** The number looked for, in a frame of its own at the right, with a magnifier's ring over it in place of a word. */
function sought(scene: Scene): string {
  const x = W - 96;
  const y = 104;
  const box = d(rect(x, y, 78, 84), true);
  const ring = Array.from({ length: 17 }, (_, i): P => [x + 39 + 9 * Math.cos((i / 16) * Math.PI * 2), y - 22 + 9 * Math.sin((i / 16) * Math.PI * 2)]);
  return fillOf(box, FLAT.paper) + stroke(box, FLAT.ink, 2) + stroke(d(rect(x + 5, y + 5, 68, 74), true), FLAT.ink, 1.2) + written(numeral(scene.target), { x: x + 12, y: y + 20, w: 54, h: 44 }, FLAT.ink, 3) + stroke(d(ring), FLAT.ink, 2.2) + stroke(d([[x + 46, y - 15], [x + 54, y - 6]]), FLAT.ink, 2.6);
}

/** The whole flat figure as the inside of an SVG. */
export function flatBody(scene: Scene): string {
  const row = rowOf(scene.values.length);
  // Each cell says its place and its state in the markup too: what a test, or a reader of the page's source, goes by.
  const cells = scene.values.map((v, i) => `<g data-drawer="${i}" data-state="${scene.pose.state[i] ?? 'play'}">${cellOf(i, v, scene.pose.state[i] ?? 'play', row)}</g>`);
  // An empty list is an empty frame: there is nothing to compare, and the figure says so by having nothing in it.
  const empty = scene.values.length ? '' : stroke(d(rect(row.x0 + 3, row.y, row.cell - 6, row.h), true), FLAT.rule, 2);
  return [fillOf(d(rect(0, 0, W, H), true), FLAT.page), empty, ...cells, bracket(scene.pose.lo, scene.pose.hi, row), pointer(scene, row), sought(scene)].join('');
}

/** A frame of the flat figure as a picture of its own: every colour and width is on its marks, so it needs no stylesheet. */
export function flatSvg(scene: Scene, label: string): string {
  const escaped = label.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escaped}">${flatBody(scene)}</svg>`;
}
