/**
 * The mark's shape, shared by the page's mark and the generated icons (favicon, app icon, share image):
 * three pages of a course fanned out, back to front, in a 32-unit square. They turn about a point well below
 * them, so each page steps out to the right of the one in front and all three read even at 16 px.
 */
export const MARK_PAGE = { x: 4, y: 5, width: 13, height: 20.5, rx: 1.75 } as const;

const PIVOT = { x: 9, y: 42 };

/** Each page's turn, in degrees, back to front. */
export const MARK_ANGLES = [22, 11, 0] as const;

/** The turn of one page about the point they share. */
export function markTransform(angle: number): string | undefined {
  return angle ? `rotate(${angle} ${PIVOT.x} ${PIVOT.y})` : undefined;
}
