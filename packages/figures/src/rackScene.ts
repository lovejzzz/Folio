import { describeRackResult, describeRackStart, describeRackStep, written as said, type RackBudgetModel } from '@folio/core';
import * as k from './vendor/anatomy/iso-kit';
import { numeralMark, onFront, stamped, standaloneSvg, VIEW, type View } from './binarySearchScene';
import { GLYPH_HEIGHT } from './digits';
import { d, fillOf, FLAT, stroke, written } from './flatScene';

/**
 * Filling a rack against a budget, as one picture in two layers. Above, the object: a rack, and servers sliding
 * into it from the bottom slot up; the one a step is about is lit, and one that would go over the budget stays
 * half out. Below, the reading: a gauge from 0 to the budget with a block for each server, the budget as a tall
 * line with its name, a server that does not fit hatched and across that line, the sum written over the newest
 * block, and beside it what is used, what is left (or how far over), and how many are in.
 */

export type ServerState = 'waiting' | 'in' | 'now' | 'refused';

/** Each server tried so far: how far out of its slot it is (0 seated) and what the step makes of it. */
export interface RackPose {
  out: number[];
  state: ServerState[];
  /** The server this picture is about, counted from 0; none before the first and at the end. */
  at: number | null;
}

export interface RackKeyframe {
  kind: 'start' | 'step' | 'end';
  step: number;
  caption: string;
  pose: RackPose;
}

export interface RackScene {
  model: RackBudgetModel;
  pose: RackPose;
}

export type RackLook = 'cabinet' | 'flat' | 'composite';
type P = [number, number];
const W = 640;
const REFUSED_OUT = 0.62;
const AWAY = 1.7;

export function rackKeyframes(m: RackBudgetModel): RackKeyframe[] {
  const n = m.steps.length;
  const at = (upTo: number, last: ServerState, about: number | null = null): RackPose => ({ at: about, out: m.steps.map((s, i) => (i > upTo ? AWAY : s.fits ? 0 : REFUSED_OUT)), state: m.steps.map((s, i) => (i > upTo ? 'waiting' : !s.fits ? 'refused' : i === upTo ? last : 'in')) });
  return [{ kind: 'start', step: 0, caption: describeRackStart(m), pose: at(-1, 'in') }, ...m.steps.map((s, i): RackKeyframe => ({ kind: 'step', step: s.step, caption: describeRackStep(m, s), pose: at(i, 'now', i) })), { kind: 'end', step: n, caption: describeRackResult(m), pose: at(n - 1, 'in') }];
}

/** A server part of the way into its slot. It is the server of the step it is going to from the moment it starts to move. */
export function rackBetween(a: RackPose, b: RackPose, t: number): RackPose {
  return { at: t < 0.5 ? null : b.at, out: b.out.map((o, i) => (a.out[i] ?? AWAY) + (o - (a.out[i] ?? AWAY)) * t), state: b.state.map((s, i) => (t < 0.5 && a.state[i] !== 'waiting' ? (a.state[i] ?? s) : s)) };
}

// ---- the scene ----

const RACK: k.Plan = { x: 0, y: 0, w: 36, d: 28, r: 1 };
const PITCH = 7;
const S = k.solidSvg;
const L = k.lineSvg;
const tall = (m: RackBudgetModel) => 4 + m.slots * PITCH;
const plateOf = (): k.Plan => ({ x: -14, y: -10, w: RACK.w + 28, d: RACK.d + 46, r: 6 });
const projection = (m: RackBudgetModel, view: View): k.Projection => k.fitProjection([...k.boxCorners(plateOf(), -8, 0), ...k.boxCorners({ ...RACK, d: RACK.d + 20 }, 0, tall(m) + 4)], view.width, view.height, { pad: view === VIEW ? 24 : 10, azimuth: 60 });

