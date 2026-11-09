/**
 * Every colour a drawing names, softened into the Minicharts palette as the skill's build does (`assets/build.py`,
 * `soften`): a little lighter, a little less saturated, and turned toward the nearest of six pigments. A drawing's
 * code is softened before it runs, so whatever hex the writer picks lands in the same family as the kit's own.
 */

const SAT = 0.8;
const LIFT = 0.08;
/** Hue in degrees, and the most saturation a colour near it may keep. */
const PIGMENTS: readonly (readonly [number, number])[] = [
  [13, 0.56],
  [40, 0.74],
  [86, 0.34],
  [150, 0.28],
  [208, 0.3],
  [345, 0.42],
];

type Hls = [number, number, number];

/** Python's colorsys.rgb_to_hls, which the skill's palette was tuned with. */
function toHls(r: number, g: number, b: number): Hls {
  const hi = Math.max(r, g, b);
  const lo = Math.min(r, g, b);
  const l = (lo + hi) / 2;
  if (hi === lo) return [0, l, 0];
  const s = l <= 0.5 ? (hi - lo) / (hi + lo) : (hi - lo) / (2 - hi - lo);
  const rc = (hi - r) / (hi - lo);
  const gc = (hi - g) / (hi - lo);
  const bc = (hi - b) / (hi - lo);
  const h = r === hi ? bc - gc : g === hi ? 2 + rc - bc : 4 + gc - rc;
  return [(((h / 6) % 1) + 1) % 1, l, s];
}

function channel(m1: number, m2: number, hue: number): number {
  const h = ((hue % 1) + 1) % 1;
  if (h < 1 / 6) return m1 + (m2 - m1) * h * 6;
  if (h < 0.5) return m2;
  if (h < 2 / 3) return m1 + (m2 - m1) * (2 / 3 - h) * 6;
  return m1;
}

/** Python's colorsys.hls_to_rgb. */
function toRgb(h: number, l: number, s: number): [number, number, number] {
  if (s === 0) return [l, l, l];
  const m2 = l <= 0.5 ? l * (1 + s) : l + s - l * s;
  const m1 = 2 * l - m2;
  return [channel(m1, m2, h + 1 / 3), channel(m1, m2, h), channel(m1, m2, h - 1 / 3)];
}

const near = (a: number, b: number): number => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

export function softenHex(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
  let [h, l, s] = toHls(r, g, b);
  if (l > 0.3) l += (0.8 - l) * LIFT;
  if (l > 0.2 && l < 0.58) l += (0.62 - l) * 0.42;
  if (s > 0.04) {
    const deg = h * 360;
    const [hue, cap] = PIGMENTS.reduce((best, p) => (near(p[0], deg) < near(best[0], deg) ? p : best));
    const e = ((((hue - deg + 180) % 360) + 360) % 360) - 180;
    h = (((deg + e * 0.6) % 360) + 360) % 360 / 360;
    s = Math.min(cap, s * SAT);
  }
  // Python rounds half to even; the difference is one step in a channel at most, which no eye sees.
  return `#${toRgb(h, l, s).map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`;
}

export const soften = (code: string): string => code.replace(/#[0-9a-fA-F]{6}\b/g, softenHex);
