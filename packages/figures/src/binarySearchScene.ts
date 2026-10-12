import * as k from './vendor/anatomy/iso-kit';
import { GLYPH_HEIGHT, numeral, outlineOf } from './digits';

/**
 * Binary search as an object: a cabinet of index drawers in a row, in ascending order, each with its number on its
 * label. Two fences ride a rail on the cabinet's top and bracket the drawers still in play; the drawer looked at is
 * pulled out; drawers set aside sit flush and go dim. The number looked for stands on a card beside the cabinet.
 * Made with the Anatomy kit (vendor/anatomy) and by its method: the object is the explanation, built of small solid
 * parts that rest on one another, and every part's place comes from the pose, which comes from the model.
 */

export type DrawerState = 'play' | 'aside' | 'look' | 'found';

/** Where every moving part stands. Whole numbers at a step; in between while a part is on its way. */
export interface Pose {
  /** The fences, as edges between drawers counted from 0: drawers `lo` to `hi - 1` are in play. */
  lo: number;
  hi: number;
  /** How far each drawer is out, 0 (flush) to 1 (out to be read). */
  pull: number[];
  state: DrawerState[];
}

export interface Scene {
  values: number[];
  target: number;
  pose: Pose;
}

const W = 16;
const D = 38;
const H = 30;
const X0 = 4;
const OUT = 9;
const PROUD = 3;
export const VIEW = { width: 640, height: 380 };
/** The measure a scene is fitted into: the cabinet's own, or a band of a larger picture. */
export interface View {
  width: number;
  height: number;
}

type P = k.Projection;
const S = k.solidSvg;
const L = k.lineSvg;
const byDepth = (points: k.Plane[], p: P) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], p) - k.depthOf([b[0], b[1], 0], p));

interface Frame {
  bays: number;
  body: k.Plan;
  plate: k.Plan;
  p: P;
}

function frameOf(count: number, view: View = VIEW): Frame {
  const bays = Math.max(count, 3);
  const body: k.Plan = { x: 0, y: 0, w: bays * W + X0 * 2, d: D, r: 1.5 };
  const plate: k.Plan = { x: -12, y: -10, w: body.w + 52, d: D + 44, r: 6 };
  const p = k.fitProjection([...k.boxCorners(plate, -10, 0), ...k.boxCorners(body, 0, H + 12)], view.width, view.height, { pad: view === VIEW ? 26 : 14, azimuth: 72 });
  return { bays, body, plate, p };
}

/** A closed rectangle on a face that looks toward +y. */
export const onFront = (x0: number, x1: number, y: number, z0: number, z1: number, p: P) => k.pathOf([k.iso([x0, y, z0], p), k.iso([x1, y, z0], p), k.iso([x1, y, z1], p), k.iso([x0, y, z1], p)], true);

/** A number printed on a face that looks toward +y, centred in the box given, read from the viewer's left: its outlines, lying in the face. */
export function stamped(text: string, box: { x0: number; x1: number; y: number; z0: number; z1: number }, p: P, size?: number): string {
  const { polygons, width } = outlineOf(text);
  if (!width) return '';
  const s = size ?? Math.min((box.x1 - box.x0) / width, (box.z1 - box.z0) / GLYPH_HEIGHT);
  const left = (box.x0 + box.x1) / 2 - (width * s) / 2;
  const base = (box.z0 + box.z1) / 2 - (GLYPH_HEIGHT * s) / 2;
  return polygons.map((run) => k.pathOf(run.map(([u, v]) => k.iso([left + u * s, box.y, base + v * s], p)), true)).join('');
}

/** The ink of a printed number: full, black on a lit face, pale for one set aside. Written on the mark, as the flat look's are. */
const INK = { hi: '#26262a', lit: '#000000', lo: '#b4b4b8' };

/** A printed number as a filled mark. */
export const numeralMark = (d: string, tone: keyof typeof INK): string => (d ? `<path class="flat fig-numeral" fill="${INK[tone]}" stroke="none" d="${d}"/>` : '');