function server(i: number, { model: m, pose }: RackScene, p: k.Projection): string {
  const state = pose.state[i] ?? 'waiting';
  if (state === 'waiting' && (pose.out[i] ?? AWAY) >= AWAY - 0.01) return '';
  const y = 3 + (pose.out[i] ?? 0) * 18;
  const z = 2 + i * PITCH;
  const lit = state === 'now';
  const face = y + 22;
  const dim = state === 'refused';
  const parts = [
    S(k.slabOf({ x: 3, y, w: RACK.w - 6, d: 22, r: 0.6 }, z, 5, p, 3, 0.4), { tone: dim ? 'lo' : 'hi', lit, crease: dim ? 'faint' : 'lo' }),
    // Its face: a row of vents, and its number where a label would be.
    L(onFront(6, 20, face, z + 1.3, z + 3.7, p), { tone: dim ? 'faint' : 'lo' }),
    numeralMark(stamped(String(i + 1), { x0: 23, x1: 30, y: face, z0: z + 0.9, z1: z + 4.1 }, p), lit ? 'lit' : dim ? 'lo' : 'hi'),
  ];
  return k.groupSvg(parts, { 'data-drawer': i, 'data-state': state === 'now' ? 'look' : state, 'data-m': m.slots });
}

export function rackSceneBody(scene: RackScene, view: View = VIEW): string {
  const m = scene.model;
  const p = projection(m, view);
  const h = tall(m);
  const post = (x: number, y: number) => S(k.slabOf({ x, y, w: 2.2, d: 2.2, r: 0.3 }, 0, h, p, 2, 0.2), { tone: 'mid' });
  const plate = plateOf();
  return [
    `<path class="iso-halo" d="${k.haloOf(plate, -9, 8, p)}"/>`,
    S(k.slabOf(plate, -5, 5, p, 8, 1.2), { tone: 'mid' }),
    L(k.planOutline(k.insetPlan(plate, 4), 0, p), { tone: 'faint' }),
    S(k.slabOf(RACK, 0, 1.6, p, 4, 0.3), { tone: 'mid' }),
    post(0, 0),
    post(RACK.w - 2.2, 0),
    ...scene.model.steps.map((_, i) => server(i, scene, p)),
    post(0, RACK.d - 2.2),
    post(RACK.w - 2.2, RACK.d - 2.2),
    S(k.slabOf(RACK, h, 1.8, p, 4, 0.4), { tone: 'mid' }),
  ].join('');
}

/** Where a line to a server starts: the middle of the foot of its face. */
function serverFoot({ model: m, pose }: RackScene, i: number, view: View): P {
  return k.iso([RACK.w / 2 - 4, 3 + (pose.out[i] ?? 0) * 18 + 22, 2 + i * PITCH], projection(m, view));
}

// ---- the reading ----

const BAR = { x0: 40, x1: W - 240, h: 46 };
const text = (n: number) => (said(n).exact ? said(n).text : `~${said(n).text}`);

function hatch(x: number, y: number, w: number, h: number): string {
  const lines: string[] = [];
  for (let t = -h + 7; t < w; t += 8) lines.push(d([[Math.max(x, x + t), y + Math.max(0, -t)], [Math.min(x + w, x + t + h), y + Math.min(h, w - t)]]));
  return stroke(lines.join(''), FLAT.rule, 1.2);
}

function readout(rows: [string, string][], y0: number): string {
  const x = W - 176;
  const box = d([[x, y0], [x + 162, y0], [x + 162, y0 + 138], [x, y0 + 138]], true);
  return fillOf(box, FLAT.paper) + stroke(box, FLAT.ink, 2) + rows.map(([name, value], i) => written(name, { x: x + 8, y: y0 + 12 + i * 42, w: 58, h: 14 }, FLAT.soft, 2.3, 'name') + written(value, { x: x + 70, y: y0 + 6 + i * 42, w: 86, h: 28 }, FLAT.ink, 4.4, 'readout')).join('');
}

