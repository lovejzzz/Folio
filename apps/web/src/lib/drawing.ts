import type { Drawer, Picture } from '@folio/ai';
import type { DrawResult, Drawn } from '@folio/draw';
import type { FromFrame, ToFrame } from '@folio/draw/frame';

/**
 * Drawn slide pictures, on the page. A picture's code is run in the drawing frame (/draw/, made by draw.plugin.ts),
 * one hidden frame with no origin, no network and no storage. What comes back is SVG text, shown as an <img>:
 * a picture runs nothing and loads nothing. The kit (about 450 KB) is loaded the first time a picture is drawn.
 */

interface Frame {
  post(m: ToFrame): void;
}

const ANSWER_MS = 15_000;
let made: Promise<Frame> | null = null;
const waiting = new Map<number, (r: DrawResult) => void>();
let next = 1;

function openFrame(): Promise<Frame> {
  const opening = (async () => {
    const kit = await import('@folio/draw/kit');
    const el = document.createElement('iframe');
    el.setAttribute('sandbox', 'allow-scripts');
    el.setAttribute('aria-hidden', 'true');
    el.tabIndex = -1;
    el.title = 'drawing';
    el.style.display = 'none';
    const ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('The drawing frame did not open.')), ANSWER_MS);
      window.addEventListener('message', (e: MessageEvent<FromFrame>) => {
        if (e.source !== el.contentWindow || !e.data) return;
        if (e.data.t === 'ready') {
          clearTimeout(timer);
          resolve();
        } else if (e.data.t === 'drawn') {
          waiting.get(e.data.id)?.(e.data.result);
          waiting.delete(e.data.id);
        }
      });
    });
    el.src = '/draw/';
    document.body.append(el);
    await ready;
    const post = (m: ToFrame): void => el.contentWindow?.postMessage(m, '*');
    post({ t: 'kit', engine: kit.ENGINE, examples: kit.EXAMPLES });
    return { post };
  })();
  // A frame that failed to open is tried again next time, not remembered as failed.
  opening.catch(() => (made = null));
  return opening;
}

/** A card's code, drawn in the frame: its SVG and parts, or why it could not be drawn. */
export async function drawCard(code: string): Promise<DrawResult> {
  let frame: Frame;
  try {
    frame = await (made ??= openFrame());
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  const id = next++;
  return new Promise((resolve) => {
    waiting.set(id, resolve);
    frame.post({ t: 'draw', id, code });
    setTimeout(() => waiting.delete(id) && resolve({ ok: false, error: 'The drawing frame did not answer.' }), ANSWER_MS);
  });
}

const pictures = new Map<string, Promise<string | null>>();

/** The picture as a standalone SVG with its letters inside, or null where the code draws nothing. Kept by code. */
export function drawingSvg(code: string): Promise<string | null> {
  let found = pictures.get(code);
  if (!found) {
    found = (async () => {
      const [r, kit, { pictureOf }] = await Promise.all([drawCard(code), import('@folio/draw/kit'), import('@folio/draw')]);
      return r.ok ? pictureOf(r.drawn[0]!, kit) : null;
    })();
    pictures.set(code, found);
    // A failure is not kept: the next look draws it again.
    void found.then((svg) => svg === null && pictures.delete(code));
  }
  return found;
}

const addresses = new Map<string, string>();

/** An address an <img> can show the picture from. */
export async function drawingAddress(code: string): Promise<string | null> {
  const known = addresses.get(code);
  if (known) return known;
  const svg = await drawingSvg(code);
  if (!svg) return null;
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  addresses.set(code, url);
  return url;
}

/** The picture painted as a PNG, `width` pixels across: for a deck, a document, or a download. */
export async function drawingPng(code: string, width = 1560): Promise<{ bytes: Uint8Array; width: number; height: number } | null> {
  const url = await drawingAddress(code);
  if (!url) return null;
  const img = new Image();
  img.src = url;
  await img.decode();
  const height = Math.round((width * 420) / 520);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')?.drawImage(img, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  return blob && { bytes: new Uint8Array(await blob.arrayBuffer()), width, height };
}

/** A drawn card painted as the AI is shown it: JPEG, the sheet at twice its size. */
export async function paintDrawn(drawn: Drawn): Promise<Picture | null> {
  const [kit, { pictureOf }] = await Promise.all([import('@folio/draw/kit'), import('@folio/draw')]);
  const url = URL.createObjectURL(new Blob([pictureOf(drawn, kit)], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 1040;
    canvas.height = 840;
    canvas.getContext('2d')?.drawImage(img, 0, 0, 1040, 840);
    const data = canvas.toDataURL('image/jpeg', 0.85);
    return { type: 'image/jpeg', data: data.slice(data.indexOf(',') + 1) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The drawer a build or a teacher's request is given: drawn in the frame, painted on a canvas to be looked at. */
export const pageDrawer: Drawer = Object.assign((code: string) => drawCard(code), { paint: paintDrawn });