function base({ plate, p }: Frame): string[] {
  const out: string[] = [`<path class="iso-halo" d="${k.haloOf(plate, -11, 8, p)}"/>`];
  for (const [x, y] of byDepth(k.corners(plate, 16), p)) {
    out.push(S(k.cylinder(x, y, 6, -10.6, 1.4, p, 28), { tone: 'lo' }), S(k.cylinder(x, y, 4.6, -9.2, 3.2, p, 28), { tone: 'mid' }));
  }
  out.push(S(k.slabOf(plate, -6, 6, p, 8, 1.4), { tone: 'mid' }));
  out.push(L(k.planOutline(k.insetPlan(plate, 4.5), 0, p), { tone: 'faint' }));
  for (const [x, y] of k.corners(plate, 9)) out.push(L(k.ring(x, y, 2, 0, p, 16), { tone: 'lo' }));
  out.push(k.dotsSvg(k.pointsAt(k.corners(plate, 9).map(([x, y]): k.Point3 => [x, y, 0]), p), { size: 0.5, tone: 'mid' }));
  // A maker's plate at the front, its three rules standing for print.
  const label: k.Plan = { x: plate.x + 12, y: plate.y + plate.d - 15, w: 34, d: 8, r: 1 };
  out.push(S(k.slabOf(label, 0, 0.8, p, 4), { tone: 'lo' }), L(k.planOutline(k.insetPlan(label, 1.4), 0.8, p), { tone: 'faint' }));
  for (const [i, len] of [22, 16, 26].entries()) out.push(L(k.lineOnTop([label.x + 4, label.y + 2.2 + i * 1.8], [label.x + 4 + len, label.y + 2.2 + i * 1.8], 0.8, p), { tone: 'lo', free: true }));
  return out;
}

/** The cabinet, with the index ruler and the rail on its top. */
function cabinet({ bays, body, p }: Frame, count: number): string[] {
  const seam = k.sideSeam(body, 2.4, p, 6);
  const out = [S(k.slabOf(body, 0, H, p, 6, 1), { tone: 'mid', inner: L(seam, { tone: 'faint' }) })];
  // The mouth of every bay: what a drawer leaves when it is pulled.
  for (let i = 0; i < count; i++) out.push(L(onFront(X0 + i * W + 2, X0 + i * W + W - 2, D, 5, H - 5, p), { tone: 'faint' }));
  const strip: k.Plan = { x: X0, y: D - 8, w: bays * W, d: 6, r: 0.6 };
  out.push(S(k.slabOf(strip, H, 0.6, p, 3), { tone: 'lo', crease: 'none' }));
  const ticks = k.topTicks(strip.x, strip.x + strip.w, W / 4, 4, strip.y + 0.4, H + 0.6, [1.6, 3.4], p);
  out.push(L(ticks.minor, { tone: 'lo' }), L(ticks.major, { tone: 'mid' }));
  const rail: k.Plan = { x: X0 - 2.5, y: 6, w: bays * W + 5, d: 4, r: 0.8 };
  out.push(S(k.slabOf(rail, H, 2.4, p, 3, 0.4), { tone: 'mid' }));
  return out;
}

function stops({ bays, p }: Frame): { at: number; svg: string }[] {
  return [X0 - 4.4, X0 + bays * W + 2].map((x) => {
    const plan: k.Plan = { x, y: 4, w: 2.4, d: 8, r: 0.8 };
    const dots = k.dotsSvg(k.pointsAt([[x + 1.2, 6, H + 4.6], [x + 1.2, 10, H + 4.6]], p), { size: 0.45, tone: 'mid' });
    return { at: x, svg: S(k.slabOf(plan, H, 4.6, p, 3, 0.4), { tone: 'mid' }) + dots };
  });
}

