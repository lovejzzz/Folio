import type { FigureId } from '../schema';

/**
 * The demonstrations Folio draws, each in a sentence a writer of slides can choose from: what it shows and the
 * numbers it is given. A writer names one and gives its numbers; Folio draws it, steps it and exports it. Nothing
 * else of a figure can come from a writer: no code, no address, no styling.
 */
export const FIGURE_CATALOG: Record<FigureId, string> = {
  binarySearch: 'binarySearch: binary search in a sorted list. values = the list in ascending order (3 to 15 numbers), target = the number looked for',
  selectionSort: 'selectionSort: selection sort, pass by pass. values = the list to sort (3 to 8 numbers), target = 0',
  gradientDescent: 'gradientDescent: gradient descent on one parameter w, for a loss that is a parabola in w: a (w - best)^2 + c. values = [where w starts, the learning rate, how many steps (1 to 8), a, c], target = best, the w with the lowest loss; give a, c and best to three decimals so the picture\'s numbers are the lesson\'s',
};
