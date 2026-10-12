import { binarySearch, binarySearchTable, gradientDescent, gradientDescentTable, rackBudget, rackBudgetTable, selectionSort, selectionSortTable, written, type SlideVisual } from '@folio/core';
import { between, figureBody, keyframes, readWidthOf, renderFrame, viewOf } from './binarySearchFrames';
import type { Pose, View } from './binarySearchScene';
import { descentBetween, descentBody, descentKeyframes, descentReadWidth, descentSvg, descentView, type DescentPose } from './descentScene';
import { cabinetLimit, type CabinetLimit } from './digits';
import { rackBetween, rackBody, rackKeyframes, rackReadWidth, rackSvg, rackView, type RackPose } from './rackScene';
import { sortBetween, sortBody, sortKeyframes, sortLimit, sortReadWidth, sortSvg, sortView, type SortPose } from './sortScene';

type Figure = Extract<SlideVisual, { kind: 'figure' }>;

/** One picture of a demonstration: its place in the run, its sentence, and where every part stands. The pose is the figure's own. */
export interface Still {
  kind: 'start' | 'step' | 'end';
  step: number;
  caption: string;
  pose: unknown;
}

/** One number as the list has it at a pose: where it stands (counted from 1) and what the step makes of it. */
export interface Item {
  place: number;
  value: number;
  state: string;
}

/**
 * Everything the rest of Folio asks of a demonstration, whichever it is: its pictures in order, a pose between two of
 * them, the drawing of a pose live and as a file, its measure, the width it reads at, what the drawing cannot hold,
 * the table of its steps, and its list at a pose. A new demonstration is one more entry here, a model in core, and a
 * drawing: the slide, the controls, the larger picture, the phone strip and every export read only this.
 */
export interface FigureKind {
  stills: (v: Figure) => Still[];
  between: (a: unknown, b: unknown, t: number) => unknown;
  body: (v: Figure, pose: unknown) => string;
  svg: (v: Figure, still: Still) => string;
  view: (v: Figure) => View;
  readWidth: (v: Figure) => number;
  limit: (v: Figure) => CabinetLimit | null;
  table: (v: Figure) => { columns: string[]; rows: string[][] };
  items: (v: Figure, pose: unknown) => Item[];
}

const search: FigureKind = {
  stills: (v) => keyframes(binarySearch(v)),
  between: (a, b, t) => between(a as Pose, b as Pose, t),
  body: (v, pose) => figureBody({ values: v.values, target: v.target, pose: pose as Pose }, v.look),
  svg: (v, still) => renderFrame(binarySearch(v), still as ReturnType<typeof keyframes>[number], v.look),
  view: (v) => viewOf(v.look, v.values),
  readWidth: (v) => readWidthOf(v.look, v.values),
  limit: (v) => cabinetLimit(v.values, v.target),
  table: (v) => binarySearchTable(binarySearch(v)),
  items: (v, pose) => v.values.map((value, i) => ({ place: i + 1, value, state: (pose as Pose).state[i] ?? 'play' })),
};

const sort: FigureKind = {
  stills: (v) => sortKeyframes(selectionSort(v)),
  between: (a, b, t) => sortBetween(a as SortPose, b as SortPose, t),
  body: (v, pose) => sortBody({ values: v.values, pose: pose as SortPose }, v.look),
  svg: (v, still) => sortSvg({ values: v.values, pose: still.pose as SortPose }, still.caption, v.look),
  view: (v) => sortView(v.look, v.values),
  readWidth: (v) => sortReadWidth(v.look, v.values),
  limit: (v) => sortLimit(v.values),
  table: (v) => selectionSortTable(selectionSort(v)),
  // In the order the list has at this pose, not the order it was given in.
  items: (v, pose) => v.values.map((value, id) => ({ place: Math.round((pose as SortPose).slot[id] ?? id) + 1, value, state: (pose as SortPose).state[id] ?? 'rest' })).sort((a, b) => a.place - b.place),
};

const descent: FigureKind = {
  stills: (v) => descentKeyframes(gradientDescent(v)),
  between: (a, b, t) => descentBetween(a as DescentPose, b as DescentPose, t),
  body: (v, pose) => descentBody({ model: gradientDescent(v), pose: pose as DescentPose }, v.look),
  svg: (v, still) => descentSvg({ model: gradientDescent(v), pose: still.pose as DescentPose }, still.caption, v.look),
  view: (v) => descentView(v.look),
  readWidth: (v) => descentReadWidth(v.look),
  // Any walk can be drawn: one that runs away is held at the picture's edge and its numbers say where it is.
  limit: () => null,
  table: (v) => gradientDescentTable(gradientDescent(v)),
  // Where w has been, in order, and where it is: each to three decimals, as the picture writes them.
  items: (_v, pose) => [...(pose as DescentPose).trail, (pose as DescentPose).w].map((w, i, all) => ({ place: i + 1, value: Number(written(w).text), state: i === all.length - 1 ? 'now' : 'past' })),
};

const rack: FigureKind = {
  stills: (v) => rackKeyframes(rackBudget(v)),
  between: (a, b, t) => rackBetween(a as RackPose, b as RackPose, t),
  body: (v, pose) => rackBody({ model: rackBudget(v), pose: pose as RackPose }, v.look),
  svg: (v, still) => rackSvg({ model: rackBudget(v), pose: still.pose as RackPose }, still.caption, v.look),
  view: (v) => rackView(v.look),
  readWidth: (v) => rackReadWidth(v.look),
  limit: () => null,
  table: (v) => rackBudgetTable(rackBudget(v)),
  // The servers tried so far, each with what the rack takes once it is counted.
  items: (v, pose) => (pose as RackPose).state.flatMap((state, i) => (state === 'waiting' ? [] : [{ place: i + 1, value: Number(written((i + 1) * v.values[0]!).text), state: state === 'now' ? 'look' : state }])),
};

export const FIGURE_KINDS: Record<Figure['figure'], FigureKind> = { binarySearch: search, selectionSort: sort, gradientDescent: descent, rackBudget: rack };
export const figureKind = (v: Figure): FigureKind => FIGURE_KINDS[v.figure];