/** A fence: a block on the rail with a thumb screw, and an arm across the top to the front edge. */
function fence(edge: number, side: -1 | 1, p: P): { at: number; svg: string } {
  const x = X0 + edge * W + side * 1.3;
  const arm: k.Plan = { x: x - 0.9, y: 12, w: 1.8, d: D - 12.4, r: 0.4 };
  const block: k.Plan = { x: x - 2.4, y: 3.6, w: 4.8, d: 8.8, r: 1 };
  const parts = [
    S(k.slabOf(arm, H, 1.5, p, 2, 0.3), { tone: 'hi' }),
    S(k.slabOf(block, H, 6, p, 4, 0.5), { tone: 'hi', crease: 'lo' }),
    S(k.cylinder(x, 8, 1.9, H + 6, 3, p, 20), { tone: 'hi', crease: 'lo' }),
    L(k.knurl(x, 8, 1.9, H + 6, H + 9, 16, p), { tone: 'lo' }),
    L(k.lineOnTop([x - 1.2, 8], [x + 1.2, 8], H + 9, p), { tone: 'hi' }),
  ];
  return { at: x, svg: parts.join('') };
}

/** The room for a number on a drawer's label, across and up. */
const LABEL = { w: 9.2, h: 6.8 };

/** One size for every label of a cabinet: the size its longest number fits at. Each sized to its own room, a short number stood twice as large as its neighbour. */
const labelSize = (values: readonly number[]): number => Math.min(LABEL.h / GLYPH_HEIGHT, ...values.map((v) => LABEL.w / outlineOf(numeral(v)).width));

/**
 * How wide, in pixels of a screen, the cabinet of these numbers must be shown for its labels to be read there: their
 * digits nine and a half pixels high. From the labels' own size in the picture, since every label of a cabinet has one.
 */
export function cabinetReadWidth(values: readonly number[]): number {
  if (!values.length) return VIEW.width;
  const p = frameOf(values.length).p;
  // A unit of height on the page: what one unit up a drawer's face comes to.
  const up = Math.abs(k.iso([0, 0, 1], p)[1] - k.iso([0, 0, 0], p)[1]);
  const high = labelSize(values) * GLYPH_HEIGHT * up;
  return Math.max(VIEW.width, Math.min(1280, Math.ceil((VIEW.width * 9.5) / high)));
}

function drawer(i: number, value: number, pull: number, state: DrawerState, p: P, size: number): string {
  const x0 = X0 + i * W + 1;
  const out_ = (state === 'aside' ? 0 : PROUD) + pull * OUT;
  const y = D + out_;
  const lit = state === 'look' || state === 'found';
  const tone: k.Tone = state === 'aside' ? 'lo' : 'hi';
  const parts: string[] = [];
  if (out_ > PROUD + 1) {
    const box: k.Plan = { x: x0 + 1, y: D, w: 12, d: out_, r: 0.5 };
    parts.push(S(k.slabOf(box, 5, H - 11, p, 2, 0.3), { tone: 'mid' }), L(k.planOutline(k.insetPlan({ ...box, d: out_ - 0.4 }, 1.3), H - 6, p, 2), { tone: 'faint' }));
    // The card in the drawer: what is read.
    if (out_ > 7) parts.push(S(k.slabOf({ x: x0 + 3, y: D + out_ * 0.42, w: 8, d: 1.1, r: 0.3 }, H - 8, 5.2, p, 2), { tone: 'hi', lit: state === 'found' }));
  }
  parts.push(S(k.slabOf({ x: x0, y, w: 14, d: 1.6, r: 0.5 }, 3, 24, p, 3, 0.4), { tone, lit, crease: state === 'aside' ? 'faint' : 'lo' }));
  const face = y + 1.6;
  parts.push(L(onFront(x0 + 1.5, x0 + 12.5, face, 13, 23, p), { tone: state === 'aside' ? 'faint' : 'lo' }));
  parts.push(numeralMark(stamped(numeral(value), { x0: x0 + 7 - LABEL.w / 2, x1: x0 + 7 + LABEL.w / 2, y: face, z0: 18 - LABEL.h / 2, z1: 18 + LABEL.h / 2 }, p, size), lit ? 'lit' : state === 'aside' ? 'lo' : 'hi'));
  parts.push(S(k.slabOf({ x: x0 + 5, y: face, w: 4, d: 1.4, r: 0.4 }, 7, 1.6, p, 2), { tone: state === 'aside' ? 'lo' : 'mid' }));
  parts.push(k.dotsSvg(k.pointsAt([[x0 + 2.3, face, 22.2], [x0 + 11.7, face, 22.2]], p), { size: 0.4, tone: state === 'aside' ? 'lo' : 'mid' }));
  return k.groupSvg(parts, { 'data-drawer': i, 'data-state': state });
}

