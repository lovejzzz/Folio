import { describe, expect, it } from 'vitest';
import type { SlideVisual } from '@folio/core';
import { SlideVisualSchema } from '@folio/core';
import { layersSvg, lettered, paintSvg, svgToPng } from '../src';

type Layers = Extract<SlideVisual, { kind: 'layers' }>;

/** A display's layers, the drawing this kind was made for. */
const display = (open = true, labels = true): Layers =>
  SlideVisualSchema.parse({
    kind: 'layers',
    open,
    labels,
    parts: [
      { name: 'Cover glass' },
      { name: 'Front polarizer', look: 'hatch' },
      { name: 'Black matrix', look: 'grid' },
      { name: 'Blue filters', look: 'strips', tint: 'blue' },
      { name: 'Green filters', look: 'strips', tint: 'green' },
      { name: 'Red filters', look: 'strips', tint: 'red' },
      { name: 'Liquid crystal', look: 'dots' },
      { name: 'Thin-film transistors', look: 'cells' },
      { name: 'Rear polarizer', look: 'hatch' },
      { name: 'Backlight' },
    ],
  }) as Layers;

describe('an exploded drawing of layers', () => {
  it('is one SVG of straight paths only, which the PNG painter reads whole', () => {
    const pic = layersSvg(display());
    expect(pic.svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 \d+ \d+"/);
    // Nothing the painter cannot read: no text, no curves, no transforms.
    expect(pic.svg).not.toMatch(/<text|transform=| [CcQqAa]\d/);
    for (const [, path] of pic.svg.matchAll(/ d="([^"]*)"/g)) expect(path).toMatch(/^[MLZ\d .-]+$/);
    const canvas = paintSvg(pic.svg, 1);
    expect([canvas.width, canvas.height]).toEqual([pic.width, pic.height]);
    expect(svgToPng(pic.svg, 1).slice(1, 4)).toEqual(new Uint8Array([80, 78, 71]));
  });

  it('is taller apart than together, and names every part only when asked', () => {
    expect(layersSvg(display(true)).height).toBeGreaterThan(layersSvg(display(false)).height * 2);
    const named = layersSvg(display(true, true)).svg;
    const bare = layersSvg(display(true, false));
    expect(named.length).toBeGreaterThan(bare.svg.length);
    // Without names the picture is no wider than its plates.
    expect(bare.width).toBeLessThan(layersSvg(display(true, true)).width);
  });

  it('colours a tinted part and draws a plain part in ink', () => {
    const svg = layersSvg(display()).svg;
    for (const line of ['#3a63c9', '#2e8f4e', '#c94040']) expect(svg).toContain(line);
    expect(svg).not.toContain('#6d4fbf');
  });

  it('sets names in the app\'s typeface as written, subscripts small, leaving a space for a character it has no outline for', () => {
    expect(lettered('Ab').width).not.toBeCloseTo(lettered('ab').width);
    expect(lettered('CO₂').width).toBeLessThan(lettered('CO2').width);
    expect(lettered('a€b').width).toBeCloseTo(lettered('a b').width);
    expect(lettered('').width).toBe(0);
  });
});
