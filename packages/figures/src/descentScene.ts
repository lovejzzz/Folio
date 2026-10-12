import { describeDescentResult, describeDescentStart, describeDescentStep, written as said, type GradientDescentModel } from '@folio/core';
import * as k from './vendor/anatomy/iso-kit';
import { standaloneSvg, VIEW, type View } from './binarySearchScene';
import { GLYPH_HEIGHT } from './digits';
import { d, fillOf, FLAT, stroke, written } from './flatScene';

/**
 * Gradient descent as one picture in two layers. Above, the object: the loss as a valley of columns, each as tall
 * as the loss is there, and a puck that rests on the valley's side where w is and goes down it step by step. Below,
 * the reading, which is not a row of numbers here but a number line: w on an axis with the lowest point marked,
 * rings where w has been, an arrow for the step about to be taken with its arithmetic written on it, and beside it
 * the three numbers a step is made of (w, loss, slope). A line runs from the puck to w on the axis.
 */

/** Where the puck is, where it has been, and the step it is about to take (none while it moves, or at the end). */
export interface DescentPose {
  w: number;
  trail: number[];
  to: number | null;
}

export interface DescentKeyframe {
  kind: 'start' | 'step' | 'end';
  step: number;
  caption: string;
  pose: DescentPose;
}

export interface DescentScene {
  model: GradientDescentModel;
  pose: DescentPose;
}

export type DescentLook = 'cabinet' | 'flat' | 'composite';
type P = [number, number];
const W = 640;

export function descentKeyframes(m: GradientDescentModel): DescentKeyframe[] {
  const frames: DescentKeyframe[] = [{ kind: 'start', step: 0, caption: describeDescentStart(m), pose: { w: m.start, trail: [], to: null } }];
  for (const s of m.steps) frames.push({ kind: 'step', step: s.step, caption: describeDescentStep(m, s), pose: { w: s.w, trail: m.steps.slice(0, s.step - 1).map((x) => x.w), to: s.next } });
  const last = m.steps.at(-1)!;
  frames.push({ kind: 'end', step: m.steps.length, caption: describeDescentResult(m), pose: { w: last.next, trail: m.steps.map((x) => x.w), to: null } });
  return frames;
}

/** The puck part of the way from one place to the next, rolling along the valley and not through it. */
export function descentBetween(a: DescentPose, b: DescentPose, t: number): DescentPose {
  return { w: a.w + (b.w - a.w) * t, trail: t < 0.5 ? a.trail : b.trail, to: t < 0.5 ? null : b.to };
}

/** How far to either side of the lowest point the picture shows: as far as w goes, and no further than two and a half times where it started (a walk that runs away leaves the picture, and its numbers say where it is). */
function reach(m: GradientDescentModel): number {
  const far = Math.max(Math.abs(m.start - m.best), ...m.steps.map((s) => Math.abs(s.next - m.best)));
  const first = Math.abs(m.start - m.best) || 1;
  return Math.min(far || 1, first * 2.5);
}
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

// ---- the scene ----

const COLUMNS = 15;
const PITCH = 9;
const DEEP = 12;
const TALL = 27;
const S = k.solidSvg;
const L = k.lineSvg;

const bed = (): { tray: k.Plan; plate: k.Plan } => {
  const tray: k.Plan = { x: 0, y: 0, w: COLUMNS * PITCH + 6, d: DEEP + 8, r: 1.5 };
  return { tray, plate: { x: -10, y: -9, w: tray.w + 20, d: tray.d + 26, r: 6 } };
};
const projection = (view: View): k.Projection => k.fitProjection([...k.boxCorners(bed().plate, -10, 0), ...k.boxCorners(bed().tray, 0, 3 + TALL + 6)], view.width, view.height, { pad: view === VIEW ? 26 : 12, azimuth: 72 });

/** How high the valley's side is at w, and where along the tray w stands. */
const rise = (m: GradientDescentModel, w: number, r: number) => 2 + TALL * Math.min(1, (w - m.best) ** 2 / (r * r));
const along = (m: GradientDescentModel, w: number, r: number) => 3 + ((clamp(w, m.best - r, m.best + r) - (m.best - r)) / (2 * r)) * COLUMNS * PITCH;

