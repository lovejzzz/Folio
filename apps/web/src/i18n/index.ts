import type { Flag } from '@folio/core';
import { useSyncExternalStore } from 'react';
import { usePrefs, type UiLanguage } from '../state/prefs';
import { en, type Messages } from './en';

export type { Messages };

/** English ships with the page; Chinese loads only for those who use it. */
const catalogs: Partial<Record<UiLanguage, Messages>> = { en };
const loaders: Record<Exclude<UiLanguage, 'en'>, () => Promise<Messages>> = {
  'zh-CN': () => import('./zh').then((m) => m.zh),
};
const listeners = new Set<() => void>();
let loaded = 0;

/** Fetch a language's copy; resolves at once if it is already here. */
export async function loadCatalog(language: UiLanguage): Promise<void> {
  if (catalogs[language] || language === 'en') return;
  catalogs[language] = await loaders[language]();
  loaded++;
  for (const l of listeners) l();
}

export function messagesFor(language: UiLanguage): Messages {
  if (!catalogs[language]) void loadCatalog(language);
  return catalogs[language] ?? en;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The interface copy in the teacher's chosen language. */
export function useT(): Messages {
  const language = usePrefs((s) => s.uiLanguage);
  useSyncExternalStore(subscribe, () => loaded);
  return messagesFor(language);
}

export function currentMessages(): Messages {
  return messagesFor(usePrefs.getState().uiLanguage);
}

/** "3 minutes ago" in the interface language. */
export function relativeTime(iso: string, language: UiLanguage, now = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(language, { numeric: 'auto' });
  const abs = Math.abs(seconds);
  if (abs < 45) return rtf.format(0, 'second');
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(seconds / 86400), 'day');
  return new Date(iso).toLocaleDateString(language, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** "Needs a look" notes in the interface language, one sentence per flag. */
export function flagText(flags: readonly Flag[], t: Messages): string {
  return flags.map((flag) => (t.flags[flag.code] as (v: unknown) => string)('values' in flag ? flag.values : {})).join(t.common.sentenceGap);
}

/** React Aria's own strings ("Increase", "Dismiss") follow the interface language. */
export function ariaLocale(language: UiLanguage): string {
  return language === 'zh-CN' ? 'zh-CN' : 'en-GB';
}
