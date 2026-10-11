import { createHash } from 'node:crypto';
import { binarySearch, describeResult, describeStart, describeStep, SlideVisualSchema } from '@folio/core';
import { describe, expect, it } from 'vitest';
import { between, framePng, keyframes, paintSvg, renderFrame, stillFigure } from '../src';

const LIST = [3, 8, 12, 17, 23, 31, 42, 56, 71];
const sha = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex').slice(0, 16);
const drawers = (svg: string) => [...svg.matchAll(/data-drawer="(\d+)" data-state="(\w+)"/g)].map((m) => m[2]);

describe('the pictures of a search', () => {
  it('are the model\'s frames: a start, one for each comparison, and an end only when the search runs out', () => {
    const found = binarySearch({ values: LIST, target: 42 });
    expect(keyframes(found).map((f) => f.kind)).toEqual(['start', 'step', 'step']);
    const missing = binarySearch({ values: LIST, target: 40 });
    expect(keyframes(missing).map((f) => f.kind)).toEqual(['start', ...missing.frames.map(() => 'step'), 'end']);
    expect(keyframes(binarySearch({ values: [], target: 5 })).map((f) => f.kind)).toEqual(['start']);
  });

  it('carry the model\'s own sentences, word for word', () => {
    const model = binarySearch({ values: LIST, target: 40 });
    const frames = keyframes(model);
    expect(frames[0]!.caption).toBe(describeStart(model));
    expect(frames[1]!.caption).toBe(describeStep(model, model.frames[0]!));
    expect(frames.at(-1)!.caption).toBe(describeResult(model));
    const found = binarySearch({ values: LIST, target: 42 });
    expect(keyframes(found).at(-1)!.caption).toBe(`${describeStep(found, found.frames.at(-1)!)} ${describeResult(found)}`);
  });

  it('put every part where the step has it: the fences round what is left, the middle drawer out, the rest set aside', () => {
    const model = binarySearch({ values: LIST, target: 42 });
    const [start, first, second] = keyframes(model);
    expect(start!.pose).toMatchObject({ lo: 0, hi: 9 });
    expect(drawers(renderFrame(model, start!))).toEqual(LIST.map(() => 'play'));
    // Step 1 looks at position 5 (23) with everything in play.
    expect(first!.pose).toMatchObject({ lo: 0, hi: 9 });
    expect(first!.pose.pull).toEqual([0, 0, 0, 0, 1, 0, 0, 0, 0]);
    // Step 2: positions 6 to 9 are left, the middle is position 7 (42), found.
    expect(second!.pose).toMatchObject({ lo: 5, hi: 9 });
    expect(drawers(renderFrame(model, second!))).toEqual(['aside', 'aside', 'aside', 'aside', 'aside', 'play', 'found', 'play', 'play']);
  });

  it('end with the fences met and every drawer set aside when the number is not there', () => {
    const model = binarySearch({ values: LIST, target: 40 });
    const end = keyframes(model).at(-1)!;
    expect(end.pose.lo).toBe(end.pose.hi);
    expect(new Set(end.pose.state)).toEqual(new Set(['aside']));
  });

  it('hold at the ends of the list, with one number, and with a number that stands twice', () => {
    for (const [values, target] of [[LIST, 3], [LIST, 71], [[5], 5], [[5], 9], [[2, 4, 4, 4, 9], 4]] as const) {
      const model = binarySearch({ values: [...values], target });
      for (const f of keyframes(model)) {
        expect(f.pose.pull).toHaveLength(values.length);
        expect(f.pose.lo).toBeLessThanOrEqual(f.pose.hi);
        expect(renderFrame(model, f)).toContain('<svg');
      }
    }
    const twice = binarySearch({ values: [2, 4, 4, 4, 9], target: 4 });
    expect(keyframes(twice).at(-1)!.caption).toContain('need not be the leftmost');
  });

  it('move a part of the way between two steps without leaving the rail', () => {
    const [a, b] = keyframes(binarySearch({ values: LIST, target: 42 })).slice(1);
    const half = between(a!.pose, b!.pose, 0.5);
    expect(half.lo).toBe(2.5);
    expect(half.pull[4]).toBe(0.5);
    expect(half.pull[6]).toBe(0.5);
  });
});

