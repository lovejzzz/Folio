import { DEFAULT_LOCAL_URL, DEFAULT_MODELS, isConfigured, type ModelSettings, type ProviderId } from '@folio/ai';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type Theme = 'system' | 'light' | 'dark';
export type UiLanguage = 'en' | 'zh-CN';
export type Density = 'comfortable' | 'compact';

interface Prefs {
  theme: Theme;
  uiLanguage: UiLanguage;
  density: Density;
  railCollapsed: boolean;
  /** Keys for every provider are kept so switching back doesn't lose one. */
  keys: Partial<Record<ProviderId, string>>;
  models: Partial<Record<ProviderId, string>>;
  provider: ProviderId | null;
  localUrl: string;
  set: (patch: Partial<Omit<Prefs, 'set'>>) => void;
}

/** A storage that never throws: private windows and blocked storage just forget. */
const safeStorage = createJSONStorage(() => ({
  getItem: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* storage unavailable */
    }
  },
  removeItem: (k: string) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* storage unavailable */
    }
  },
}));

const PROVIDERS: ProviderId[] = ['anthropic', 'openai', 'google', 'local'];
const oneOf = <T extends string>(allowed: readonly T[], value: unknown, fallback: T): T => (allowed.includes(value as T) ? (value as T) : fallback);
const record = (value: unknown): Partial<Record<ProviderId, string>> =>
  value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).filter(([k, v]) => PROVIDERS.includes(k as ProviderId) && typeof v === 'string'))
    : {};

/** Stored preferences are checked field by field, so a stale or edited value never breaks the app. */
export function sanitizePrefs(stored: unknown, current: Prefs): Prefs {
  const p = (stored && typeof stored === 'object' ? stored : {}) as Record<string, unknown>;
  return {
    ...current,
    theme: oneOf(['system', 'light', 'dark'], p.theme, current.theme),
    uiLanguage: oneOf(['en', 'zh-CN'], p.uiLanguage, current.uiLanguage),
    density: oneOf(['comfortable', 'compact'], p.density, current.density),
    railCollapsed: typeof p.railCollapsed === 'boolean' ? p.railCollapsed : current.railCollapsed,
    keys: record(p.keys),
    models: record(p.models),
    provider: p.provider === null ? null : PROVIDERS.includes(p.provider as ProviderId) ? (p.provider as ProviderId) : current.provider,
    localUrl: typeof p.localUrl === 'string' && p.localUrl ? p.localUrl : current.localUrl,
  };
}

function defaultLanguage(): UiLanguage {
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
}

export const usePrefs = create<Prefs>()(
  persist(
    (set) => ({
      theme: 'system',
      uiLanguage: defaultLanguage(),
      density: 'comfortable',
      railCollapsed: false,
      keys: {},
      models: {},
      provider: null,
      localUrl: DEFAULT_LOCAL_URL,
      set: (patch) => set(patch),
    }),
    { name: 'folio.prefs', storage: safeStorage, version: 1, merge: sanitizePrefs },
  ),
);

export function modelSettings(p: Pick<Prefs, 'provider' | 'keys' | 'models' | 'localUrl'>, provider = p.provider): ModelSettings | null {
  if (!provider) return null;
  return {
    provider,
    apiKey: p.keys[provider] ?? '',
    model: p.models[provider] || DEFAULT_MODELS[provider],
    baseUrl: p.localUrl,
  };
}

/** Is a model set up? Answered from preferences alone, without loading any SDK. */
export function hasModel(): boolean {
  return isConfigured(modelSettings(usePrefs.getState()));
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
}
