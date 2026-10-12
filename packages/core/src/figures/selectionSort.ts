/**
 * Selection sort, as a model with no drawing in it: the same rule as binary search's. The figure on a slide, the
 * sentence under it and the table in a file are all made from the passes this returns, so they cannot disagree.
 *
 * The classic method: the list has a sorted part at its front, empty at first. Each pass finds the smallest number
 * of the rest and puts it at the front of the rest, changing places with what stood there. Where the smallest stands
 * more than once the first is taken. The last number needs no pass.
 */

export interface SelectionSortInput {
  values: number[];
}

export interface SelectionSortPass {
  /** Counted from 1. */
  step: number;
  /** The list as this pass finds it. */
  before: number[];
  /** Where the unsorted part starts, counted from 0: the place this pass fills. */
  from: number;
  /** Where the smallest of the unsorted part stands, counted from 0. */
  min: number;
  /** The smallest, and what stands in the place it goes to. */
  value: number;
  displaced: number;
  swapped: boolean;
  after: number[];
}

export interface SelectionSortModel {
  values: number[];
  passes: SelectionSortPass[];
  sorted: number[];
}

/** Why a list cannot be sorted as it stands, or null: only that something in it is not a number. Any order is a list to sort. */
export const selectionSortProblem = (input: SelectionSortInput): 'notNumbers' | null => (input.values.every((n) => Number.isFinite(n)) ? null : 'notNumbers');

export function selectionSort(input: SelectionSortInput): SelectionSortModel {
  if (selectionSortProblem(input)) throw new Error('selection sort: notNumbers');
  const list = [...input.values];
  const passes: SelectionSortPass[] = [];
  for (let from = 0; from < list.length - 1; from++) {
    let min = from;
    for (let i = from + 1; i < list.length; i++) if (list[i]! < list[min]!) min = i;
    const before = [...list];
    [list[from], list[min]] = [list[min]!, list[from]!];
    passes.push({ step: passes.length + 1, before, from, min, value: before[min]!, displaced: before[from]!, swapped: min !== from, after: [...list] });
  }
  return { values: [...input.values], passes, sorted: list };
}

const at = (i: number) => i + 1;

/** One pass in a sentence: the same words under the figure, for a screen reader, and in an exported file. */
export function describePass(model: SelectionSortModel, pass: SelectionSortPass): string {
  const n = model.values.length;
  const rest = `Positions ${at(pass.from)} to ${n} are unsorted; the smallest of them is ${pass.value}, at position ${at(pass.min)}.`;
  return pass.swapped ? `Pass ${pass.step}. ${rest} It changes places with ${pass.displaced} at position ${at(pass.from)}.` : `Pass ${pass.step}. ${rest} It is where it belongs: nothing moves.`;
}

export function describeSortStart(model: SelectionSortModel): string {
  if (!model.values.length) return 'The list is empty: there is nothing to sort.';
  if (model.values.length === 1) return `One number, ${model.values[0]}, is a sorted list already.`;
  return `Sorting ${model.values.length} numbers by selection: ${model.values.join(', ')}.`;
}

export function describeSortResult(model: SelectionSortModel): string {
  if (model.values.length < 2) return describeSortStart(model);
  const swaps = model.passes.filter((p) => p.swapped).length;
  return `Sorted in ${model.passes.length} ${model.passes.length === 1 ? 'pass' : 'passes'} and ${swaps} ${swaps === 1 ? 'swap' : 'swaps'}: ${model.sorted.join(', ')}.`;
}

/** The whole sort as a table, for a page that cannot move. The sorted part is in brackets, the smallest between asterisks, so it reads without colour. */
export function selectionSortTable(model: SelectionSortModel): { columns: string[]; rows: string[][] } {
  return {
    columns: ['Pass', 'The list at this pass', 'Smallest of the rest', 'What moves', 'The list after'],
    rows: model.passes.map((p) => [
      String(p.step),
      p.before.map((n, i) => (i === p.min ? `*${n}*` : i < p.from ? `(${n})` : String(n))).join('  '),
      `position ${at(p.min)}: ${p.value}`,
      p.swapped ? `${p.value} and ${p.displaced} change places` : 'nothing',
      p.after.join('  '),
    ]),
  };
}