function reading({ model: m, pose }: RackScene, y0: number): { svg: string; at: P | null; now: number } {
  // The gauge runs to the budget, or past it as far as a server that does not fit would reach.
  const most = Math.max(m.budget, ...m.steps.map((s) => s.total));
  const x = (v: number) => BAR.x0 + (v / most) * (BAR.x1 - BAR.x0);
  const y = y0 + 62;
  const shown = pose.state.map((s, i) => (s === 'waiting' ? -1 : i)).filter((i) => i >= 0);
  const now = pose.at ?? -1;
  const blocks = shown.map((i) => {
    const state = pose.state[i]!;
    const a = x(i * m.each) + 2;
    const w = x((i + 1) * m.each) - x(i * m.each) - 4;
    const box = d([[a, y], [a + w, y], [a + w, y + BAR.h], [a, y + BAR.h]], true);
    const body = state === 'refused' ? fillOf(box, FLAT.page) + hatch(a, y, w, BAR.h) + stroke(box, FLAT.rule, 1.8) : fillOf(box, FLAT.paper) + stroke(box, state === 'now' ? FLAT.accent : FLAT.ink, state === 'now' ? 4 : 2);
    return `<g data-drawer="${i}" data-state="${state === 'now' ? 'look' : state}">${body}${written(String(i + 1), { x: a + 3, y: y + 9, w: w - 6, h: BAR.h - 18 }, state === 'refused' ? FLAT.soft : FLAT.ink, 4.4)}</g>`;
  });
  const frame = stroke(d([[BAR.x0, y + BAR.h + 6], [x(most), y + BAR.h + 6]]), FLAT.ink, 2);
  const label = (v: number, s: string) => written(s, { x: x(v) - 60, y: y + BAR.h + 14, w: 120, h: 14 }, FLAT.soft, 2.3, 'place');
  // The budget: a tall line across the gauge, and its name. Told by a line and a word.
  const limit = stroke(d([[x(m.budget), y - 12], [x(m.budget), y + BAR.h + 12]]), FLAT.ink, 3.2) + label(m.budget, `budget ${text(m.budget)}`) + label(0, '0').replace('data-part="place"', 'data-part="zero"');
  const count = pose.state.filter((s) => s === 'in' || s === 'now').length;
  const used = count * m.each;
  const tried = now >= 0 ? m.steps[now]! : null;
  const over = tried && !tried.fits;
  const sum = tried ? written(`${tried.step} × ${text(m.each)} = ${text(tried.total)}`, { x: Math.max(6, Math.min(BAR.x1 - 200, x((now + 0.5) * m.each) - 110)), y: y - 50, w: 220, h: 20 }, FLAT.accent, 3.4, 'compare') : '';
  const rows: [string, string][] = [['used', text(used)], [over ? 'over by' : 'left', text(over ? tried.total - m.budget : m.budget - used)], ['servers', String(count)]];
  return { svg: frame + blocks.join('') + limit + sum + readout(rows, y0 + 14), at: tried ? [x((now + 0.5) * m.each), y - 54] : null, now };
}

// ---- the looks ----

const BAND: View = { width: W, height: 250 };
const READ_FROM = 232;
const READ_TALL = 168;
const page = (height: number) => fillOf(d([[0, 0], [W, 0], [W, height], [0, height]], true), FLAT.page);
const ROUND = Array.from({ length: 20 }, (_, i): P => [Math.cos((i / 20) * Math.PI * 2), Math.sin((i / 20) * Math.PI * 2)]);
const disc = ([x, y]: P, r: number) => d(ROUND.map(([c, s]): P => [x + c * r, y + s * r]), true);

export const rackView = (look: RackLook): View => (look === 'cabinet' ? VIEW : { width: W, height: (look === 'flat' ? 0 : READ_FROM) + READ_TALL });

export function rackBody(scene: RackScene, look: RackLook): string {
  if (look === 'cabinet') return rackSceneBody(scene);
  const read = reading(scene, look === 'flat' ? 0 : READ_FROM);
  if (look === 'flat') return `${page(READ_TALL)}<g data-layer="reading">${read.svg}</g>`;
  let leader = '';
  if (read.at) {
    const from = serverFoot(scene, read.now, BAND);
    const turn = Math.max(from[1] + 8, Math.min(read.at[1] - 6, READ_FROM + 2));
    leader = stroke(d([from, [from[0], turn], [read.at[0], turn], read.at]), FLAT.accent, 2).replace('<path', '<path data-part="leader"') + fillOf(disc(from, 5), FLAT.paper) + fillOf(disc(from, 3.2), FLAT.accent);
  }
  return `${page(READ_FROM + READ_TALL)}<g data-layer="scene">${rackSceneBody(scene, BAND)}</g><g data-layer="reading">${read.svg}${leader}</g>`;
}

export const rackSvg = (scene: RackScene, label: string, look: RackLook): string => standaloneSvg(rackView(look), label, rackBody(scene, look));
export const rackReadWidth = (look: RackLook): number => (look === 'cabinet' ? 640 : Math.ceil((W * 9) / (2.3 * GLYPH_HEIGHT)));
