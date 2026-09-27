import type { HistoryEntry } from '@folio/core';

/**
 * Undo history is kept on disk one row per entry, beside the course, so a
 * save writes only the entries that are new or changed (an undo flips
 * `undone`, a redo refreshes `refs`) and deletes the ones history dropped.
 */

export interface HistoryRow {
  /** `${courseId}:${entryId}` */
  key: string;
  courseId: string;
  /** Order within the course's history. */
  seq: number;
  /** The course schema the patches were recorded against; rows from another are not restored. */
  schemaVersion: number;
  entry: HistoryEntry;
}

export interface HistoryWrite {
  courseId: string;
  /** Delete every row of this course first (this tab's history replaces what is there). */
  replace: boolean;
  put: HistoryRow[];
  remove: string[];
}

interface Saved {
  seq: number;
  undone: boolean;
  refs: unknown;
}

/** What this tab knows is on disk for the open course. */
export interface HistoryTracker {
  saved: Map<string, Saved>;
  nextSeq: number;
  /** Set when the next save should rewrite the course's history from scratch. */
  replace: boolean;
}

export const rowKey = (courseId: string, entryId: string): string => `${courseId}:${entryId}`;

/** Rows as loaded, oldest first; `restorable` is what may go back into the store. */
export function sortRows(rows: readonly HistoryRow[], schemaVersion: number): { rows: HistoryRow[]; restorable: HistoryEntry[] } {
  const sorted = [...rows].sort((a, b) => a.seq - b.seq);
  return { rows: sorted, restorable: sorted.filter((r) => r.schemaVersion === schemaVersion).map((r) => r.entry) };
}

export function trackerFrom(rows: readonly HistoryRow[]): HistoryTracker {
  const saved = new Map<string, Saved>();
  let nextSeq = 0;
  for (const row of rows) {
    saved.set(row.entry.id, { seq: row.seq, undone: row.entry.undone, refs: row.entry.refs });
    nextSeq = Math.max(nextSeq, row.seq + 1);
  }
  return { saved, nextSeq, replace: false };
}

/**
 * The write that makes storage match `entries`, and the tracker to keep
 * once it has landed. Rows hold shallow copies, so a later undo in memory
 * can't change a row between now and the write.
 */
export function historyDelta(courseId: string, entries: readonly HistoryEntry[], tracker: HistoryTracker, schemaVersion: number): { write: HistoryWrite; next: HistoryTracker } {
  const replace = tracker.replace;
  const before = replace ? new Map<string, Saved>() : tracker.saved;
  const saved = new Map<string, Saved>();
  let nextSeq = replace ? 0 : tracker.nextSeq;
  const put: HistoryRow[] = [];
  for (const entry of entries) {
    const known = before.get(entry.id);
    const seq = known?.seq ?? nextSeq++;
    saved.set(entry.id, { seq, undone: entry.undone, refs: entry.refs });
    if (known && known.undone === entry.undone && known.refs === entry.refs) continue;
    put.push({ key: rowKey(courseId, entry.id), courseId, seq, schemaVersion, entry: { ...entry } });
  }
  const remove = [...before.keys()].filter((id) => !saved.has(id)).map((id) => rowKey(courseId, id));
  return { write: { courseId, replace, put, remove }, next: { saved, nextSeq, replace: false } };
}

export function isEmptyWrite(write: HistoryWrite): boolean {
  return !write.replace && write.put.length === 0 && write.remove.length === 0;
}

/** Saved history with the journal's unsaved entries laid over it: changed ones in place, new ones at the end. */
export function mergeHistory(saved: readonly HistoryEntry[], unsaved: readonly HistoryEntry[]): HistoryEntry[] {
  const out = [...saved];
  const at = new Map(out.map((e, i) => [e.id, i]));
  for (const entry of unsaved) {
    const i = at.get(entry.id);
    if (i === undefined) out.push(entry);
    else out[i] = entry;
  }
  return out;
}
