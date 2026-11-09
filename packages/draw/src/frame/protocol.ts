import type { DrawResult } from '../program';

/** What the page sends the drawing frame: the kit once, then cards to draw, each with its own id. */
export type ToFrame = { t: 'kit'; engine: string; examples: string } | { t: 'draw'; id: number; code: string };
/** What the frame sends back: that it is ready for the kit, and each card's result under its id. */
export type FromFrame = { t: 'ready' } | { t: 'drawn'; id: number; result: DrawResult };

/** How long one card may take to draw before its worker is ended: the kit draws a card in tens of milliseconds. */
export const DRAW_MS = 4000;
