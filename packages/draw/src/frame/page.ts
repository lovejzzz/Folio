import { errorText, programOf, readDrawn, type DrawResult } from '../program';
import { DRAW_MS, type FromFrame, type ToFrame } from './protocol';

/**
 * The drawing frame: a page with no origin, no network and no storage, in which a card's code is run. Each card
 * runs in a worker of its own, made from the kit and the card as one script, and ended if it runs too long. What
 * comes back is text (the SVG and the parts' notes), which the page that embeds the frame shows as a picture.
 */

const host = window.parent;
const up = (m: FromFrame): void => host.postMessage(m, '*');
let kit: { ENGINE: string; EXAMPLES: string } | null = null;

// Run as the worker's last line: whatever the card left, sent up as plain data.
const SEND = `;postMessage({ drawn: JSON.parse(JSON.stringify(globalThis.__drawn ?? null)) });`;

function draw(id: number, code: string): void {
  if (!kit) return up({ t: 'drawn', id, result: { ok: false, error: 'The drawing kit is not loaded.' } });
  const url = URL.createObjectURL(new Blob([programOf(kit, code), SEND], { type: 'text/javascript' }));
  const worker = new Worker(url);
  let done = false;
  const finish = (result: DrawResult): void => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    worker.terminate();
    URL.revokeObjectURL(url);
    up({ t: 'drawn', id, result });
  };
  const timer = setTimeout(() => finish({ ok: false, error: `The drawing took longer than ${DRAW_MS / 1000} seconds and was stopped: look for a loop that never ends.` }), DRAW_MS);
  worker.onmessage = (e: MessageEvent<{ drawn: unknown }>) => finish(readDrawn(e.data?.drawn));
  worker.onerror = (e: ErrorEvent) => {
    e.preventDefault();
    finish({ ok: false, error: errorText(e.message || 'The code could not run.') });
  };
}

window.addEventListener('message', (e: MessageEvent<ToFrame>) => {
  if (e.source !== host) return;
  const m = e.data;
  if (m?.t === 'kit' && typeof m.engine === 'string' && typeof m.examples === 'string') kit = { ENGINE: m.engine, EXAMPLES: m.examples };
  else if (m?.t === 'draw' && typeof m.id === 'number' && typeof m.code === 'string') draw(m.id, m.code);
});
up({ t: 'ready' });
