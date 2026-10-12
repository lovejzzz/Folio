import { describePass, describeSortResult, describeSortStart, type SelectionSortModel } from '@folio/core';
import * as k from './vendor/anatomy/iso-kit';
import { numeralMark, stamped, standaloneSvg, VIEW, type View } from './binarySearchScene';
import { GLYPH_HEIGHT, numeral, numeralOf, outlineOf, type CabinetLimit } from './digits';
import { d, fillOf, FLAT, gridOf, stroke, written, type Grid } from './flatScene';

/**
 * Selection sort as one picture in two layers, by the method binary search was drawn with. Above, the object: a
 * block for each number, as tall as its number is large among the others, standing in a tray; the smallest of the
 * unsorted part is lifted, a marker on the tray's edge stands where the sorted part ends, and two blocks change
 * places by sliding. Below, the reading: the list as large numbers in their order at this pass, the sorted part
 * underlined, the rest bracketed, the smallest framed, and a line under the two that change places.
 */

export type SortState = 'rest' | 'sorted' | 'min' | 'place';

/** Where everything stands. Each number keeps the index it had in the list as given: `slot[i]` is where number `i` stands now. */
export interface SortPose {
  /** Where the unsorted part starts, as a place counted from 0. */
  from: number;
  slot: number[];
  /** How far each block is lifted, 0 to 1. */
  lift: number[];
  state: SortState[];
}

export interface SortKeyframe {
  kind: 'start' | 'step' | 'end';
  step: number;
  caption: string;
  pose: SortPose;
}

export interface SortScene {
  values: number[];
  pose: SortPose;
}

/** The most numbers the picture holds: more, and a pass a slide makes a deck of one sort. */
export const SORT_MAX = 8;

const W = 640;
type P = [number, number];

/** The sort as still pictures: before the first pass, each pass as it finds the list (the smallest lifted, before anything moves), and sorted. */
export function sortKeyframes(model: SelectionSortModel): SortKeyframe[] {
  const n = model.values.length;
  // Where each number stands, by the index it had at the start.
  const slot = model.values.map((_, i) => i);
  const idAt = (place: number) => slot.indexOf(place);
  const frames: SortKeyframe[] = [{ kind: 'start', step: 0, caption: describeSortStart(model), pose: { from: 0, slot: [...slot], lift: slot.map(() => 0), state: slot.map(() => 'rest') } }];
  for (const pass of model.passes) {
    const min = idAt(pass.min);
    const first = idAt(pass.from);
    const state = slot.map((place, id): SortState => (place < pass.from ? 'sorted' : id === min ? 'min' : id === first ? 'place' : 'rest'));
    frames.push({ kind: 'step', step: pass.step, caption: describePass(model, pass), pose: { from: pass.from, slot: [...slot], lift: slot.map((_, id) => (id === min ? 1 : 0)), state } });
    [slot[min], slot[first]] = [slot[first]!, slot[min]!];
  }
  if (n > 1) frames.push({ kind: 'end', step: model.passes.length, caption: describeSortResult(model), pose: { from: n, slot: [...slot], lift: slot.map(() => 0), state: slot.map(() => 'sorted') } });
  return frames;
}

/** A pose part of the way from one picture to the next: blocks sliding to their new places, the lifted one coming down. */
export function sortBetween(a: SortPose, b: SortPose, t: number): SortPose {
  const mix = (x: number, y: number) => x + (y - x) * t;
  return { from: mix(a.from, b.from), slot: b.slot.map((s, i) => mix(a.slot[i] ?? s, s)), lift: b.lift.map((l, i) => mix(a.lift[i] ?? 0, l)), state: t < 0.5 ? a.state : b.state };
}

/** Why the picture cannot hold a list that can be sorted, or null. */
export function sortLimit(values: readonly number[]): CabinetLimit | null {
  if (values.length > SORT_MAX) return 'tooMany';
  return values.every((v) => numeralOf(v) !== null) && readGrid(values, 0).rows === 1 ? null : 'tooLong';
}

// ---- the scene ----

const PITCH = 16;
const BLOCK = 12;
const DEPTH = 13;
const TRAY = 3;
const LIFT = 12;
const S = k.solidSvg;
const L = k.lineSvg;

/** Each number's height among the others: the smallest the lowest block, equal numbers equal blocks. */
function heights(values: readonly number[]): number[] {
  const ranks = [...new Set(values)].sort((a, b) => a - b);
  return values.map((v) => 9 + (ranks.indexOf(v) * 21) / Math.max(1, ranks.length - 1));
}

function trayOf(count: number): { tray: k.Plan; plate: k.Plan } {
  const tray: k.Plan = { x: 0, y: 0, w: Math.max(count, 3) * PITCH + 8, d: DEPTH + 10, r: 1.5 };
  return { tray, plate: { x: -12, y: -10, w: tray.w + 24, d: tray.d + 30, r: 6 } };
}

