import { parseCourse, type Course } from '@folio/core';
import type { HistoryRow } from './historySync';
import { dryCourse, dryEntry, neededTexts, wetCourse, wetEntry, type Texts } from './sourceTexts';

/**
 * A course goes to the account as its body (the course without its files' text) and its latest history; each
 * file's text goes once, on its own. So a small change uploads a small body, and a device that already has a
 * file never downloads it again.
 */

/** The steps of history that go to the account: enough to undo recent work on another device. */
export const HISTORY_SENT = 100;

export interface Sending {
  payload: { course: Course; history: HistoryRow[] };
  texts: Texts;
  /** Every text the payload refers to, which the account must hold before it takes the body. */
  needed: string[];
}

export function forSending(course: Course, history: readonly HistoryRow[]): Sending {
  const { body, texts } = dryCourse(course);
  const recent = [...history]
    .sort((a, b) => a.seq - b.seq)
    .slice(-HISTORY_SENT)
    .map((row) => {
      const dried = dryEntry(row.entry);
      Object.assign(texts, dried.texts);
      return { ...row, entry: dried.entry };
    });
  const payload = { course: body, history: recent };
  return { payload, texts, needed: [...neededTexts(payload)] };
}

/** Send each text the account doesn't hold yet, as far as this device knows. */
export async function sendTexts(sending: Sending, alreadySent: readonly string[], send: (sourceId: string, text: string) => Promise<void>): Promise<void> {
  const sent = new Set(alreadySent);
  for (const id of sending.needed) if (!sent.has(id)) await send(id, sending.texts[id]!);
}

/**
 * The account's copy made whole: texts this device holds are used, the rest fetched. A copy saved before texts
 * were kept apart carries its own and needs none. A text the account can't give means the copy isn't whole,
 * and it is not taken (wetting throws), rather than open with a file silently empty.
 */
export async function wholeCopy(
  payload: { course: Course; history: HistoryRow[] },
  local: Texts,
  fetchText: (sourceId: string) => Promise<string>,
): Promise<{ course: Course; history: HistoryRow[]; held: string[] }> {
  const held = [...neededTexts(payload)];
  const texts: Texts = { ...local };
  for (const id of held) texts[id] ??= await fetchText(id);
  return {
    course: parseCourse(wetCourse(payload.course, texts)),
    history: payload.history.map((row) => ({ ...row, entry: wetEntry(row.entry, texts) })),
    held,
  };
}
