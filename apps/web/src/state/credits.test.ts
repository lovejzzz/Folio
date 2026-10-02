import { describe, expect, it } from 'vitest';
import { MATERIAL_KINDS } from '@folio/core';
import { en } from '../i18n/en';
import { creditsText, estimateCredits } from './credits';

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
