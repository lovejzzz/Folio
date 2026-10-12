import { createHash } from 'node:crypto';
import { binarySearch, binarySearchProblem, describeResult, describeStart, describeStep, enteredFaults, figureProblem, SlideVisualSchema } from '@folio/core';
import { describe, expect, it } from 'vitest';
import { between, FLAT, flatSvg, framePng, keyframes, paintSvg, renderFrame, stillFigure } from '../src';
import { cabinetLimit, numeral, numeralOf, strokesOf } from '../src/digits';

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
    const still = stillFigure({ kind: 'figure', figure: 'binarySearch', look: 'cabinet', values: LIST, target: 40 });
    const model = binarySearch({ values: LIST, target: 40 });
    expect(still.problem).toBeNull();
    expect(still.frames.map((f) => f.caption)).toEqual(keyframes(model).map((f) => f.caption));
    expect(still.table.rows).toHaveLength(model.frames.length);
  });

  it('says why when its list cannot be searched, and draws nothing', () => {
    expect(stillFigure({ kind: 'figure', figure: 'binarySearch', look: 'cabinet', values: [5, 3, 9], target: 3 })).toMatchObject({ problem: 'unsorted', frames: [] });
  });
});

describe('what a course file can ask for', () => {
  it('is a figure by name from Folio\'s list, with numbers', () => {
    expect(SlideVisualSchema.safeParse({ kind: 'figure', figure: 'binarySearch', look: 'cabinet', values: [1, 2, 3], target: 2 }).success).toBe(true);
  });

  it('is never a figure Folio does not keep, a script, an address, or more numbers than fit', () => {
    expect(SlideVisualSchema.safeParse({ kind: 'figure', figure: 'https://example.com/figure.js', values: [1], target: 1 }).success).toBe(false);
    expect(SlideVisualSchema.safeParse({ kind: 'figure', figure: 'binarySearch', look: 'cabinet', values: ['<script>alert(1)</script>'], target: 1 }).success).toBe(false);
    const kept = SlideVisualSchema.parse({ kind: 'figure', figure: 'binarySearch', look: 'cabinet', values: [1], target: 1, script: 'alert(1)', src: 'x.js' });
    expect(Object.keys(kept).sort()).toEqual(['figure', 'kind', 'look', 'target', 'values']);
  });

  it('keeps what was typed and is not yet numbers, and is unfinished until it is put right: in a file opened again, and in every export', () => {
    const draft = SlideVisualSchema.parse({ kind: 'figure', figure: 'binarySearch', look: 'cabinet', values: [1, 2, 3], target: 2, entered: { values: '1, nope, 3' } });
    if (draft.kind !== 'figure') throw new Error('not a figure');
    expect(figureProblem(draft)).toBe('unfinished');
    expect(enteredFaults(draft.entered)).toEqual(['nope']);
    const still = stillFigure(draft);
    expect(still).toMatchObject({ problem: 'unfinished', frames: [] });
    expect(still.note).toContain('“1, nope, 3”');
    // The numbers it had before are not passed off as its numbers.
    expect(still.table.rows).toEqual([]);
    expect(figureProblem({ ...draft, entered: undefined })).toBeNull();
  });
});

