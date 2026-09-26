import { DEFAULT_LOCAL_URL, DEFAULT_MODELS, type ModelSettings, type ProviderId } from '@folio/ai';
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
    { name: 'folio.prefs', storage: safeStorage, version: 1 },
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

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
}
