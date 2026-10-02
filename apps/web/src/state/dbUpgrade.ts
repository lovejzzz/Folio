import type { Course } from '@folio/core';
import type { Transaction } from 'dexie';
import type { HistoryRow } from './historySync';
import { dryCourse, dryEntry, type Texts } from './sourceTexts';

/**
 * Version 4 keeps each course in three parts: its summary, its body without its files' text, and each text
 * once. Every course already here is split that way, and the files in its history dried, in the one upgrade
 * transaction: if anything fails, the database stays as it was.
 */
export async function upgradeToSeparateTexts(tx: Transaction): Promise<void> {
  const courses = tx.table('courses');
  const summaries = tx.table('summaries');
  const sources = tx.table('sources');
  const history = tx.table<HistoryRow, string>('history');
  const texts = new Map<string, Texts>();
  const keep = (courseId: string, found: Texts) => texts.set(courseId, { ...texts.get(courseId), ...found });

  for (const row of (await courses.toArray()) as (Record<string, unknown> & { id: string; data: Course })[]) {
    const { data, ...summary } = row;
    await summaries.put(summary);
    // A course from before files existed has nothing to take apart.
    if (!data.sources || typeof data.sources !== 'object') continue;
    const dried = dryCourse(data);
    keep(row.id, dried.texts);
    await courses.put({ id: row.id, data: dried.body });
  }
  for (const row of await history.toArray()) {
    const dried = dryEntry(row.entry);
    if (dried.entry === row.entry) continue;
    keep(row.courseId, dried.texts);
    await history.put({ ...row, entry: dried.entry });
  }
  for (const [courseId, found] of texts) {
    await sources.bulkPut(Object.entries(found).map(([id, text]) => ({ key: `${courseId}:${id}`, courseId, text })));
  }
}