describe('a number on a label', () => {
  /** The strokes drawn on drawer `i`: the numeral's own path, counted by its segments. */
  const drawn = (svg: string, i: number) => {
    const group = svg.split(`data-drawer="${i}"`)[1]!.split('data-drawer=')[0]!;
    const paths = [...group.matchAll(/<path class="iso-line(?: fig-numeral)?" data-tone="(?:hi|lo|lit)" d="((?:M[-\d. ]+L[-\d. ]+)+)"\/>/g)].map((m) => m[1]!.split('M').length - 1);
    // The first such path in a drawer is its label; after the last drawer comes the card with the number sought.
    return paths[0];
  };

  it('is the number itself, digit for digit, as its sentence has it: nothing is rounded', () => {
    const values = [-2.5, -1, 0, 0.125, 0.5, 7, 12.75, 480];
    const model = binarySearch({ values, target: 0.125 });
    const frames = keyframes(model);
    expect(frames[0]!.caption).toContain('-2.5, -1, 0, 0.125, 0.5, 7, 12.75, 480');
    const svg = renderFrame(model, frames[0]!);
    values.forEach((v, i) => {
      expect(numeral(v)).toBe(String(v));
      expect(drawn(svg, i), String(v)).toBe(strokesOf(String(v)).strokes.length);
    });
    // 0.125 and 0 are different pictures: the label is not the same strokes.
    expect(strokesOf(numeral(0.125)).strokes.length).not.toBe(strokesOf(numeral(0)).strokes.length);
  });

  it('is never rounded: a list the labels cannot write in full is still searched, and told in words with the reason there is no picture', () => {
    // As it was found: three drawers and the card all read 0 beside a sentence that said 1e-8.
    const tiny = { values: [-0.00000001, 0, 0.00000001], target: 0.00000001 };
    expect(binarySearchProblem(tiny)).toBeNull();
    expect(cabinetLimit(tiny.values, tiny.target)).toBe('tooLong');
    const still = stillFigure({ kind: 'figure', figure: 'binarySearch', look: 'cabinet', ...tiny });
    expect(still).toMatchObject({ problem: null, limit: 'tooLong' });
    expect(still.note).toContain('never round');
    expect(still.frames.every((f) => f.svg === null)).toBe(true);
    expect(still.frames.at(-1)!.caption).toContain('1e-8 was found at position 3');
    expect(still.table.rows.length).toBeGreaterThan(0);
    for (const n of [1e21, 1e-7, 123456, -12345, 0.33333, 1 / 3]) expect(numeralOf(n), String(n)).toBeNull();
    for (const n of [0, -0, 5, -9999, 99999, 0.001, -0.25, 12.75]) expect(numeralOf(n), String(n)).not.toBeNull();
  });

  it('is searched whatever its length: more numbers than the cabinet has drawers are told in words', () => {
    const long = { values: Array.from({ length: 40 }, (_, i) => i * 3), target: 51 };
    expect(binarySearchProblem(long)).toBeNull();
    const still = stillFigure({ kind: 'figure', figure: 'binarySearch', look: 'cabinet', ...long });
    expect(still).toMatchObject({ problem: null, limit: 'tooMany' });
    expect(still.frames.at(-1)!.caption).toContain('51 was found at position 18');
    expect(SlideVisualSchema.safeParse({ kind: 'figure', figure: 'binarySearch', look: 'cabinet', values: Array.from({ length: 61 }, (_, i) => i), target: 1 }).success).toBe(false);
  });

  it('never passes over a character it has no strokes for', () => {
    expect(() => strokesOf('1e-8')).toThrow();
    expect(() => numeral(1e-8)).toThrow();
  });
});

