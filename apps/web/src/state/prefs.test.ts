import { describe, expect, it } from 'vitest';
import { sanitizePrefs, usePrefs } from './prefs';

describe('stored preferences', () => {
  const current = usePrefs.getState();

  it('keeps valid values', () => {
    const merged = sanitizePrefs({ theme: 'dark', uiLanguage: 'zh-CN', provider: 'openai', keys: { openai: 'sk-1' } }, current);
    expect(merged).toMatchObject({ theme: 'dark', uiLanguage: 'zh-CN', provider: 'openai', keys: { openai: 'sk-1' } });
  });

  it('drops values the app does not know, instead of crashing on them', () => {
    const merged = sanitizePrefs({ theme: 'sepia', uiLanguage: 'zh', density: 3, provider: 'mistral', keys: { evil: 'x', anthropic: 4 }, localUrl: '' }, current);
    expect(merged.theme).toBe(current.theme);
    expect(merged.uiLanguage).toBe(current.uiLanguage);
    expect(merged.density).toBe(current.density);
    expect(merged.provider).toBe(current.provider);
    expect(merged.keys).toEqual({});
    expect(merged.localUrl).toBe(current.localUrl);
    expect(typeof merged.set).toBe('function');
  });

  it('survives garbage', () => {
    expect(sanitizePrefs('nonsense', current).theme).toBe(current.theme);
    expect(sanitizePrefs(null, current).uiLanguage).toBe(current.uiLanguage);
  });
});
