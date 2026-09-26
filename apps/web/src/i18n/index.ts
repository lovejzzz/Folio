import { usePrefs, type UiLanguage } from '../state/prefs';
import { en, type Messages } from './en';
import { zh } from './zh';

export type { Messages };

const catalogs: Record<UiLanguage, Messages> = { en, 'zh-CN': zh };

export function messagesFor(language: UiLanguage): Messages {
  return catalogs[language] ?? en;
}

/** The interface copy in the teacher's chosen language. */
export function useT(): Messages {
  return messagesFor(usePrefs((s) => s.uiLanguage));
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
