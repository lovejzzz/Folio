import { runInNewContext } from 'node:vm';
import * as kit from './kitText';
import { errorText, programOf, readDrawn, type DrawResult } from './program';

/**
 * A card drawn in Node, for the command line and the tests. Node's vm is no sandbox: this is for drawings our own
 * pipeline asked for, run on our own machine. In a browser, cards are drawn in the drawing frame, which is one.
 */
export function drawInNode(code: string, timeoutMs = 4000): DrawResult {
  const box: Record<string, unknown> = {};
  try {
    runInNewContext(programOf(kit, code), box, { timeout: timeoutMs });
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
  return readDrawn(box['__drawn']);
}

export const fonts = { GAEGU: kit.GAEGU, YOUNG_SERIF: kit.YOUNG_SERIF };
