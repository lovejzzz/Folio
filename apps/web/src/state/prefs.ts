import { DEFAULT_LOCAL_URL, DEFAULT_MODELS, PROVIDERS, isConfigured, type ModelSettings, type ProviderId } from '@folio/ai';
import { create } from 'zustand';
import { readHint } from './account';
import { createJSONStorage, persist } from 'zustand/middleware';

export type Theme = 'system' | 'light' | 'dark';
export type Density = 'comfortable' | 'compact';
/** How large the interface's text is: standard, or larger for teachers who want to read it more easily. */
export type TextSize = 'standard' | 'large' | 'larger';

interface Prefs {
  theme: Theme;
  density: Density;
  textSize: TextSize;
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
    density: oneOf(['comfortable', 'compact'], p.density, current.density),
    textSize: oneOf(['standard', 'large', 'larger'], p.textSize, current.textSize),
    railCollapsed: typeof p.railCollapsed === 'boolean' ? p.railCollapsed : current.railCollapsed,
    keys: record(p.keys),
    models: record(p.models),
    provider: p.provider === null ? null : PROVIDERS.includes(p.provider as ProviderId) ? (p.provider as ProviderId) : current.provider,
    localUrl: typeof p.localUrl === 'string' && p.localUrl ? p.localUrl : current.localUrl,
  };
}

export const usePrefs = create<Prefs>()(
  persist(
    (set) => ({
      theme: 'system',
      density: 'comfortable',
      textSize: 'standard',
      railCollapsed: false,
      keys: {},
      models: {},
      // New visitors write with Folio credits unless they choose a key of their own.
      provider: 'folio',
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
    // Folio credits go to Folio's own server, which sends the call on to Anthropic.
    baseUrl: provider === 'folio' ? `${typeof location === 'undefined' ? '' : location.origin}/api/ai` : p.localUrl,
  };
}

/** Is a model set up? Answered from preferences alone, without loading any SDK. Folio credits need a sign-in. */
export function hasModel(): boolean {
  const settings = modelSettings(usePrefs.getState());
  return isConfigured(settings) && (settings.provider !== 'folio' || readHint() !== null);
}

/** A screen that must look one way (the print view is paper) pins the theme while it is open. */
let pinned: Theme | null = null;

export function pinTheme(theme: Theme | null): void {
  pinned = theme;
  applyTheme(usePrefs.getState().theme);
}

/** The text size, on the page's root element, where the text tokens read it. */
export function applyTextSize(size: TextSize): void {
  const root = document.documentElement;
  if (size === 'standard') delete root.dataset.text;
  else root.dataset.text = size;
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  const shown = pinned ?? theme;
  if (shown === 'system') delete root.dataset.theme;
  else root.dataset.theme = shown;
}