describe('a picture as a file', () => {
  const model = binarySearch({ values: LIST, target: 42 });
  const frames = keyframes(model);

  it('is the same picture every time, with nothing in it but drawing', () => {
    const svg = renderFrame(model, frames[2]!);
    expect(renderFrame(model, frames[2]!)).toBe(svg);
    expect(svg).not.toMatch(/<script|<foreignObject|href=|url\(|\son\w+=|<image|<text|javascript:/i);
    expect(svg).toContain(`aria-label="${frames[2]!.caption}"`);
  });

  it('is a PNG of 1280 by 760 made without a browser, the same bytes each time, and another picture a step', () => {
    const one = framePng(renderFrame(model, frames[1]!));
    expect([...one.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const view = new DataView(one.buffer, one.byteOffset);
    expect([view.getUint32(16), view.getUint32(20)]).toEqual([1280, 760]);
    expect(sha(framePng(renderFrame(model, frames[1]!)))).toBe(sha(one));
    expect(sha(framePng(renderFrame(model, frames[2]!)))).not.toBe(sha(one));
  });

  it('paints the drawer looked at with the one black edge of the picture, which the start does not have', () => {
    const black = (svg: string) => paintSvg(svg, 1).data.reduce((n, v, i) => n + (i % 3 === 0 && v < 12 ? 1 : 0), 0);
    expect(black(renderFrame(model, frames[0]!))).toBe(0);
    expect(black(renderFrame(model, frames[2]!))).toBeGreaterThan(0);
  });

  it('agrees with the copies kept of it: a change to the kit or the drawing shows here first', () => {
    // sha256, first 16 hex digits, of each picture's SVG for the list above and 42. Change them only on purpose.
    expect(frames.map((f) => sha(renderFrame(model, f)))).toMatchSnapshot();
  });
});

describe('a demonstration in a file that cannot move', () => {
  it('has every picture with its sentence and the table of steps, all from one model', () => {
    const still = stillFigure({ kind: 'figure', figure: 'binarySearch', values: LIST, target: 40 });
    const model = binarySearch({ values: LIST, target: 40 });
    expect(still.problem).toBeNull();
    expect(still.frames.map((f) => f.caption)).toEqual(keyframes(model).map((f) => f.caption));
    expect(still.table.rows).toHaveLength(model.frames.length);
  });

  it('says why when its list cannot be searched, and draws nothing', () => {
    expect(stillFigure({ kind: 'figure', figure: 'binarySearch', values: [5, 3, 9], target: 3 })).toMatchObject({ problem: 'unsorted', frames: [] });
  });
});

describe('what a course file can ask for', () => {
  it('is a figure by name from Folio\'s list, with numbers', () => {
    expect(SlideVisualSchema.safeParse({ kind: 'figure', figure: 'binarySearch', values: [1, 2, 3], target: 2 }).success).toBe(true);
  });

  it('is never a figure Folio does not keep, a script, an address, or more numbers than fit', () => {
    expect(SlideVisualSchema.safeParse({ kind: 'figure', figure: 'https://example.com/figure.js', values: [1], target: 1 }).success).toBe(false);
    expect(SlideVisualSchema.safeParse({ kind: 'figure', figure: 'binarySearch', values: ['<script>alert(1)</script>'], target: 1 }).success).toBe(false);
    expect(SlideVisualSchema.safeParse({ kind: 'figure', figure: 'binarySearch', values: Array.from({ length: 16 }, (_, i) => i), target: 1 }).success).toBe(false);
    const kept = SlideVisualSchema.parse({ kind: 'figure', figure: 'binarySearch', values: [1], target: 1, script: 'alert(1)', src: 'x.js' });
    expect(Object.keys(kept).sort()).toEqual(['figure', 'kind', 'target', 'values']);
  });
});
