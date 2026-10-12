import { zlibSync } from 'fflate';

/**
 * A small painter for the figures' pictures: filled polygons and thin lines onto a white page, and the page as a PNG.
 * A Word file takes no SVG, and a picture taken of the screen would differ from one browser to the next and need the
 * page open; this draws the same polygons the SVG holds with plain arithmetic, so a frame's PNG is the same bytes
 * wherever it is made. Polygons are filled by the nonzero rule, four rows of samples to a pixel, with exact cover
 * along each row.
 */

export type Point = [number, number];
export type Color = [number, number, number];

export interface Canvas {
  width: number;
  height: number;
  /** RGB, a byte each, row by row. */
  data: Uint8Array;
}

const ROWS = 4;

export function canvasOf(width: number, height: number, [r, g, b]: Color): Canvas {
  const data = new Uint8Array(width * height * 3);
  for (let i = 0; i < data.length; i += 3) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
  return { width, height, data };
}

interface Edge {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  dir: number;
}

function edgesOf(polygons: readonly Point[][]): Edge[] {
  const edges: Edge[] = [];
  for (const poly of polygons) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!;
      const b = poly[(i + 1) % poly.length]!;
      if (a[1] === b[1]) continue;
      edges.push(a[1] < b[1] ? { x0: a[0], y0: a[1], x1: b[0], y1: b[1], dir: 1 } : { x0: b[0], y0: b[1], x1: a[0], y1: a[1], dir: -1 });
    }
  }
  return edges;
}

/** The spans of one row of samples that lie inside, by the nonzero rule. */
function spansAt(edges: readonly Edge[], y: number): Point[] {
  const hits: Point[] = [];
  for (const e of edges) if (y >= e.y0 && y < e.y1) hits.push([e.x0 + ((y - e.y0) / (e.y1 - e.y0)) * (e.x1 - e.x0), e.dir]);
  hits.sort((a, b) => a[0] - b[0]);
  const spans: Point[] = [];
  let winding = 0;
  let from = 0;
  for (const [x, dir] of hits) {
    if (winding === 0) from = x;
    winding += dir;
    if (winding === 0 && x > from) spans.push([from, x]);
  }
  return spans;
}

function addSpan(cover: Float32Array, left: number, width: number, from: number, to: number): void {
  const a = Math.max(from - left, 0);
  const b = Math.min(to - left, width);
  if (b <= a) return;
  const first = Math.floor(a);
  const last = Math.min(Math.ceil(b), width) - 1;
  for (let x = first; x <= last; x++) cover[x] = cover[x]! + (Math.min(b, x + 1) - Math.max(a, x)) / ROWS;
}

/** Fill polygons (in pixels) with one colour. Pieces that overlap are painted once: a line's joints do not darken. */
export function fill(canvas: Canvas, polygons: readonly Point[][], [r, g, b]: Color, alpha = 1): void {
  const edges = edgesOf(polygons);
  if (!edges.length) return;
  const xs = polygons.flat().map((p) => p[0]);
  const left = Math.max(0, Math.floor(Math.min(...xs)));
  const right = Math.min(canvas.width, Math.ceil(Math.max(...xs)));
  const top = Math.max(0, Math.floor(Math.min(...edges.map((e) => e.y0))));
  const bottom = Math.min(canvas.height, Math.ceil(Math.max(...edges.map((e) => e.y1))));
  const width = right - left;
  if (width <= 0) return;
  const cover = new Float32Array(width);
  for (let y = top; y < bottom; y++) {
    cover.fill(0);
    for (let s = 0; s < ROWS; s++) for (const [from, to] of spansAt(edges, y + (s + 0.5) / ROWS)) addSpan(cover, left, width, from, to);
    for (let x = 0; x < width; x++) {
      const a = Math.min(1, cover[x]!) * alpha;
      if (a <= 0) continue;
      const at = (y * canvas.width + left + x) * 3;
      canvas.data[at] = Math.round(canvas.data[at]! + (r - canvas.data[at]!) * a);
      canvas.data[at + 1] = Math.round(canvas.data[at + 1]! + (g - canvas.data[at + 1]!) * a);
      canvas.data[at + 2] = Math.round(canvas.data[at + 2]! + (b - canvas.data[at + 2]!) * a);
    }
  }
}

/** Eight directions round a point, written out so no engine's sine is asked. */
const ROUND: Point[] = [[1, 0], [0.70710678, 0.70710678], [0, 1], [-0.70710678, 0.70710678], [-1, 0], [-0.70710678, -0.70710678], [0, -1], [0.70710678, -0.70710678]];

/** A disc as a polygon that turns the same way as every piece of a line. */
export const disc = ([x, y]: Point, radius: number): Point[] => ROUND.map(([c, s]): Point => [x + c * radius, y + s * radius]);

/** The pieces of a line of a given width with round ends and joints: a box a segment and a disc a point. */
export function strokePieces(points: readonly Point[], width: number, closed: boolean): Point[][] {
  const half = width / 2;
  const pieces: Point[][] = points.map((p) => disc(p, half));
  const count = closed ? points.length : points.length - 1;
  for (let i = 0; i < count; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!length) continue;
    const nx = (-(b[1] - a[1]) / length) * half;
    const ny = ((b[0] - a[0]) / length) * half;
    // Turned the way the discs turn, so where pieces overlap the count only rises.
    pieces.push([[a[0] - nx, a[1] - ny], [b[0] - nx, b[1] - ny], [b[0] + nx, b[1] + ny], [a[0] + nx, a[1] + ny]]);
  }
  return pieces;
}

const CRC = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function chunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(body.length + 12);
  const view = new DataView(out.buffer);
  view.setUint32(0, body.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(body, 8);
  let crc = 0xffffffff;
  for (let i = 4; i < 8 + body.length; i++) crc = CRC[(crc ^ out[i]!) & 0xff]! ^ (crc >>> 8);
  view.setUint32(8 + body.length, (crc ^ 0xffffffff) >>> 0);
  return out;
}

/** The page as a PNG: eight bits a channel, no alpha, every row unfiltered. */
export function png(canvas: Canvas): Uint8Array {
  const { width, height, data } = canvas;
  const head = new Uint8Array(13);
  const view = new DataView(head.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  head.set([8, 2, 0, 0, 0], 8);
  const rows = new Uint8Array((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) rows.set(data.subarray(y * width * 3, (y + 1) * width * 3), y * (width * 3 + 1) + 1);
  const parts = [Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', zlibSync(rows, { level: 9 })), chunk('IEND', new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