function projectionOf(count: number, view: View): k.Projection {
  const { tray, plate } = trayOf(count);
  return k.fitProjection([...k.boxCorners(plate, -10, 0), ...k.boxCorners(tray, 0, TRAY + 30 + LIFT)], view.width, view.height, { pad: view === VIEW ? 26 : 14, azimuth: 72 });
}

const blockX = (slot: number) => 4 + slot * PITCH + (PITCH - BLOCK) / 2;
const labelSize = (values: readonly number[]) => Math.min(5.6 / GLYPH_HEIGHT, ...values.map((v) => (BLOCK - 2.4) / outlineOf(numeral(v)).width));

function block(id: number, { values, pose }: SortScene, tall: number, size: number, p: k.Projection): string {
  const state = pose.state[id] ?? 'rest';
  const x = blockX(pose.slot[id] ?? id);
  const z = TRAY + (pose.lift[id] ?? 0) * LIFT;
  const lit = state === 'min';
  const face = 5 + DEPTH;
  const parts = [
    S(k.slabOf({ x, y: 5, w: BLOCK, d: DEPTH, r: 0.8 }, z, tall, p, 3, 0.5), { tone: state === 'sorted' ? 'lo' : 'hi', lit, crease: state === 'sorted' ? 'faint' : 'lo' }),
    numeralMark(stamped(numeral(values[id]!), { x0: x + 1.2, x1: x + BLOCK - 1.2, y: face, z0: z + 1.6, z1: z + 7.2 }, p, size), lit ? 'lit' : state === 'sorted' ? 'lo' : 'hi'),
  ];
  return k.groupSvg(parts, { 'data-drawer': id, 'data-state': state });
}

/** The tray, the plate under it, and the marker that stands where the sorted part ends. */
function ground(count: number, from: number, p: k.Projection): string {
  const { tray, plate } = trayOf(count);
  const mark = 4 + from * PITCH - 1.1;
  return [
    `<path class="iso-halo" d="${k.haloOf(plate, -11, 8, p)}"/>`,
    S(k.slabOf(plate, -6, 6, p, 8, 1.4), { tone: 'mid' }),
    L(k.planOutline(k.insetPlan(plate, 4.5), 0, p), { tone: 'faint' }),
    S(k.slabOf(tray, 0, TRAY, p, 6, 0.6), { tone: 'mid' }),
    L(k.planOutline(k.insetPlan(tray, 2), TRAY, p), { tone: 'faint' }),
    S(k.slabOf({ x: mark, y: tray.d - 4.6, w: 2.2, d: 4.6, r: 0.5 }, TRAY, 4.2, p, 3, 0.3), { tone: 'hi', crease: 'lo' }),
  ].join('');
}

/** The scene as the inside of an SVG, back to front: the blocks from the left, since the eye looks along the tray. */
export function sortSceneBody(scene: SortScene, view: View = VIEW): string {
  const p = projectionOf(scene.values.length, view);
  const tall = heights(scene.values);
  const size = scene.values.length ? labelSize(scene.values) : 1;
  const order = scene.values.map((_, id) => id).sort((a, b) => (scene.pose.slot[a] ?? a) - (scene.pose.slot[b] ?? b));
  return ground(scene.values.length, scene.pose.from, p) + order.map((id) => block(id, scene, tall[id]!, size, p)).join('');
}

/** Where a line to a block starts: on the tray under the middle of its front, in the gap a lifted block leaves. At the block's own foot the dot lay over its number. */
function blockFoot(scene: SortScene, id: number, view: View): P {
  return k.iso([blockX(scene.pose.slot[id] ?? id) + BLOCK / 2, 5 + DEPTH, TRAY], projectionOf(scene.values.length, view));
}

// ---- the reading ----

const readGrid = (values: readonly number[], y0: number): Grid => gridOf(values, W - 28, 14, y0);

function cell(id: number, { values, pose }: SortScene, g: Grid): string {
  const state = pose.state[id] ?? 'rest';
  const x = g.x(0) + (pose.slot[id] ?? id) * g.cell + 3;
  const y = g.top(0);
  const w = g.cell - 6;
  const box = d([[x, y], [x + w, y], [x + w, y + g.h], [x, y + g.h]], true);
  const inner = { x: x + 4, y: y + g.h * 0.18, w: w - 8, h: g.h * 0.64 };
  const frame = state === 'min' ? stroke(box, FLAT.accent, 4) : stroke(box, FLAT.ink, state === 'place' ? 3.4 : 2);
  // Sorted: a heavy rule under the cell, a thing settled; told by line, not by shade.
  const settled = state === 'sorted' ? stroke(d([[x, y + g.h + 5], [x + w, y + g.h + 5]]), FLAT.ink, 3.2) : '';
  return `<g data-drawer="${id}" data-state="${state}">${fillOf(box, FLAT.paper)}${frame}${written(numeral(values[id]!), inner, FLAT.ink, g.unit)}${settled}</g>`;
}

