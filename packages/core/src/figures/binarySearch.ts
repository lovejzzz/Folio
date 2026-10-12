import { gradientDescentProblem } from './gradientDescent';
import { selectionSortProblem } from './selectionSort';

/**
 * Binary search, as a model with no drawing in it. Everything a teacher or a student sees of the demonstration (the
 * figure on a slide, the line that says what a step does, the text a screen reader is given, the table of steps in a Word
 * file, a deck or a PDF) is made from the frames this file returns for one list and one target. Nothing is drawn or said
 * from anywhere else, so the picture and the words cannot disagree.
 *
 * The search is the classic one: lo and hi close in on the target, mid is the lower middle. Where the target stands more
 * than once it returns the position the midpoints reach first, which need not be the leftmost: the demonstration says so.
 * A list that is not in ascending order is refused, not sorted behind the teacher's back.
 */

/** The most numbers a course file may hold for one search: a bound on the file, not on what a picture can show. */
export const BINARY_SEARCH_MAX = 60;

export interface BinarySearchInput {
  values: number[];
  target: number;
}

export interface BinarySearchFrame {
  /** Counted from 1. */
  step: number;
  /** Positions counted from 0, both ends included: what is still in play before this step's comparison. */
  lo: number;
  hi: number;
  mid: number;
  /** The value looked at. */
  value: number;
  /** The target against the value looked at. */
  compare: 'equal' | 'less' | 'greater';
}

export interface BinarySearchModel {
  values: number[];
  target: number;
  frames: BinarySearchFrame[];
  /** The position the target was found at, counted from 0; null when it is not in the list. */
  found: number | null;
}

export type BinarySearchProblem = 'notNumbers' | 'unsorted';

/**
 * Why a list cannot be searched as it stands, or null: what the method itself needs, and nothing about any picture
 * of it. How many numbers a drawing holds, or how long a number its labels can write, is the drawing's affair
 * (`@folio/figures`), and a list a drawing cannot hold is still searched and told in words.
 * An empty list is searched: the answer is "not there", in no steps.
 */
export function binarySearchProblem(input: BinarySearchInput): BinarySearchProblem | null {
  if (![...input.values, input.target].every((n) => Number.isFinite(n))) return 'notNumbers';
  return input.values.every((n, i) => i === 0 || input.values[i - 1]! <= n) ? null : 'unsorted';
}

/** What was typed for a demonstration and is not yet numbers: kept as typed, beside the numbers the figure last had. */
export interface FigureEntered {
  values?: string | undefined;
  target?: string | undefined;
}

/** What a teacher typed as a list, entry by entry: commas, semicolons or spaces between them. */
export const figureEntries = (text: string): string[] => text.split(/[\s,;，、]+/).filter(Boolean);
export const isFigureNumber = (entry: string): boolean => entry.trim() !== '' && Number.isFinite(Number(entry.trim()));

/** The entries of what was typed that are not numbers, in the order typed. */
export function enteredFaults(entered: FigureEntered | undefined): string[] {
  return [...figureEntries(entered?.values ?? ''), ...(entered?.target === undefined ? [] : [entered.target.trim()])].filter((x) => !isFigureNumber(x));
}

export type FigureProblem = BinarySearchProblem | 'badSetup' | 'unfinished';

/**
 * The one check of a demonstration, asked wherever one is typed, opened from a file, drawn, stepped or exported.
 * A demonstration whose numbers are still being typed wrongly is unfinished: it is drawn and exported as that, with
 * what was typed, never as the numbers it had before.
 */
export function figureProblem(figure: BinarySearchInput & { figure?: string; entered?: FigureEntered | undefined }): FigureProblem | null {
  if (figure.entered && (figure.entered.values !== undefined || figure.entered.target !== undefined)) return 'unfinished';
  // Each demonstration asks of its list only what its own method needs: a search, that it is in order; a sort, nothing.
  return figure.figure === 'selectionSort' ? selectionSortProblem(figure) : figure.figure === 'gradientDescent' ? gradientDescentProblem(figure) : binarySearchProblem(figure);
}

/** The same numbers in ascending order: offered to the teacher as a choice, never done for them. */
export const sortedForSearch = (values: number[]): number[] => [...values].sort((a, b) => a - b);

