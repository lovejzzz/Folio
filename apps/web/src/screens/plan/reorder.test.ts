import { describe, expect, it } from 'vitest';
import { gapAt, moveIndexForGap } from './reorder';

/** Apply a move the way the `lesson.move` command does: take the lesson out, then insert it. */
function move(order: string[], from: number, gap: number): string[] {
  const to = moveIndexForGap(from, gap);
  if (to === null) return order;
  const next = [...order];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

describe('reordering lessons by drag and drop', () => {
  const order = ['1', '2', '3', '4'];

  it('drops a lesson dragged down just above the row the line is drawn over', () => {
    // The line is above lesson 3 (gap 2): lesson 1 lands between 2 and 3.
    expect(move(order, 0, 2)).toEqual(['2', '1', '3', '4']);
    expect(move(order, 0, 3)).toEqual(['2', '3', '1', '4']);
  });

  it('drops a lesson dragged up just above the row the line is drawn over', () => {
    expect(move(order, 3, 1)).toEqual(['1', '4', '2', '3']);
    expect(move(order, 2, 0)).toEqual(['3', '1', '2', '4']);
  });

  it('moves a lesson to the very end through the gap below the last row', () => {
    expect(move(order, 0, 4)).toEqual(['2', '3', '4', '1']);
  });

  it('treats the gaps either side of the dragged lesson as no move', () => {
    expect(moveIndexForGap(1, 1)).toBeNull();
    expect(moveIndexForGap(1, 2)).toBeNull();
    expect(moveIndexForGap(-1, 2)).toBeNull();
  });

  it('reads the top half of a row as above it and the bottom half as below it', () => {
    expect(gapAt(2, 105, 100, 80)).toBe(2);
    expect(gapAt(2, 139, 100, 80)).toBe(2);
    expect(gapAt(2, 141, 100, 80)).toBe(3);
    expect(gapAt(2, 179, 100, 80)).toBe(3);
  });
});