export function descentSceneBody({ model: m, pose }: DescentScene, view: View = VIEW): string {
  const p = projection(view);
  const r = reach(m);
  const { tray, plate } = bed();
  const here = Math.min(COLUMNS - 1, Math.floor(((clamp(pose.w, m.best - r, m.best + r) - (m.best - r)) / (2 * r)) * COLUMNS));
  const parts = [`<path class="iso-halo" d="${k.haloOf(plate, -11, 8, p)}"/>`, S(k.slabOf(plate, -6, 6, p, 8, 1.4), { tone: 'mid' }), L(k.planOutline(k.insetPlan(plate, 4.5), 0, p), { tone: 'faint' }), S(k.slabOf(tray, 0, 3, p, 6, 0.6), { tone: 'mid' })];
  for (let i = 0; i < COLUMNS; i++) {
    const centre = m.best - r + ((i + 0.5) / COLUMNS) * 2 * r;
    const lowest = i === Math.floor(COLUMNS / 2);
    parts.push(S(k.slabOf({ x: 3 + i * PITCH + 0.5, y: 4, w: PITCH - 1, d: DEEP, r: 0.5 }, 3, rise(m, centre, r), p, 2, 0.3), { tone: lowest ? 'hi' : 'mid', lit: i === here, crease: 'faint' }));
    // The puck stands on the column it is over, drawn with it so the columns nearer the eye pass in front.
    if (i === here) parts.push(S(k.cylinder(along(m, pose.w, r), 4 + DEEP / 2, 3.1, 3 + rise(m, pose.w, r), 2.4, p, 24, 0.4), { tone: 'hi', lit: true }));
  }
  return parts.join('');
}

function puckFoot({ model: m, pose }: DescentScene, view: View): P {
  return k.iso([along(m, pose.w, reach(m)), 4 + DEEP, 3], projection(view));
}

// ---- the reading ----

const AXIS = { x0: 40, x1: W - 240 };
const text = (n: number) => (said(n).exact ? said(n).text : `~${said(n).text}`);
const ROUND = Array.from({ length: 24 }, (_, i): P => [Math.cos((i / 24) * Math.PI * 2), Math.sin((i / 24) * Math.PI * 2)]);
const disc = ([x, y]: P, r: number) => d(ROUND.map(([c, s]): P => [x + c * r, y + s * r]), true);

/** Where w stands on the axis; beyond its ends it is held at the end, and its number says where it really is. */
const onAxis = (m: GradientDescentModel, w: number, r: number) => AXIS.x0 + ((clamp(w, m.best - r, m.best + r) - (m.best - r)) / (2 * r)) * (AXIS.x1 - AXIS.x0);

/** The three numbers a step is made of, each under its name, in a frame at the right. */
function readout(m: GradientDescentModel, w: number, y0: number): string {
  const x = W - 176;
  const rows: [string, number][] = [['w', w], ['loss', (w - m.best) ** 2], ['slope', 2 * (w - m.best)]];
  const box = d([[x, y0], [x + 162, y0], [x + 162, y0 + 138], [x, y0 + 138]], true);
  return fillOf(box, FLAT.paper) + stroke(box, FLAT.ink, 2) + rows.map(([name, n], i) => written(name, { x: x + 10, y: y0 + 12 + i * 42, w: 46, h: 14 }, FLAT.soft, 2.3, 'name') + written(text(n), { x: x + 58, y: y0 + 6 + i * 42, w: 96, h: 28 }, FLAT.ink, 4.4, i === 0 ? 'value' : 'readout')).join('');
}