/** The search, step by step. Throws on a list `binarySearchProblem` refuses. */
export function binarySearch(input: BinarySearchInput): BinarySearchModel {
  const problem = binarySearchProblem(input);
  if (problem) throw new Error(`binary search: ${problem}`);
  const { values, target } = input;
  const frames: BinarySearchFrame[] = [];
  let lo = 0;
  let hi = values.length - 1;
  let found: number | null = null;
  while (lo <= hi && found === null) {
    const mid = Math.floor((lo + hi) / 2);
    const value = values[mid]!;
    const compare = target === value ? 'equal' : target < value ? 'less' : 'greater';
    frames.push({ step: frames.length + 1, lo, hi, mid, value, compare });
    if (compare === 'equal') found = mid;
    else if (compare === 'less') hi = mid - 1;
    else lo = mid + 1;
  }
  return { values: [...values], target, frames, found };
}

/** What is still in play after a step: empty (lo past hi) when the search has run out. */
export function after(frame: BinarySearchFrame): { lo: number; hi: number } {
  return frame.compare === 'less' ? { lo: frame.lo, hi: frame.mid - 1 } : frame.compare === 'greater' ? { lo: frame.mid + 1, hi: frame.hi } : { lo: frame.mid, hi: frame.mid };
}

/** Positions are said as people count them, from 1. */
const at = (i: number) => i + 1;

/** One step in a sentence: the same words under the figure, for a screen reader, and in an exported file. */
export function describeStep(model: BinarySearchModel, frame: BinarySearchFrame): string {
  const span = frame.lo === frame.hi ? `Only position ${at(frame.lo)} is left` : `Positions ${at(frame.lo)} to ${at(frame.hi)} are left`;
  const look = `${span}; the middle is position ${at(frame.mid)}, which holds ${frame.value}.`;
  if (frame.compare === 'equal') return `Step ${frame.step}. ${look} ${model.target} is ${frame.value}: found at position ${at(frame.mid)}.`;
  const next = after(frame);
  const rest = next.lo > next.hi ? 'nothing is left to search' : next.lo === next.hi ? `only position ${at(next.lo)} is left` : `positions ${at(next.lo)} to ${at(next.hi)} are left`;
  return `Step ${frame.step}. ${look} ${model.target} is ${frame.compare === 'less' ? 'less' : 'greater'} than ${frame.value}, so the ${frame.compare === 'less' ? 'right' : 'left'} part is set aside and ${rest}.`;
}

/** Before the first step. */
export function describeStart(model: BinarySearchModel): string {
  if (!model.values.length) return `The list is empty, so ${model.target} is not in it: there is nothing to compare.`;
  return `Searching for ${model.target} in a sorted list of ${model.values.length} ${model.values.length === 1 ? 'number' : 'numbers'}: ${model.values.join(', ')}.`;
}

/** How it ended. */
export function describeResult(model: BinarySearchModel): string {
  const steps = `${model.frames.length} ${model.frames.length === 1 ? 'comparison' : 'comparisons'}`;
  if (model.found === null) return model.values.length ? `${model.target} is not in the list: the search ran out after ${steps}.` : `${model.target} is not in the list.`;
  const twice = model.values.filter((n) => n === model.target).length > 1;
  return `${model.target} was found at position ${at(model.found)} after ${steps}.${twice ? ` It stands in the list more than once; binary search returns the one its midpoints reach first, which need not be the leftmost.` : ''}`;
}

/**
 * The whole search as a table, for a page that cannot move: a row a step, with the list as that step sees it. A value
 * set aside is shown in brackets, the middle between asterisks, so the table reads without colour.
 */
export function binarySearchTable(model: BinarySearchModel): { columns: string[]; rows: string[][] } {
  const cell = (frame: BinarySearchFrame, n: number, i: number) => (i === frame.mid ? `*${n}*` : i < frame.lo || i > frame.hi ? `(${n})` : String(n));
  return {
    columns: ['Step', 'The list at this step', 'Middle', 'Compared', 'What follows'],
    rows: model.frames.map((frame) => {
      const next = after(frame);
      return [
        String(frame.step),
        model.values.map((n, i) => cell(frame, n, i)).join('  '),
        `position ${at(frame.mid)}: ${frame.value}`,
        frame.compare === 'equal' ? `${model.target} = ${frame.value}` : `${model.target} ${frame.compare === 'less' ? '<' : '>'} ${frame.value}`,
        frame.compare === 'equal' ? `found at position ${at(frame.mid)}` : next.lo > next.hi ? 'nothing left: not in the list' : `keep positions ${at(next.lo)} to ${at(next.hi)}`,
      ];
    }),
  };
}
