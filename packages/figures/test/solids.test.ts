import { describe, expect, it } from 'vitest';
import { SlideVisualSchema, type SlideVisual } from '@folio/core';
import { paintSvg, solidsHidden, solidsSvg } from '../src';

type Solids = Extract<SlideVisual, { kind: 'solids' }>;
const make = (parts: unknown[], open = true): Solids => SlideVisualSchema.parse({ kind: 'solids', open, parts }) as Solids;

/** A bean seed opened, as a Grade 2 sample draws it. */
const bean = (open = true) =>
  make(
    [
      { name: 'Seed coat', shape: 'egg', size: [44, 29, 19], at: [0, 0, 0], apart: [0, 0, 86], tint: 'amber', clear: true },
      { name: 'Food, one half', shape: 'half', size: [40, 26, 8], at: [0, 0, 0.5], apart: [0, 0, 50], axis: 'z', tint: 'amber' },
      { name: 'Baby plant', shape: 'egg', size: [9, 4, 3], at: [-15, 0, 0], apart: [0, 0, 16], tint: 'green' },
      { name: 'Food, other half', shape: 'half', size: [40, 26, 8], at: [0, 0, -0.5], axis: '-z', tint: 'amber' },
    ],
    open,
  );

describe('a thing taken apart, drawn from simple solids', () => {
  it('is one SVG of straight paths only, which the PNG painter reads whole', () => {
    const pic = solidsSvg(bean());
    expect(pic.svg).not.toMatch(/<text|transform=| [CcQqAa]\d/);
    for (const [, path] of pic.svg.matchAll(/ d="([^"]*)"/g)) expect(path).toMatch(/^[MLZ\d .-]+$/);
    expect([paintSvg(pic.svg, 1).width, paintSvg(pic.svg, 1).height]).toEqual([pic.width, pic.height]);
  });

  it('is drawn at one size whatever units it is given in', () => {
    const big = make(bean().parts.map((p) => ({ ...p, size: p.size.map((n) => n * 4), at: p.at.map((n) => n * 4), apart: p.apart.map((n) => n * 4) })));
    expect(solidsSvg(big).width).toBe(solidsSvg(bean()).width);
  });

  it('says which parts drawn apart still lie under another, and not one resting on top', () => {
    expect(solidsHidden(bean())).toEqual([]);
    // The baby plant not lifted clear of the half above it is covered by it.
    const close = make(bean().parts.map((p) => (p.name === 'Food, one half' ? { ...p, apart: [0, 0, 10] } : p.name === 'Baby plant' ? { ...p, apart: [0, 0, 0] } : p)));
    expect(solidsHidden(close)).toContain('Food, one half / Baby plant');
    // Seeds on a towel lie on it: nothing is hidden.
    const towel = make([
      { name: 'Towel', shape: 'box', size: [100, 70, 4], at: [0, 0, -4] },
      { name: 'Seed', shape: 'egg', size: [25, 15, 8], at: [-20, 0, 2] },
    ]);
    expect(solidsHidden(towel)).toEqual([]);
    const seedFirst = solidsSvg(towel).svg;
    expect(seedFirst.indexOf('#f1f1ee')).toBeGreaterThan(-1);
  });

  it('takes only shapes and numbers from a course file: a shape it does not have is refused', () => {
    expect(SlideVisualSchema.safeParse({ kind: 'solids', parts: [{ name: 'X', shape: 'torus', size: [1, 1, 1], at: [0, 0, 0] }] }).success).toBe(false);
    expect(SlideVisualSchema.safeParse({ kind: 'solids', parts: [{ name: 'X', shape: 'box', size: [1, 1, 1e6], at: [0, 0, 0] }] }).success).toBe(false);
  });
});
