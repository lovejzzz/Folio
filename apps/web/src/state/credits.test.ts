import { afterEach, describe, expect, it, vi } from 'vitest';
import { MATERIAL_KINDS } from '@folio/core';
import { creditsText, estimateCredits, refreshCredits, useCredits } from './credits';
import { settingsText } from '../i18n/settingsText';

/** The free credits, as the server grants them (server/src/credits.ts FREE_CREDITS). */
const FREE = 750;

describe('what the free credits are said to cover', () => {
  it('is what the estimate says they cover', () => {
    const all = [...MATERIAL_KINDS];
    let lessons = 0;
    while (estimateCredits(lessons + 1, all) <= FREE) lessons += 1;
    for (const text of [creditsText.signInToStart, settingsText.providers.folio.note]) {
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

describe('what a course is said to cost before it is written', () => {
  it('is the measured cost: in credits at the markup, and in dollars for a teacher with a key of their own', async () => {
    const { estimateDollars } = await import('./credits');
    const all = [...MATERIAL_KINDS];
    // A lesson with every material: 204 credits, 68 cents of calls. Fourteen of them: between nine and ten dollars.
    expect(estimateCredits(1, all)).toBe(210);
    expect(estimateDollars(1, all)).toBeCloseTo(0.68, 2);
    expect(creditsText.ownKey(estimateDollars(14, all))).toBe('About $9.5 at your provider’s prices, as measured on courses like this one.');
  });

  it('counts what a choice has written, not only what was ticked: rubrics alone are written with their graded work', async () => {
    const { estimateDollars, neededToo } = await import('./credits');
    // As it was: rubrics alone were estimated at nothing, and the build wrote the assignments.
    expect(estimateCredits(4, ['rubrics'])).toBe(estimateCredits(4, ['assignments']));
    expect(estimateCredits(4, ['rubrics'])).toBe(130);
    expect(estimateDollars(4, ['rubrics'])).toBeGreaterThan(0);
    expect(neededToo(['rubrics'])).toEqual([{ kind: 'assignments', neededBy: 'rubrics' }]);
    // Chosen together they are written once, and nothing is needed that was not chosen.
    expect(estimateCredits(4, ['assignments', 'rubrics'])).toBe(130);
    expect(neededToo(['assignments', 'rubrics'])).toEqual([]);
    expect(neededToo(['slides'])).toEqual([]);
  });
});

