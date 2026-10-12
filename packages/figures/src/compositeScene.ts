import { drawerFoot, sceneBody, standaloneSvg, type Scene, type View } from './binarySearchScene';
import { GLYPH_HEIGHT } from './digits';
import { cellsOf, comparedAt, d, fillOf, FLAT, gridOf, pointer, stroke, type Grid } from './flatScene';

/**
 * Binary search as one picture in two layers. Above, the object: the cabinet of drawers, where the search happens
 * (a drawer comes out, the fences close in, drawers set aside go dim). Below, the reading: the same list as a row of
 * large numbers with their places, the bracket, and the comparison written out. A line runs from the drawer that is
 * out to its number in the row, so the eye is led from what happened to what it means.
 *
 * Each layer does what the other could not: the cabinet shows the mechanism and its labels are small; the row is read
 * across a room and shows nothing moving. The scene is the Anatomy kit's (vendor/anatomy); the row is our own.
 */

const W = 640;
/** The band the cabinet is fitted into. */
const SCENE: View = { width: W, height: 286 };
/** Where the reading layer starts: a little into the foot of the scene, whose base leaves that corner empty. */
const READ_FROM = 262;

type P = [number, number];

/** The row's grid in this picture: the whole width, since the number looked for stands on its card in the scene. */
export const compositeGrid = (values: readonly number[]): Grid => gridOf(values, W - 28, 14, READ_FROM);

/** The measure of the combined figure: its width is fixed, its height follows the rows of its reading layer. */
export const compositeView = (values: readonly number[]): View => ({ width: W, height: Math.round(compositeGrid(values).height) });

const ROUND = Array.from({ length: 20 }, (_, i): P => [Math.cos((i / 20) * Math.PI * 2), Math.sin((i / 20) * Math.PI * 2)]);
const disc = ([x, y]: P, r: number) => d(ROUND.map(([c, s]): P => [x + c * r, y + s * r]), true);

/** From the drawer that is out to the comparison over its number: down, across, down, with a dot where it leaves the drawer. */
function leader(scene: Scene, g: Grid): string {
  const to = comparedAt(scene, g);
  const weight = scene.pose.pull.reduce((n, p) => n + p, 0);
  if (!to || weight < 0.02) return '';
  // While the look moves from one drawer to the next the line moves with it, as the arrow below does.
  const from = scene.pose.pull.reduce<P>((at, p, i) => (p ? [at[0] + (p * drawerFoot(scene, i, SCENE)[0]) / weight, at[1] + (p * drawerFoot(scene, i, SCENE)[1]) / weight] : at), [0, 0]);
  const end: P = [to[0], to[1] - 64];
  const dot = fillOf(disc(from, 5), FLAT.paper) + fillOf(disc(from, 3.2), FLAT.accent);
  const turn = Math.max(from[1] + 12, Math.min(end[1] - 8, READ_FROM + 8));
  // To a number in the first row: down, across, down.
  if (end[1] < g.top(0)) return stroke(d([from, [from[0], turn], [end[0], turn], end]), FLAT.accent, 2).replace('<path', '<path data-part="leader"') + dot;
  // To a row further down: round the rows above by the nearer margin, never across their numbers.
  const left = Math.max(5, g.x(0) - 6);
  const right = Math.min(W - 5, g.x(g.perRow - 1) + g.cell + 6);
  const way = (x: number) => Math.abs(from[0] - x) + Math.abs(end[0] - x);
  const side = way(left) < way(right) ? left : right;
  return stroke(d([from, [from[0], turn], [side, turn], [side, end[1] - 5], [end[0], end[1] - 5], end]), FLAT.accent, 2).replace('<path', '<path data-part="leader"') + dot;
}

/** The whole combined figure as the inside of an SVG: the page, the scene, then the reading layer over its foot. */
export function compositeBody(scene: Scene): string {
  const g = compositeGrid(scene.values);
  return [fillOf(d([[0, 0], [W, 0], [W, g.height], [0, g.height]], true), FLAT.page), `<g data-layer="scene">${sceneBody(scene, SCENE)}</g>`, `<g data-layer="reading">${cellsOf(scene, g)}${leader(scene, g)}${pointer(scene, g, W - 28)}</g>`].join('');
}

/** A frame of the combined figure as a picture of its own: the kit's light theme inside it for the scene, the row's colours on its marks. */
export function compositeSvg(scene: Scene, label: string): string {
  return standaloneSvg(compositeView(scene.values), label, compositeBody(scene));
}

/** How wide, in pixels of a screen, the combined figure must be shown for its row to be read there: numerals thirteen pixels, places nine. */
export function compositeReadWidth(values: readonly number[]): number {
  return Math.ceil(Math.max((W * 13) / (compositeGrid(values).unit * GLYPH_HEIGHT), (W * 9) / (2.1 * GLYPH_HEIGHT)));
}
