import type { SlideVisual } from '@folio/core';
import { d, fillOf, FLAT, stroke } from './flatScene';
import { lettered, nameAt, TINTS } from './layersScene';

/**
 * A thing taken apart as it is shaped, drawn as a technical illustration: each part a simple solid (a box, a cylinder,
 * a cone, an egg shape, or half of one cut through its middle) at its place, seen from above at the isometric angle,
 * moved out along its own path when drawn apart, and named beside it with a leader line.
 *
 * Every part is convex, so it is drawn as the outline of its points seen from the viewer, filled, with the edges and
 * rims that face the viewer drawn on it; parts are painted far to near. A clear part (glass, a bag, a film) is its
 * outline only, so what is in it shows. Every mark is a straight path with its colours written on it, as in the layers
 * drawing, so the slide, the downloads and the exports are one drawing.
 */

type Solids = Extract<SlideVisual, { kind: 'solids' }>;
type Part = Solids['parts'][number];
type P = [number, number];
type P3 = [number, number, number];

const COS = Math.cos(Math.PI / 6);
const SIN = Math.sin(Math.PI / 6);
const project = ([x, y, z]: P3): P => [(x - y) * COS, (x + y) * SIN - z];
/** Toward the viewer: a point with more of x + y + z stands nearer. */
const VIEW: P3 = [1, 1, 1];
const LINE = 0.9;
const FINE = 0.6;
const ROUND = 40;

/** The convex outline of points, anticlockwise (monotone chain). */
function hull(points: P[]): P[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o: P, a: P, b: P) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: P[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: P[] = [];
  for (const p of [...pts].reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** A part's own frame turned so its z runs along `axis`: the shape is made standing up, then laid down. */
function laid(axis: Part['axis'], [a, b, c]: P3): P3 {
  const sign = axis.startsWith('-') ? -1 : 1;
  const k = axis.replace('-', '');
  if (k === 'x') return [c * sign, a, b * sign];
  if (k === 'y') return [b, c * sign, a * sign];
  return [a, b * sign, c * sign];
}

const ring = (n: number) => Array.from({ length: n }, (_, i) => (2 * Math.PI * i) / n);

/** The points of a part's surface, in its own frame (standing along z, centred at the origin), and its rims. */
function shapeOf(p: Part): { points: P3[]; rims: P3[][] } {
  const [w, dd, h] = [p.size[0] / 2, p.size[1] / 2, p.size[2] / 2];
  const circle = (z: number, rx = w, ry = dd): P3[] => ring(ROUND).map((t): P3 => [rx * Math.cos(t), ry * Math.sin(t), z]);
  if (p.shape === 'box') {
    const corners: P3[] = [-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z): P3 => [x * w, y * dd, z * h])));
    return { points: corners, rims: [] };
  }
  if (p.shape === 'cylinder') return { points: [...circle(-h), ...circle(h)], rims: [circle(h), circle(-h)] };
  if (p.shape === 'cone') return { points: [...circle(-h), [0, 0, h]], rims: [circle(-h)] };
  // An egg shape: an ellipsoid; a half: the half of it on the +z side, its flat face at z = 0 of the whole.
  const half = p.shape === 'half';
  const pts: P3[] = [];
  for (let i = 0; i <= 12; i++) {
    const phi = half ? (Math.PI / 2) * (i / 12) : -Math.PI / 2 + Math.PI * (i / 12);
    for (const t of ring(ROUND)) pts.push([w * Math.cos(phi) * Math.cos(t), dd * Math.cos(phi) * Math.sin(t), (half ? 2 * h : h) * Math.sin(phi) - (half ? h : 0)]);
  }
  return { points: pts, rims: half ? [circle(-h)] : [] };
}

/** A point of the part's own frame as it stands in the drawing. */
const placeOf = (p: Part, open: boolean) => ([a, b, c]: P3): P3 => {
  const [x, y, z] = laid(p.axis, [a, b, c]);
  const off = open ? p.apart : [0, 0, 0];
  return [x + p.at[0] + off[0]!, y + p.at[1] + off[1]!, z + p.at[2] + off[2]!];
};

