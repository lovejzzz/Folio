import { describePass, figureProblem, selectionSort, selectionSortTable, SlideVisualSchema } from '@folio/core';
import { describe, expect, it } from 'vitest';
import { figureKind, paintSvg, sortKeyframes, sortLimit, stillFigure, type SortPose } from '../src';

const LIST = [31, 8, 56, 3, 42, 17, 23];
const fig = (values: number[], look: 'cabinet' | 'flat' | 'composite' = 'composite') => ({ kind: 'figure' as const, figure: 'selectionSort' as const, look, values, target: 0 });
const states = (text: string) => [...text.matchAll(/data-drawer="(\d+)" data-state="(\w+)"/g)].map((m) => `${m[1]}:${m[2]}`);
const layer = (svg: string, name: string) => svg.split(`data-layer="${name}"`)[1]!.split('data-layer=')[0]!;

describe('selection sort, as a model', () => {
  it('sorts by putting the smallest of the rest at its front, a pass a place, the last place needing none', () => {
    const m = selectionSort({ values: LIST });
    expect(m.sorted).toEqual([3, 8, 17, 23, 31, 42, 56]);
    expect(m.passes).toHaveLength(6);
    expect(m.passes[0]).toMatchObject({ from: 0, min: 3, value: 3, displaced: 31, swapped: true, after: [3, 8, 56, 31, 42, 17, 23] });
    // Already in its place: said, and nothing moves.
    expect(m.passes[1]).toMatchObject({ from: 1, min: 1, swapped: false });
    expect(describePass(m, m.passes[1]!)).toBe('Pass 2. Positions 2 to 7 are unsorted; the smallest of them is 8, at position 2. It is where it belongs: nothing moves.');
    expect(m.values).toEqual(LIST);
  });

  it('holds with nothing, one number, numbers that stand twice, negatives and decimals', () => {
    expect(selectionSort({ values: [] }).passes).toEqual([]);
    expect(selectionSort({ values: [5] }).passes).toEqual([]);
    const twice = selectionSort({ values: [4, 2, 4, 2] });
    expect(twice.sorted).toEqual([2, 2, 4, 4]);
    // The first of two equal smallest is the one taken.
    expect(twice.passes[0]!.min).toBe(1);
    expect(selectionSort({ values: [0.5, -2.5, 0] }).sorted).toEqual([-2.5, 0, 0.5]);
  });

  it('asks of its list only that it be numbers: any order is a list to sort, where a search refuses it', () => {
    expect(figureProblem(fig([3, 1, 2]))).toBeNull();
    expect(figureProblem({ ...fig([3, 1, 2]), figure: 'binarySearch' })).toBe('unsorted');
    expect(figureProblem({ ...fig([1]), entered: { values: '1, x' } })).toBe('unfinished');
    expect(SlideVisualSchema.safeParse(fig(LIST)).success).toBe(true);
    // A file written before a second figure existed, and one for a sort with no target, both open.
    expect(SlideVisualSchema.safeParse({ kind: 'figure', figure: 'selectionSort', values: [2, 1] }).success).toBe(true);
    expect(SlideVisualSchema.safeParse({ kind: 'figure', figure: 'bubbleSort', values: [2, 1], target: 0 }).success).toBe(false);
  });

  it('is told as a table that reads without colour', () => {
    const table = selectionSortTable(selectionSort({ values: [3, 1, 2] }));
    expect(table.rows[0]).toEqual(['1', '3  *1*  2', 'position 2: 1', '1 and 3 change places', '1  3  2']);
    expect(table.rows[1]![1]).toBe('(1)  3  *2*');
  });
});

