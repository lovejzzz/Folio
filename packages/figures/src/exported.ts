import { binarySearch, binarySearchProblem, binarySearchTable, type SlideVisual } from '@folio/core';
import { keyframes, renderFrame } from './binarySearchFrames';
import { VIEW } from './binarySearchScene';
import { svgToPng } from './paint';

type Figure = Extract<SlideVisual, { kind: 'figure' }>;

/** A demonstration as a file that cannot move holds it: its pictures in order, each with its sentence, and the table of steps. */
export interface StillFigure {
  /** Why the list cannot be searched, when it cannot: then there are no frames. */
  problem: 'tooLong' | 'notNumbers' | 'unsorted' | null;
  frames: { svg: string; caption: string }[];
  table: { columns: string[]; rows: string[][] };
  width: number;
  height: number;
}

const PROBLEMS = {
  tooLong: 'This demonstration cannot be drawn: its list has more than 15 numbers.',
  notNumbers: 'This demonstration cannot be drawn: its list holds something that is not a number.',
  unsorted: 'This demonstration cannot be drawn: binary search needs its list in ascending order.',
};
export const problemText = (problem: keyof typeof PROBLEMS): string => PROBLEMS[problem];

/** Every picture of a demonstration and its table, from the same model the slide is drawn from. */
export function stillFigure(figure: Figure): StillFigure {
  const problem = binarySearchProblem(figure);
  if (problem) return { problem, frames: [], table: { columns: [], rows: [] }, ...VIEW };
  const model = binarySearch(figure);
  return { problem: null, frames: keyframes(model).map((f) => ({ svg: renderFrame(model, f), caption: f.caption })), table: binarySearchTable(model), ...VIEW };
}

/** A picture's PNG, at twice its own measure: sharp on a page and on a projector. */
export const framePng = (svg: string): Uint8Array => svgToPng(svg, 2);