describe('the flat look: a row of numbers for a projector and a page', () => {
  const model = binarySearch({ values: LIST, target: 40 });
  const frames = keyframes(model);
  const at = (i: number) => renderFrame(model, frames[i]!, 'flat');
  const states = (svg: string) => [...svg.matchAll(/data-drawer="(\d+)" data-state="(\w+)"/g)].map((m) => m[2]);

  it('is drawn from the same poses as the cabinet: the same states, step for step', () => {
    for (const [i, f] of frames.entries()) expect(states(at(i)), `frame ${i}`).toEqual(drawers(renderFrame(model, f)));
    expect(states(at(1))).toEqual(['play', 'play', 'play', 'play', 'look', 'play', 'play', 'play', 'play']);
  });

  it('tells each state by more than colour: a heavy frame and an arrow, hatching, a bracket, a filled cell', () => {
    const look = at(2);
    const cell = (svg: string, i: number) => svg.split(`data-drawer="${i}"`)[1]!.split('</g>')[0]!;
    // Compared: a frame twice as heavy as its neighbours', an arrow, and the comparison written out.
    expect(cell(look, 6)).toContain(`stroke="${FLAT.accent}" stroke-width="4"`);
    expect(cell(look, 7)).toContain(`stroke="${FLAT.ink}" stroke-width="2"`);
    // Set aside: hatched (many short lines of the rule colour) and thin.
    expect(cell(look, 0).split('M').length).toBeGreaterThan(12);
    expect(cell(look, 0)).toContain('stroke-width="1.8"');
    expect(cell(look, 7).split('M').length).toBeLessThan(cell(look, 0).split('M').length);
    // In play: a bracket under positions 6 to 9, in ink.
    expect(look).toMatch(new RegExp(`stroke="${FLAT.ink}" stroke-width="2.6"`));
    const found = renderFrame(binarySearch({ values: LIST, target: 42 }), keyframes(binarySearch({ values: LIST, target: 42 })).at(-1)!, 'flat');
    expect(cell(found, 6)).toContain(`fill="${FLAT.accent}"`);
  });

  it('writes the comparison over the number compared, with its sign, as the sentence has it', () => {
    // Step 2 of looking for 40: the middle is 42, and 40 is less.
    expect(frames[2]!.caption).toContain('40 is less than 42');
    const strokes = (text: string) => text.split('M').length - 1;
    const withSign = at(2);
    const start = at(0);
    expect(strokes(withSign)).toBeGreaterThan(strokes(start));
    // Nothing is compared before the first step or after the search runs out: no arrow.
    const arrow = `fill="${FLAT.accent}" stroke="none"`;
    expect(start).not.toContain(arrow);
    expect(at(frames.length - 1)).not.toContain(arrow);
    expect(withSign).toContain(arrow);
  });

  it('needs no stylesheet, no font and no glow: every mark carries its own colour and width, in lines of 1.2 and more', () => {
    const svg = at(2);
    expect(svg).not.toMatch(/<style|<text|filter=|class="iso|url\(/);
    const widths = [...svg.matchAll(/stroke-width="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(Math.min(...widths)).toBeGreaterThanOrEqual(1.2);
    expect(flatSvg({ values: [], target: 5, pose: { lo: 0, hi: 0, pull: [], state: [] } }, 'empty')).toContain('<svg');
  });

  it('is the same picture as a PNG: painted from its own marks, the same bytes each time, with the accent on it', () => {
    const png = framePng(at(2));
    expect(sha(framePng(at(2)))).toBe(sha(png));
    const canvas = paintSvg(at(2), 1);
    const [r, g, b] = [0x2b, 0x46, 0xc4];
    let accent = 0;
    for (let i = 0; i < canvas.data.length; i += 3) if (canvas.data[i] === r && canvas.data[i + 1] === g && canvas.data[i + 2] === b) accent += 1;
    expect(accent).toBeGreaterThan(200);
    // In grey it still reads: the compared cell's frame is darker and heavier than a hatched cell's.
    expect(paintSvg(at(0), 1).data.some((v, i) => i % 3 === 0 && v === r)).toBe(false);
  });

  it('is what a still page gets when the slide asks for it, with the same sentences and table', () => {
    const flat = stillFigure({ kind: 'figure', figure: 'binarySearch', look: 'flat', values: LIST, target: 40 });
    const cabinet = stillFigure({ kind: 'figure', figure: 'binarySearch', look: 'cabinet', values: LIST, target: 40 });
    expect(flat.frames.map((f) => f.caption)).toEqual(cabinet.frames.map((f) => f.caption));
    expect(flat.table).toEqual(cabinet.table);
    expect(flat.frames[1]!.svg).toContain('class="flat"');
    expect(cabinet.frames[1]!.svg).toContain('class="iso-');
    expect(SlideVisualSchema.safeParse({ kind: 'figure', figure: 'binarySearch', look: 'neon', values: [1], target: 1 }).success).toBe(false);
    expect(SlideVisualSchema.parse({ kind: 'figure', figure: 'binarySearch', values: [1], target: 1 })).toMatchObject({ look: 'cabinet' });
  });
});

