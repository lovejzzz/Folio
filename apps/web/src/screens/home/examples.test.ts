import { describe, expect, it } from 'vitest';
import { en } from '../../i18n/en';
import { guessLessons, guessLevel } from '../../lib/brief';
import { BANDS, pickExamples, type Band } from './examples';

/** The levels Folio reads from a brief, by band. */
const LEVELS: Record<Band, RegExp> = {
  elementary: /^(?:Grade [1-5]|Elementary school)$/,
  secondary: /^(?:Grade (?:[6-9]|1[0-2])|Middle school|Grade 9–10|Grade 11–12)$/,
  university: /^College$/,
};

describe('the example briefs on the home page', () => {
  for (const band of BANDS) {
    it.each(en.home.examples[band])(`${band}: %s reads as its level, with a lesson count`, (example) => {
      expect(guessLevel(example)).toMatch(LEVELS[band]);
      expect(guessLessons(example)).not.toBeNull();
    });
  }

  it('are one from each band, youngest first', () => {
    const picked = pickExamples(en.home.examples, [], () => 0);
    expect(picked).toEqual(BANDS.map((band) => en.home.examples[band][0]));
  });

  it('are never the ones shown last time', () => {
    const last = pickExamples(en.home.examples, []);
    for (let i = 0; i < 50; i++) {
      const next = pickExamples(en.home.examples, last);
      expect(next.some((e) => last.includes(e))).toBe(false);
    }
  });

  // Measured on a 375-pixel phone: 51 characters could already wrap.
  it('fit on one line on a phone', () => {
    for (const band of BANDS) for (const example of en.home.examples[band]) expect(example.length, example).toBeLessThanOrEqual(50);
  });

  it('are plenty and all different', () => {
    const all = BANDS.flatMap((band) => en.home.examples[band]);
    expect(new Set(all).size).toBe(all.length);
    for (const band of BANDS) expect(en.home.examples[band].length).toBeGreaterThanOrEqual(12);
  });
});
