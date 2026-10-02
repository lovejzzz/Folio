import { describe, expect, it } from 'vitest';
import { en } from '../../i18n/en';
import { guessLessons, guessLevel, guessMinutes } from '../../lib/brief';
import { EXAMPLE_BRIEFS } from './exampleBriefs';
import { BANDS, pickExamples, type Band } from './examples';

/** The levels Folio reads from a brief, by band. */
const LEVELS: Record<Band, RegExp> = {
  elementary: /^(?:Kindergarten|Grade [1-5]|Elementary school)$/,
  secondary: /^(?:Grade (?:[6-9]|1[0-2])|Middle school|High school)$/,
  university: /^(?:Undergraduate|Graduate \(master’s\)|Doctoral \(PhD\))$/,
};

describe('the example courses on the home page', () => {
  for (const band of BANDS) {
    it.each(en.home.examples[band])(`${band}: %s writes a brief that reads as its level, lesson count and length`, (label) => {
      const brief = EXAMPLE_BRIEFS[label]!;
      expect(guessLevel(brief)).toMatch(LEVELS[band]);
      // The brief's lesson count is the one on the chip.
      expect(guessLessons(brief)).toBe(Number(label.match(/(\d+) (?:lessons|lectures|seminars|weeks)$/)![1]));
      expect(guessMinutes(brief)).not.toBeNull();
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
  it('have labels that fit on one line on a phone', () => {
    for (const band of BANDS) for (const example of en.home.examples[band]) expect(example.length, example).toBeLessThanOrEqual(50);
  });

  it('are all different, several to a band, and show what a good brief says', () => {
    const all = BANDS.flatMap((band) => en.home.examples[band]);
    expect(new Set(all).size).toBe(all.length);
    for (const band of BANDS) expect(en.home.examples[band].length).toBeGreaterThanOrEqual(5);
    for (const label of all) expect(EXAMPLE_BRIEFS[label]?.length ?? 0, label).toBeGreaterThan(250);
    expect(Object.keys(EXAMPLE_BRIEFS).sort()).toEqual([...all].sort());
  });
});
