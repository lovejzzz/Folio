import { afterEach, describe, expect, it, vi } from 'vitest';
import { MATERIAL_KINDS } from '@folio/core';
import { en } from '../i18n/en';
import { creditsText, estimateCredits, refreshCredits, useCredits } from './credits';

/** The free credits, as the server grants them (server/src/credits.ts FREE_CREDITS). */
const FREE = 750;

describe('what the free credits are said to cover', () => {
  it('is what the estimate says they cover', () => {
    const all = [...MATERIAL_KINDS];
    let lessons = 0;
    while (estimateCredits(lessons + 1, all) <= FREE) lessons += 1;
    for (const text of [creditsText.signInToStart, en.settings.providers.folio.note]) {
      expect(text).toContain(`${FREE} free credits`);
      expect(text).toContain(`about ${lessons} lessons`);
    }
  });
});

describe('the balance', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('says it couldn’t be loaded, keeps what it had, and loads when asked again', async () => {
    useCredits.setState({ balance: null, failed: false });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('busy', { status: 503 })));
    await refreshCredits();
    expect(useCredits.getState()).toMatchObject({ balance: null, failed: true });
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ balance: 640, available: true })));
    await refreshCredits();
    expect(useCredits.getState()).toMatchObject({ balance: 640, failed: false });
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))));
    await refreshCredits();
    expect(useCredits.getState()).toMatchObject({ balance: 640, failed: true });
  });
});
