/**
 * Drag-and-drop reordering speaks in gaps: gap 0 is above the first lesson,
 * gap n is below the last. `lesson.move` speaks in the index the lesson ends
 * up at once it has been taken out of the list, so a lesson dragged down
 * lands one index higher than the gap it was dropped into.
 */

/** The index to move to, or null when dropping here would leave the order as it is. */
export function moveIndexForGap(from: number, gap: number): number | null {
  if (from < 0 || gap === from || gap === from + 1) return null;
  return gap > from ? gap - 1 : gap;
}

/** Which gap a pointer over a row means: above it in its top half, below it in its bottom half. */
export function gapAt(rowIndex: number, pointerY: number, rowTop: number, rowHeight: number): number {
  return pointerY - rowTop < rowHeight / 2 ? rowIndex : rowIndex + 1;
}