describe('selection sort, drawn by the same method as the search', () => {
  const frames = sortKeyframes(selectionSort({ values: LIST }));

  it('has a picture before the first pass, one a pass as the pass finds the list, and one sorted', () => {
    expect(frames.map((f) => f.kind)).toEqual(['start', 'step', 'step', 'step', 'step', 'step', 'step', 'end']);
    // Pass 1: the smallest (3, the fourth given) lifted; 31 at the front marked as the one it changes with.
    expect(frames[1]!.pose).toMatchObject({ from: 0, lift: [0, 0, 0, 1, 0, 0, 0] });
    expect(frames[1]!.pose.state[3]).toBe('min');
    expect(frames[1]!.pose.state[0]).toBe('place');
    // Pass 2 finds them changed: 3 at the front and sorted, 31 where 3 was.
    expect(frames[2]!.pose.slot[3]).toBe(0);
    expect(frames[2]!.pose.slot[0]).toBe(3);
    expect(frames[2]!.pose.state[3]).toBe('sorted');
    expect(frames.at(-1)!.pose.state.every((s) => s === 'sorted')).toBe(true);
    // At the end every number stands at its rank.
    const end = frames.at(-1)!.pose as SortPose;
    expect(LIST.map((_, id) => id).sort((a, b) => end.slot[a]! - end.slot[b]!).map((id) => LIST[id])).toEqual([3, 8, 17, 23, 31, 42, 56]);
  });

  it('shows every number in both layers in the same state, with a line from the lifted block to its number', () => {
    const kind = figureKind(fig(LIST));
    for (const still of kind.stills(fig(LIST))) {
      const svg = kind.svg(fig(LIST), still);
      expect(states(layer(svg, 'scene')).sort()).toEqual(states(layer(svg, 'reading')).sort());
      expect(svg.includes('data-part="leader"')).toBe(still.kind === 'step');
    }
    const first = kind.svg(fig(LIST), kind.stills(fig(LIST))[1]!);
    expect(first).toContain('data-part="compare"');
    expect(first).toContain('data-part="swap"');
    // Nothing moves in pass 2: no line under two cells.
    expect(kind.svg(fig(LIST), kind.stills(fig(LIST))[2]!)).not.toContain('data-part="swap"');
  });

  it('gives the phone strip the list in the order it has at each pass', () => {
    const kind = figureKind(fig(LIST));
    const stills = kind.stills(fig(LIST));
    expect(kind.items(fig(LIST), stills[0]!.pose).map((x) => x.value)).toEqual(LIST);
    expect(kind.items(fig(LIST), stills[2]!.pose).map((x) => x.value)).toEqual([3, 8, 56, 31, 42, 17, 23]);
    expect(kind.items(fig(LIST), stills.at(-1)!.pose).map((x) => `${x.place}:${x.value}:${x.state}`)[0]).toBe('1:3:sorted');
  });

  it('moves a block part of the way between two passes', () => {
    const kind = figureKind(fig(LIST));
    const half = kind.between(frames[1]!.pose, frames[2]!.pose, 0.5) as SortPose;
    expect(half.slot[3]).toBeCloseTo(1.5);
    expect(half.lift[3]).toBeCloseTo(0.5);
  });

  it('is a still page with its sentences and table, and a PNG painted without a browser, in each look', () => {
    for (const look of ['cabinet', 'flat', 'composite'] as const) {
      const still = stillFigure(fig(LIST, look));
      expect(still.frames).toHaveLength(8);
      expect(still.table.rows).toHaveLength(6);
      const canvas = paintSvg(still.frames[1]!.svg!, 2);
      expect([canvas.width, canvas.height]).toEqual([still.width * 2, still.height * 2]);
    }
  });

  it('says what it cannot hold, and the sort is still told in words', () => {
    expect(sortLimit(LIST)).toBeNull();
    expect(sortLimit([9, 8, 7, 6, 5, 4, 3, 2, 1])).toBe('tooMany');
    expect(sortLimit([123456, 1])).toBe('tooLong');
    const still = stillFigure(fig([9, 8, 7, 6, 5, 4, 3, 2, 1]));
    expect(still.limit).toBe('tooMany');
    expect(still.frames.every((f) => f.svg === null && f.caption)).toBe(true);
    expect(still.table.rows).toHaveLength(8);
  });
});