/** The places under the cells, a bracket under the unsorted part, and under the two that change places a line with an arrowhead at each. */
function marks({ values, pose }: SortScene, g: Grid): string {
  const n = values.length;
  const y = g.top(0) + g.h;
  const places = values.map((_, i) => written(String(i + 1), { x: g.x(0) + i * g.cell + 3, y: y + 9, w: g.cell - 6, h: 13 }, FLAT.soft, 2.1, 'place')).join('');
  const a = g.x(0) + pose.from * g.cell + 3;
  const b = g.x(0) + n * g.cell - 3;
  const bracket = n - pose.from > 0.02 ? stroke(d([[a, y + 38], [a, y + 45], [b, y + 45], [b, y + 38]]), FLAT.ink, 2.6) : '';
  const min = pose.state.indexOf('min');
  const first = pose.state.indexOf('place');
  if (min < 0 || first < 0) return places + bracket;
  const mid = (id: number) => g.x(0) + (pose.slot[id] ?? id) * g.cell + g.cell / 2;
  const head = (x: number) => fillOf(d([[x - 5, y + 32], [x + 5, y + 32], [x, y + 26]], true), FLAT.accent);
  return places + bracket + stroke(d([[mid(first), y + 31], [mid(first), y + 36], [mid(min), y + 36], [mid(min), y + 31]]), FLAT.accent, 2.4).replace('<path', '<path data-part="swap"') + head(mid(first)) + head(mid(min));
}

/** Over the smallest: an arrow, and, where it changes places, that it is less than the number it changes with. */
function pointerOf(scene: SortScene, g: Grid): { svg: string; at: P | null } {
  const min = scene.pose.state.indexOf('min');
  if (min < 0) return { svg: '', at: null };
  const x = g.x(0) + (scene.pose.slot[min] ?? min) * g.cell + g.cell / 2;
  const y = g.top(0);
  const arrow = stroke(d([[x, y - 30], [x, y - 8]]), FLAT.accent, 3) + fillOf(d([[x - 7, y - 16], [x + 7, y - 16], [x, y - 5]], true), FLAT.accent);
  const first = scene.pose.state.indexOf('place');
  const text = first < 0 ? numeral(scene.values[min]!) : `${numeral(scene.values[min]!)} < ${numeral(scene.values[first]!)}`;
  return { svg: arrow + written(text, { x: Math.max(8, Math.min(W - 228, x - 110)), y: y - 60, w: 220, h: 26 }, FLAT.accent, 4.2, 'compare'), at: [x, y - 64] };
}

function reading(scene: SortScene, g: Grid): string {
  return scene.values.map((_, id) => cell(id, scene, g)).join('') + marks(scene, g) + pointerOf(scene, g).svg;
}

// ---- the looks ----

const BAND: View = { width: W, height: 250 };
const READ_FROM = 228;
export type SortLook = 'cabinet' | 'flat' | 'composite';

export const sortView = (look: SortLook, values: readonly number[]): View => (look === 'cabinet' ? VIEW : { width: W, height: Math.round(readGrid(values, look === 'flat' ? 0 : READ_FROM).height) });

const page = (height: number) => fillOf(d([[0, 0], [W, 0], [W, height], [0, height]], true), FLAT.page);
const ROUND = Array.from({ length: 20 }, (_, i): P => [Math.cos((i / 20) * Math.PI * 2), Math.sin((i / 20) * Math.PI * 2)]);

/** The inside of the SVG for a pose in a look: the blocks, the row, or the blocks over the row with a line from the lifted block to its number. */
export function sortBody(scene: SortScene, look: SortLook): string {
  if (look === 'cabinet') return sortSceneBody(scene);
  const g = readGrid(scene.values, look === 'flat' ? 0 : READ_FROM);
  if (look === 'flat') return page(g.height) + reading(scene, g);
  const to = pointerOf(scene, g).at;
  const min = scene.pose.state.indexOf('min');
  let leader = '';
  if (to && min >= 0) {
    const from = blockFoot(scene, min, BAND);
    const turn = Math.max(from[1] + 10, Math.min(to[1] - 8, READ_FROM + 6));
    leader = stroke(d([from, [from[0], turn], [to[0], turn], to]), FLAT.accent, 2).replace('<path', '<path data-part="leader"') + fillOf(d(ROUND.map(([c, s]): P => [from[0] + c * 5, from[1] + s * 5]), true), FLAT.paper) + fillOf(d(ROUND.map(([c, s]): P => [from[0] + c * 3.2, from[1] + s * 3.2]), true), FLAT.accent);
  }
  return `${page(g.height)}<g data-layer="scene">${sortSceneBody(scene, BAND)}</g><g data-layer="reading">${reading(scene, g)}${leader}</g>`;
}

/** A picture of its own. */
export function sortSvg(scene: SortScene, label: string, look: SortLook): string {
  return standaloneSvg(sortView(look, scene.values), label, sortBody(scene, look));
}

/** How wide, in pixels of a screen, the picture must be shown for its numbers to be read there. */
export function sortReadWidth(look: SortLook, values: readonly number[]): number {
  if (look === 'cabinet') return 640;
  return Math.ceil(Math.max((W * 13) / (readGrid(values, 0).unit * GLYPH_HEIGHT), (W * 9) / (2.1 * GLYPH_HEIGHT)));
}
