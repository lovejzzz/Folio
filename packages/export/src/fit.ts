/**
 * Sizes text to its box before it is written. PowerPoint shrinks a box's text to fit when it opens a deck, but
 * Keynote and Google Slides don't: a long bullet list ran off the bottom of the slide there. So the size is
 * worked out here, from how the words would wrap, and a list too long even at the smallest size is split.
 */

/** Georgia's average letter, a little generous, as a share of the font size: an estimate errs toward smaller. */
const CHAR_EM = 0.54;
/** Line height as a multiple of the font size, as the apps set Georgia. */
const LINE = 1.2;
/** Below this, text on a projected slide can't be read from the back of a room. */
export const MIN_SIZE = 14;

/** Lines a paragraph takes at this size in a box this wide (inches), its words wrapped as the apps wrap them. */
export function linesFor(text: string, widthIn: number, sizePt: number): number {
  const perLine = Math.max(1, Math.floor((widthIn * 72) / (sizePt * CHAR_EM)));
  let lines = 0;
  for (const paragraph of text.split('\n')) {
    let used = 0;
    lines += 1;
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const len = word.length;
      if (used && used + 1 + len > perLine) {
        lines += 1;
        used = 0;
      }
      // A word longer than the line breaks across lines.
      if (len > perLine) {
        lines += Math.floor(len / perLine);
        used = len % perLine;
      } else used += (used ? 1 : 0) + len;
    }
  }
  return lines;
}

export interface Box {
  /** Width and height in inches. */
  w: number;
  h: number;
  /** Space after each paragraph, in points. */
  gap?: number;
}

/** The height (inches) of these paragraphs at this size. */
export function heightFor(paragraphs: string[], box: Box, sizePt: number): number {
  const lines = paragraphs.reduce((n, p) => n + linesFor(p, box.w, sizePt), 0);
  return (lines * sizePt * LINE + paragraphs.length * (box.gap ?? 0)) / 72;
}

/** The largest whole size from `max` down to `min` at which the paragraphs fit the box, or null if none does. */
export function fitSize(paragraphs: string[], box: Box, max: number, min = MIN_SIZE): number | null {
  for (let size = max; size >= min; size -= 1) if (heightFor(paragraphs, box, size) <= box.h) return size;
  return null;
}

/** Items in order, filling each run as far as it fits; an item too long alone gets a run of its own. */
function greedy(items: string[], box: Box, size: number): string[][] {
  const runs: string[][] = [];
  let run: string[] = [];
  for (const item of items) {
    if (run.length && heightFor([...run, item], box, size) > box.h) {
      runs.push(run);
      run = [];
    }
    run.push(item);
  }
  if (run.length) runs.push(run);
  return runs;
}

/**
 * Items split into runs that each fit the box at `size`, in order, as few as can hold them and as even as they
 * can be: fourteen points over three slides are five, five and four, not six, six and two.
 */
export function splitToFit(items: string[], box: Box, size: number): string[][] {
  const runs = greedy(items, box, size);
  const each = Math.ceil(items.length / runs.length);
  const even = Array.from({ length: Math.ceil(items.length / each) }, (_, i) => items.slice(i * each, (i + 1) * each));
  return even.length === runs.length && even.every((run) => heightFor(run, box, size) <= box.h) ? even : runs;
}