function reading({ model: m, pose }: DescentScene, y0: number): { svg: string; at: P } {
  const r = reach(m);
  const y = y0 + 84;
  const x = (w: number) => onAxis(m, w, r);
  const axis = stroke(d([[AXIS.x0, y], [AXIS.x1, y]]), FLAT.ink, 2.6);
  const tick = (w: number, tall: number) => stroke(d([[x(w), y - tall], [x(w), y + tall]]), FLAT.ink, 2);
  const label = (w: number, s: string) => written(s, { x: x(w) - 46, y: y + 16, w: 92, h: 14 }, FLAT.soft, 2.3, 'place');
  const ends = tick(m.best - r, 6) + tick(m.best + r, 6) + label(m.best - r, text(Math.round((m.best - r) * 100) / 100)) + label(m.best + r, text(Math.round((m.best + r) * 100) / 100));
  // The lowest point: a taller tick and its name, told by a mark and a word.
  const lowest = tick(m.best, 13) + label(m.best, `lowest ${text(m.best)}`);
  const rings = pose.trail.map((w) => fillOf(disc([x(w), y], 6), FLAT.paper) + stroke(disc([x(w), y], 6), FLAT.soft, 2)).join('');
  const now = `<g data-drawer="0" data-state="look">${fillOf(disc([x(pose.w), y], 9), FLAT.accent)}${written(`w = ${text(pose.w)}`, { x: clamp(x(pose.w) - 70, 6, AXIS.x1 - 110), y: y - 76, w: 140, h: 22 }, FLAT.accent, 3.6, 'compare')}</g>`;
  let step = '';
  if (pose.to !== null && pose.to !== pose.w) {
    const a = x(pose.w);
    const b = x(pose.to);
    const way = b > a ? 1 : -1;
    const move = m.rate * 2 * (pose.w - m.best);
    step = stroke(d([[a, y - 14], [a, y - 34], [b, y - 34], [b, y - 16]]), FLAT.accent, 2.6).replace('<path', '<path data-part="swap"') + fillOf(d([[b - 6, y - 20], [b + 6, y - 20], [b, y - 10]], true), FLAT.accent) + (Math.abs(b - a) > 4 ? fillOf(d([[(a + b) / 2 - 4 * way, y - 39], [(a + b) / 2 - 4 * way, y - 29], [(a + b) / 2 + 5 * way, y - 34]], true), FLAT.accent) : '') + written(`${text(m.rate)} × ${text(2 * (pose.w - m.best))} = ${text(move)}`, { x: 6, y: y0 + 132, w: AXIS.x1 - 6, h: 18 }, FLAT.accent, 3, 'step');
  }
  return { svg: axis + ends + lowest + rings + step + now + readout(m, pose.w, y0 + 22), at: [x(pose.w), y - 80] };
}

// ---- the looks ----

const BAND: View = { width: W, height: 236 };
const READ_FROM = 214;
const READ_TALL = 170;
const page = (height: number) => fillOf(d([[0, 0], [W, 0], [W, height], [0, height]], true), FLAT.page);

export const descentView = (look: DescentLook): View => (look === 'cabinet' ? VIEW : { width: W, height: (look === 'flat' ? 0 : READ_FROM) + READ_TALL });

export function descentBody(scene: DescentScene, look: DescentLook): string {
  if (look === 'cabinet') return descentSceneBody(scene);
  const y0 = look === 'flat' ? 0 : READ_FROM;
  const read = reading(scene, y0);
  if (look === 'flat') return `${page(READ_TALL)}<g data-layer="reading">${read.svg}</g>`;
  const from = puckFoot(scene, BAND);
  const turn = Math.max(from[1] + 8, Math.min(read.at[1] - 6, READ_FROM + 4));
  const leader = stroke(d([from, [from[0], turn], [read.at[0], turn], read.at]), FLAT.accent, 2).replace('<path', '<path data-part="leader"') + fillOf(disc(from, 5), FLAT.paper) + fillOf(disc(from, 3.2), FLAT.accent);
  return `${page(READ_FROM + READ_TALL)}<g data-layer="scene">${descentSceneBody(scene, BAND)}</g><g data-layer="reading">${read.svg}${leader}</g>`;
}

export const descentSvg = (scene: DescentScene, label: string, look: DescentLook): string => standaloneSvg(descentView(look), label, descentBody(scene, look));

/** How wide, in pixels of a screen, the picture must be shown for its names and numbers to be read there: the smallest writing nine pixels high. */
export const descentReadWidth = (look: DescentLook): number => (look === 'cabinet' ? 640 : Math.ceil((W * 9) / (2.3 * GLYPH_HEIGHT)));