/** The rim of a flat face is drawn when the face looks toward the viewer: its outward normal, in the drawing. */
function rimFaces(p: Part): P3[] {
  if (p.shape === 'cylinder') return [laid(p.axis, [0, 0, 1]), laid(p.axis, [0, 0, -1])];
  if (p.shape === 'cone') return [laid(p.axis, [0, 0, -1])];
  if (p.shape === 'half') return [laid(p.axis, [0, 0, -1])];
  return [];
}

/** A colour a step darker: a side beside a lit face. */
function shaded(hex: string): string {
  const c = [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * 0.86));
  return `#${c.map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

const dot = (a: P3, b: P3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

type Extent = { lo: P3; hi: P3 };
function extentOf(p: Part, open: boolean): Extent {
  const pts = shapeOf(p).points.map(placeOf(p, open));
  return { lo: [0, 1, 2].map((k) => Math.min(...pts.map((q) => q[k]!))) as P3, hi: [0, 1, 2].map((k) => Math.max(...pts.map((q) => q[k]!))) as P3 };
}

/** Which of two is painted first: the one under the other, else the one behind on x, then on y, else the farther centre. */
function before(a: Extent, b: Extent): number {
  const eps = 1e-6;
  for (const k of [2, 0, 1]) {
    if (a.hi[k]! <= b.lo[k]! + eps) return -1;
    if (b.hi[k]! <= a.lo[k]! + eps) return 1;
  }
  const c = (e: Extent) => (e.lo[0] + e.hi[0] + e.lo[1] + e.hi[1] + e.lo[2] + e.hi[2]) / 2;
  return c(a) - c(b);
}

/** One part, drawn: its outline filled, the faces toward the viewer, the rims and edges on it. */
function drawPart(p: Part, open: boolean): string {
  const tint = TINTS[p.tint];
  const place = placeOf(p, open);
  const { points, rims } = shapeOf(p);
  const outline = hull(points.map((q) => project(place(q))));
  const out: string[] = [];
  const line = p.clear ? (p.tint === 'none' ? FLAT.soft : tint.line) : tint.line;
  // A side seen past a face toward the viewer is a shade darker than that face.
  const capped = rimFaces(p).some((n) => dot(n, VIEW) > 1e-6);
  if (!p.clear) out.push(fillOf(d(outline, true), capped ? shaded(p.tint === 'none' ? '#ffffff' : tint.face) : p.tint === 'none' ? '#f1f1ee' : tint.face));
  if (p.shape === 'box' && !p.clear) {
    // The three faces toward the viewer, each a shade, and the edges where they meet.
    const [w, dd, h] = [p.size[0] / 2, p.size[1] / 2, p.size[2] / 2];
    const faces: { n: P3; c: P3[] }[] = [
      { n: [0, 0, 1], c: [[-w, -dd, h], [w, -dd, h], [w, dd, h], [-w, dd, h]] },
      { n: [1, 0, 0], c: [[w, -dd, -h], [w, dd, -h], [w, dd, h], [w, -dd, h]] },
      { n: [0, 1, 0], c: [[-w, dd, -h], [w, dd, -h], [w, dd, h], [-w, dd, h]] },
      { n: [0, 0, -1], c: [[-w, -dd, -h], [w, -dd, -h], [w, dd, -h], [-w, dd, -h]] },
      { n: [-1, 0, 0], c: [[-w, -dd, -h], [-w, dd, -h], [-w, dd, h], [-w, -dd, h]] },
      { n: [0, -1, 0], c: [[-w, -dd, -h], [w, -dd, -h], [w, -dd, h], [-w, -dd, h]] },
    ];
    const shade = ['#ffffff', '#e9e9e6', '#dcdcd8'];
    faces
      .map((f) => ({ ...f, n: laid(p.axis, f.n) }))
      .filter((f) => dot(f.n, VIEW) > 1e-6)
      .forEach((f, i) => {
        const poly = f.c.map((q) => project(place(q)));
        out.push(fillOf(d(poly, true), p.tint === 'none' ? shade[Math.min(i, 2)]! : tint.face));
        out.push(stroke(d(poly, true), line, FINE));
      });
  }
  if (p.shape === 'box' && p.clear) {
    const [w, dd, h] = [p.size[0] / 2, p.size[1] / 2, p.size[2] / 2];
    const edges: [P3, P3][] = [];
    for (const a of [-1, 1]) for (const b of [-1, 1]) edges.push([[-w, a * dd, b * h], [w, a * dd, b * h]], [[a * w, -dd, b * h], [a * w, dd, b * h]], [[a * w, b * dd, -h], [a * w, b * dd, h]]);
    out.push(stroke(edges.map(([a, b]) => d([project(place(a)), project(place(b))])).join(''), line, FINE));
  }
  // A flat face toward the viewer (a cylinder's top, a half's cut face) is lighter, with its rim.
  rimFaces(p).forEach((n, i) => {
    const rim = rims[i];
    if (!rim) return;
    const facing = dot(n, VIEW) > 1e-6;
    const poly = rim.map((q) => project(place(q)));
    if (facing && !p.clear) out.push(fillOf(d(poly, true), p.tint === 'none' ? '#ffffff' : tint.face), stroke(d(poly, true), line, FINE));
    else if (p.clear) out.push(stroke(d(poly, true), line, FINE));
  });
  out.push(stroke(d(outline, true), line, p.clear ? FINE : LINE));
  return out.join('');
}

/** Where a part's name is fastened: the point of its outline furthest to the side its name stands on. */
function anchorOf(p: Part, open: boolean, right: boolean): P {
  const place = placeOf(p, open);
  const outline = hull(shapeOf(p).points.map((q) => project(place(q))));
  return outline.reduce((best, q) => (right ? q[0] > best[0] : q[0] < best[0]) ? q : best, outline[0]!);
}

/** The parts at a size the names are set against: the larger side of the drawing apart comes to this, whatever units it was given in. */
const SPAN = 240;

function fitted(v: Solids): Solids {
  const all = v.parts.flatMap((p) => [true, false].flatMap((open) => shapeOf(p).points.map((q) => project(placeOf(p, open)(q)))));
  const span = Math.max(Math.max(...all.map((q) => q[0])) - Math.min(...all.map((q) => q[0])), Math.max(...all.map((q) => q[1])) - Math.min(...all.map((q) => q[1])));
  const k = span > 0 ? SPAN / span : 1;
  const times = (t: P3): P3 => [t[0] * k, t[1] * k, t[2] * k];
  return { ...v, parts: v.parts.map((p) => ({ ...p, size: times(p.size), at: times(p.at), apart: times(p.apart) })) };
}

/**
 * Parts drawn apart that still cover one another: each pair where the smaller, painted first, lies more than a fifth
 * under the larger, by name. A drawing taken apart is for seeing every part: one hidden under another is to be moved further.
 */
export function solidsHidden(given: Solids): string[] {
  const v = fitted({ ...given, open: true });
  const outline = (p: Part) => hull(shapeOf(p).points.map((q) => project(placeOf(p, true)(q))));
  const area = (poly: P[]) => Math.abs(poly.reduce((s, q, i) => s + q[0] * poly[(i + 1) % poly.length]![1] - poly[(i + 1) % poly.length]![0] * q[1], 0)) / 2;
  const inside = (q: P, poly: P[]) => poly.every((a, i) => { const b = poly[(i + 1) % poly.length]!; return (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]) >= 0; });
  const out: string[] = [];
  const solid = v.parts.filter((p) => !p.clear);
  solid.forEach((a, i) => solid.slice(i + 1).forEach((b) => {
    const [pa, pb] = [outline(a), outline(b)];
    const small = area(pa) < area(pb) ? pa : pb;
    const big = small === pa ? pb : pa;
    // Only the one painted first is covered: a seed resting on a towel is on top of it, not under.
    const [first] = before(extentOf(a, true), extentOf(b, true)) < 0 ? [pa] : [pb];
    if (first !== small) return;
    // How much of the smaller lies under the larger, by a grid of its points.
    const xs = small.map((q) => q[0]);
    const ys = small.map((q) => q[1]);
    let n = 0;
    let under = 0;
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += (Math.max(...xs) - Math.min(...xs)) / 12 || 1)
      for (let y = Math.min(...ys); y <= Math.max(...ys); y += (Math.max(...ys) - Math.min(...ys)) / 12 || 1) {
        if (!inside([x, y], small)) continue;
        n += 1;
        if (inside([x, y], big)) under += 1;
      }
    if (n && under / n > 0.2) out.push(`${a.name} / ${b.name}`);
  }));
  return out;
}

const ROW = 21;
const CAP = 8;

export interface SolidsPicture {
  svg: string;
  width: number;
  height: number;
}

/** The drawing as an SVG document, with its measure. */
export function solidsSvg(given: Solids): SolidsPicture {
  const v = fitted(given);
  // Far to near, by what lies under or behind what: a seed on a towel was painted under the towel by its centre alone.
  const order = v.parts.map((p, i) => ({ p, i, box: extentOf(p, v.open) })).sort((a, b) => Number(a.p.clear) - Number(b.p.clear) || before(a.box, b.box));
  const body = order.map(({ p }) => drawPart(p, v.open)).join('');
  const all = v.parts.flatMap((p) => shapeOf(p).points.map((q) => project(placeOf(p, v.open)(q))));
  const xs = all.map((q) => q[0]);
  const ys = all.map((q) => q[1]);
  const [left, right, top, bottom] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const marks: string[] = [];
  const rows: number[] = [];
  if (v.labels) {
    // Names on the side their part leans to, each column in the order of its parts down the page, never closer than a row.
    const mid = (left + right) / 2;
    const named = v.parts.map((p, i) => {
      const c = project(placeOf(p, v.open)([0, 0, 0]));
      const side = c[0] >= mid;
      return { p, i, side, at: anchorOf(p, v.open, side) };
    });
    for (const side of [true, false]) {
      let last = -Infinity;
      for (const n of named.filter((x) => x.side === side).sort((a, b) => a.at[1] - b.at[1])) {
        const y = Math.max(n.at[1], last + ROW);
        last = y;
        rows.push(y);
        const end = side ? right + 34 : left - 34;
        marks.push(stroke(d([n.at, [side ? n.at[0] + 8 : n.at[0] - 8, y], [end, y]]), FLAT.soft, FINE));
        marks.push(fillOf(d([[n.at[0] - 1.1, n.at[1] - 1.1], [n.at[0] + 1.1, n.at[1] - 1.1], [n.at[0] + 1.1, n.at[1] + 1.1], [n.at[0] - 1.1, n.at[1] + 1.1]], true), FLAT.ink));
        marks.push(nameAt(n.p.name.trim() || `part ${n.i + 1}`, side ? end + 5 : end - 5, y + CAP / 2, side));
      }
    }
  }
  const widest = Math.max(0, ...v.parts.map((p) => lettered(p.name.trim() || 'part 00').width));
  const pad = 14;
  const x0 = (v.labels ? left - 39 - widest : left) - pad;
  const x1 = (v.labels ? right + 39 + widest : right) + pad;
  const y0 = Math.min(top, ...rows.map((y) => y - CAP)) - pad;
  const y1 = Math.max(bottom, ...rows.map((y) => y + CAP)) + pad;
  const width = Math.ceil(x1 - x0);
  const height = Math.ceil(y1 - y0);
  const moved = (svg: string) => svg.replace(/d="([^"]*)"/g, (_, path: string) => `d="${path.replace(/(-?[\d.]+) (-?[\d.]+)/g, (__, x: string, y: string) => `${Math.round((Number(x) - x0) * 10) / 10} ${Math.round((Number(y) - y0) * 10) / 10}`)}"`);
  const names = v.parts.map((p) => p.name.trim()).filter(Boolean).join(', ');
  const label = `A drawing of it taken apart: ${names}`.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width * 3}" height="${height * 3}" role="img" aria-label="${label}"><rect width="${width}" height="${height}" fill="${FLAT.page}"/>${moved(body + marks.join(''))}</svg>`;
  return { svg, width, height };
}