/** The number looked for, on a card in a holder beside the cabinet. */
function wanted({ body, p }: Frame, target: number): string {
  const x = body.w + 12;
  const foot: k.Plan = { x, y: D - 14, w: 22, d: 10, r: 1.2 };
  const card: k.Plan = { x: x + 2, y: D - 9.6, w: 18, d: 1.4, r: 0.4 };
  const face = card.y + card.d;
  return [
    S(k.slabOf(foot, 0, 3, p, 4, 0.5), { tone: 'mid' }),
    k.dotsSvg(k.pointsAt([[x + 2.4, D - 6, 3], [x + 19.6, D - 6, 3]], p), { size: 0.45, tone: 'mid' }),
    S(k.slabOf(card, 3, 19, p, 2, 0.3), { tone: 'hi' }),
    L(onFront(card.x + 2, card.x + 16, face, 8, 19, p), { tone: 'lo' }),
    numeralMark(stamped(numeral(target), { x0: card.x + 3.4, x1: card.x + 14.6, y: face, z0: 9.6, z1: 17.4 }, p), 'hi'),
  ].join('');
}

/** Where drawer `i` meets the eye, on the page: the middle of the foot of its front, as far out as it is pulled. What a line from the drawer to its number starts at. */
export function drawerFoot({ values, pose }: Scene, i: number, view: View = VIEW): [number, number] {
  const state = pose.state[i] ?? 'play';
  const y = D + (state === 'aside' ? 0 : PROUD) + (pose.pull[i] ?? 0) * OUT + 1.6;
  return k.iso([X0 + i * W + 8, y, 3], frameOf(values.length, view).p);
}

/** The whole figure as the inside of an SVG, back to front. */
export function sceneBody({ values, target, pose }: Scene, view: View = VIEW): string {
  const f = frameOf(values.length, view);
  const top = [...stops(f), fence(pose.lo, -1, f.p), fence(pose.hi, 1, f.p)].sort((a, b) => a.at - b.at).map((x) => x.svg);
  const size = labelSize(values);
  const drawers = values.map((v, i) => drawer(i, v, pose.pull[i] ?? 0, pose.state[i] ?? 'play', f.p, size));
  return [...base(f), ...cabinet(f, values.length), ...top, ...drawers, wanted(f, target)].join('');
}

/** The kit's styles and the one rule of our own, for a page that draws a figure live. */
// The kit keeps its hairlines one width at any size; the flat look's marks are measured in the picture's own units and
// must scale with it: held at their width on a phone, a numeral nine pixels high was drawn with a three-pixel line.
export const FIGURE_CSS = `${k.ISO_CSS}.iso-svg path.flat{vector-effect:none}`;

/** A picture of its own with the kit's light theme inside it, so it is the same in a page, a file or a print; marks that carry their own measure scale with it. */
export const standaloneSvg = (view: View, label: string, body: string): string => k.figureSvg({ width: view.width, height: view.height, label, body: `<style>.iso-svg path.flat{vector-effect:none}</style>${body}`, standalone: 'light' });

/** A frame of the cabinet as a picture of its own. */
export function sceneSvg(scene: Scene, label: string): string {
  return standaloneSvg(VIEW, label, sceneBody(scene));
}
