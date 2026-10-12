import { binarySearch, binarySearchTable, selectionSort, selectionSortTable, type SlideVisual } from '@folio/core';
import { between, figureBody, keyframes, readWidthOf, renderFrame, viewOf } from './binarySearchFrames';
import type { Pose, View } from './binarySearchScene';
import { cabinetLimit, type CabinetLimit } from './digits';
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

export const FIGURE_KINDS: Record<Figure['figure'], FigureKind> = { binarySearch: search, selectionSort: sort };
export const figureKind = (v: Figure): FigureKind => FIGURE_KINDS[v.figure];
