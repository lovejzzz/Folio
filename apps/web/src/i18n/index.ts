import type { Flag } from '@folio/core';
import { useSyncExternalStore } from 'react';
import { en, type Messages } from './en';
import { onlineEn } from './online';

export type { Messages };

let weekly = false;
const watchers = new Set<() => void>();
const watch = (f: () => void) => {
  watchers.add(f);
  return () => void watchers.delete(f);
};

/** Told by the session which kind of course is open: one taught online on the students' own time is worded in weeks. */
export function setWeeklyCourse(on: boolean): void {
  if (on === weekly) return;
  weekly = on;
  for (const f of watchers) f();
}

export function currentMessages(): Messages {
  return weekly ? onlineEn : en;
}

/** The interface copy. Folio's interface is English. */
export function useT(): Messages {
  return useSyncExternalStore(watch, currentMessages, () => en);
}

/** "3 minutes ago". */
export function relativeTime(iso: string, now = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const abs = Math.abs(seconds);
  if (abs < 45) return rtf.format(0, 'second');
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(seconds / 86400), 'day');
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** One sentence for one "needs a look" note. */
export function flagLine(flag: Flag, t: Messages): string {
  return (t.flags[flag.code] as (v: unknown) => string)('values' in flag ? flag.values : {});
}

/** "Needs a look" notes, one sentence per flag. */
export function flagText(flags: readonly Flag[], t: Messages): string {
  return flags.map((flag) => (t.flags[flag.code] as (v: unknown) => string)('values' in flag ? flag.values : {})).join(t.common.sentenceGap);
}
