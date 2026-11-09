import { soften } from './soften';

/**
 * A drawing is a Minicharts card: a few lines of code that call the kit's pen, fills and solids. To draw it, the
 * kit, the 54 example cards (whose helpers a card may call) and the card are run as one script, and the card is
 * drawn into its sheet as the skill's run script draws it (`assets/run.js`, `sheet`). The script leaves what it
 * drew on `globalThis.__drawn`: whoever runs it (a worker in the drawing frame, or Node for the command line)
 * reads it from there. It never touches a page: the kit writes SVG as text.
 */

/** The sheet a card draws into, in its own units. */
export const SHEET = { w: 520, h: 420 } as const;

/** What a card drew: its words, the SVG inside the sheet, and the note of every part a reader can touch. */
export interface Drawn {
  id: string;
  name: string;
  of: string;
  note: string;
  /** The kit's pattern defs, then the drawing: what goes inside the sheet's <svg>. */
  body: string;
  parts: string[];
}

export type DrawResult = { ok: true; drawn: Drawn[] } | { ok: false; error: string };

// The seed is the skill's hash of the card's id, so a card is drawn the same way every time it is drawn.
const RENDER = `
;globalThis.__drawn = CARDS.map(c => {
  const id = String(c.id ?? 'card'); let h = 7; for (const ch of id) h = Math.imul(h, 31) + ch.charCodeAt(0) | 0;
  begin(h); LOOSE = .22; OX = 260; OY = 210; c.draw.call(c); flush(); LOOSE = 0;
  const body = pencilDefs() + out.join('');
  const parts = [...body.matchAll(/<g class="p[^"]*"[^>]*data-n="([^"]*)"/g)].map(m => m[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&amp;/g, '&'));
  return { id, name: String(c.name ?? ''), of: String(c.of ?? ''), note: String(c.note ?? ''), body, parts };
});`;

/** The whole script for one card's code, given the kit's two files. */
export function programOf(kit: { ENGINE: string; EXAMPLES: string }, code: string): string {
  return `'use strict';\nconst LIT = {}, ALT = {};\n${kit.ENGINE}\n${kit.EXAMPLES}\nCARDS.splice(0);\n${soften(code)}\n${RENDER}`;
}

/** What a run left behind, checked for shape: a card's code can leave anything there. */
export function readDrawn(value: unknown): DrawResult {
  if (!Array.isArray(value)) return { ok: false, error: 'The code drew no card: call card({...}) once.' };
  const drawn = value.filter((d): d is Drawn => typeof d === 'object' && d !== null && typeof (d as Drawn).body === 'string');
  if (!drawn.length) return { ok: false, error: 'The code drew no card: call card({...}) once.' };
  return { ok: true, drawn };
}

/** An error as a writer can act on it: its name and message, short. */
export const errorText = (e: unknown): string => (e instanceof Error ? `${e.name}: ${e.message}` : String(e)).slice(0, 400);
