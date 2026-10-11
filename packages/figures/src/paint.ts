import { canvasOf, disc, fill, png, strokePieces, type Canvas, type Color, type Point } from './raster';

/**
 * A figure's SVG, painted. The Anatomy kit writes a small, fixed kind of SVG: groups, paths of straight lines, and
 * dots, each coloured by its class from the kit's light theme. This reads exactly that and paints it in the same
 * order with the same colours, which are copied here from the kit's stylesheet (vendor/anatomy, `ISO_CSS`, the
 * light theme). The soft shadow under the base is left out: it is a blur, and nothing rests on it.
 */

const hex = (h: string): Color => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const PAPER = hex('#fbfbfa');
const FACE = hex('#ffffff');
const SHADES = ['#dcdcd9', '#e5e5e2', '#ededea', '#f4f4f1'].map(hex);
const LIT_SHADE = hex('#eeeeeb');
const LINES: Record<string, Color> = { hi: hex('#26262a'), mid: hex('#8a8a8f'), lo: hex('#b4b4b8'), faint: hex('#d4d4d6'), lit: hex('#000000') };
const DOT = hex('#3a3a3e');
const DOT_ALPHA: Record<string, number> = { hi: 0.85, mid: 0.45, lo: 0.22, faint: 0.12 };
const WEIGHT = 0.6;
const NUMERAL = 1.1;

type Attrs = Record<string, string>;

function attrsOf(text: string): Attrs {
  const out: Attrs = {};
  for (const m of text.matchAll(/([\w-]+)="([^"]*)"/g)) out[m[1]!] = m[2]!;
  return out;
}

/** A path of M, L and Z, which is all the kit writes: its runs of points, each closed or open. */
export function runsOf(d: string, scale: number): { points: Point[]; closed: boolean }[] {
  const runs: { points: Point[]; closed: boolean }[] = [];
  for (const m of d.matchAll(/([MLZ])\s*(-?[\d.]+)?[\s,]*(-?[\d.]+)?/g)) {
    if (m[1] === 'Z') {
      if (runs.length) runs.at(-1)!.closed = true;
      continue;
    }
    if (m[1] === 'M') runs.push({ points: [], closed: false });
    runs.at(-1)?.points.push([Number(m[2]) * scale, Number(m[3]) * scale]);
  }
  return runs.filter((r) => r.points.length);
}

function paintPath(canvas: Canvas, a: Attrs, lit: boolean, scale: number): void {
  const kinds = (a.class ?? '').split(/\s+/);
  const runs = runsOf(a.d ?? '', scale);
  if (!runs.length || kinds.includes('iso-halo')) return;
  if (kinds.includes('iso-line')) {
    const tone = lit && kinds.includes('iso-edge') ? 'lit' : (a['data-tone'] ?? 'lo');
    const width = (kinds.includes('fig-numeral') ? NUMERAL : WEIGHT) * scale;
    // Every run of one path under one fill: where they cross, the line is no darker.
    fill(canvas, runs.flatMap((r) => (r.points.length > 1 ? strokePieces(r.points, width, r.closed) : [])), LINES[tone] ?? LINES.lo!);
    return;
  }
  const polygons = runs.map((r) => r.points);
  if (kinds.includes('iso-fill')) fill(canvas, polygons, lit ? FACE : PAPER);
  else if (kinds.includes('iso-shade')) fill(canvas, polygons, lit ? LIT_SHADE : (SHADES[Number(a['data-shade'] ?? 0)] ?? SHADES[0]!));
  else if (kinds.includes('iso-top')) fill(canvas, polygons, FACE);
}

/** The picture at `scale` pixels to a unit of its own measure, as a page of pixels. */
export function paintSvg(svg: string, scale = 2): Canvas {
  const box = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  const canvas = canvasOf(Math.round(Number(box?.[1] ?? 0) * scale), Math.round(Number(box?.[2] ?? 0) * scale), PAPER);
  const body = svg.replace(/<style>[\s\S]*?<\/style>/g, '');
  const groups: Attrs[] = [];
  for (const m of body.matchAll(/<(\/?)(g|path|circle)\b([^>]*?)\/?>/g)) {
    if (m[2] === 'g') {
      if (m[1]) groups.pop();
      else groups.push(attrsOf(m[3]!));
      continue;
    }
    const a = attrsOf(m[3]!);
    const lit = groups.some((g) => 'data-lit' in g);
    if (m[2] === 'path') paintPath(canvas, a, lit, scale);
    else {
      const tone = groups.findLast((g) => (g.class ?? '').includes('iso-dots'))?.['data-tone'] ?? '';
      fill(canvas, [disc([Number(a.cx) * scale, Number(a.cy) * scale], Number(a.r) * scale)], DOT, (DOT_ALPHA[tone] ?? 0.32) * Number(a['fill-opacity'] ?? 1));
    }
  }
  return canvas;
}

/** A figure's SVG as a PNG file. */
export const svgToPng = (svg: string, scale = 2): Uint8Array => png(paintSvg(svg, scale));
