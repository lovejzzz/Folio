import { binarySearch, binarySearchTable, figureProblem, type FigureProblem, type SlideVisual } from '@folio/core';
import { cabinetLimit, DRAWERS_MAX, NUMERAL_MAX, type CabinetLimit } from './digits';
import { keyframes, renderFrame, viewOf } from './binarySearchFrames';
import { VIEW } from './binarySearchScene';
import { svgToPng } from './paint';

type Figure = Extract<SlideVisual, { kind: 'figure' }>;

/**
 * A demonstration as a file that cannot move holds it. Three cases, kept apart: it cannot be searched or is unfinished
 * (`problem`: only the reason is given, and what was typed); it is searched and drawn (pictures, sentences, table); it
 * is searched and the cabinet cannot draw it (`limit`: the same sentences and table, and the reason there is no picture).
 */
export interface StillFigure {
  problem: FigureProblem | null;
  limit: CabinetLimit | null;
  /** What is said in place of pictures, when there are none. */
  note: string;
  /** The search step by step: a picture each when it can be drawn, the sentence always. */
  frames: { svg: string | null; caption: string }[];
  table: { columns: string[]; rows: string[][] };
  width: number;
  height: number;
}

const PROBLEMS: Record<FigureProblem, string> = {
  notNumbers: 'This demonstration cannot be shown: its list holds something that is not a number.',
  unsorted: 'This demonstration cannot be shown: binary search needs its list in ascending order.',
  unfinished: 'This demonstration is not finished: what was typed for it is not all numbers',
};
const LIMITS: Record<CabinetLimit, string> = {
  tooMany: `The picture holds up to ${DRAWERS_MAX} numbers; this list is longer, so the search is given step by step in words and in the table.`,
  tooLong: `The picture's labels write a number digit by digit (digits, a minus sign, a decimal point; ${NUMERAL_MAX} characters at most) and never round; one of these numbers cannot be written that way in full, so the search is given step by step in words and in the table.`,
};
export const limitText = (limit: CabinetLimit): string => LIMITS[limit];

/** The reason a demonstration is not shown, with what was typed when it is unfinished. */
export function problemText(problem: FigureProblem, figure?: Figure): string {
  if (problem !== 'unfinished') return PROBLEMS[problem];
  const typed = [figure?.entered?.values, figure?.entered?.target].filter((x): x is string => x !== undefined).map((x) => `“${x}”`).join(', ');
  return `${PROBLEMS.unfinished}${typed ? ` (${typed})` : ''}. Its numbers are to be put right in Folio.`;
}

/** Everything a still page shows of a demonstration, from the same model the slide is worked from. */
export function stillFigure(figure: Figure): StillFigure {
  const problem = figureProblem(figure);
  if (problem) return { problem, limit: null, note: problemText(problem, figure), frames: [], table: { columns: [], rows: [] }, ...VIEW };
  const model = binarySearch(figure);
  const limit = cabinetLimit(model.values, model.target);
  const frames = keyframes(model).map((f) => ({ svg: limit ? null : renderFrame(model, f, figure.look), caption: f.caption }));
  return { problem: null, limit, note: limit ? LIMITS[limit] : '', frames, table: binarySearchTable(model), ...viewOf(figure.look, model.values) };
}

/** A picture's PNG, at twice its own measure: sharp on a page and on a projector. */
export const framePng = (svg: string): Uint8Array => svgToPng(svg, 2);
