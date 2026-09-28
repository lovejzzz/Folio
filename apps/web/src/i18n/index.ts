import type { Flag } from '@folio/core';
import { en, type Messages } from './en';

export type { Messages };

/** The interface copy. Folio's interface is English. */
export function useT(): Messages {
  return en;
}

export function currentMessages(): Messages {
  return en;
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

/** "Needs a look" notes, one sentence per flag. */
export function flagText(flags: readonly Flag[], t: Messages): string {
  return flags.map((flag) => (t.flags[flag.code] as (v: unknown) => string)('values' in flag ? flag.values : {})).join(t.common.sentenceGap);
}
