import { readFileSync } from 'node:fs';
import { orderedLessons, type Lesson } from '@folio/core';
import { sampleCourse } from '@folio/core/sample';
import { describe, expect, it } from 'vitest';
import { codeCut, deckFaults } from '../src/slideSteps';

/** A lesson Folio really wrote: the plan shows the twelve lines of binary_search, and the deck has them on three slides. */
const real = JSON.parse(readFileSync(new URL('./fixtures/algorithms-code-cut.json', import.meta.url), 'utf8')) as { segmentNumber: number; shown: string[]; slides: { title: string; bullets: string[]; segment: number }[] };
const base = orderedLessons(sampleCourse())[0]!;
/** A lesson whose segment of that number shows what the real one showed. */
const lesson: Lesson = { ...base, segments: Array.from({ length: real.segmentNumber }, (_, i) => ({ ...base.segments[0]!, id: `x_${i}`, shown: i === real.segmentNumber - 1 ? real.shown : [] })) };
const code = real.shown.filter((x) => /^`[^`]+`$/.test(x.trim()));

describe('a block of code a plan shows', () => {
  it('is the real case: twelve lines, on more than one slide, on none of them whole', () => {
    expect(code.length).toBeGreaterThanOrEqual(12);
    expect(real.slides.filter((s) => s.bullets.some((b) => code.includes(b))).length).toBeGreaterThan(1);
  });

  it('is named where the deck cuts it over slides, and asked for once more', () => {
    expect(codeCut({ slides: real.slides }, lesson)).toEqual([real.segmentNumber]);
    expect(deckFaults({ slides: real.slides.map((s) => ({ layout: 'bullets' as const, notes: '', ...s })) }, lesson).some((f) => f.issue.includes('one block') && !f.kept)).toBe(true);
  });

  it('is let be where one slide holds all of it, with or without other slides repeating a line', () => {
    const whole = { title: 'Binary search', bullets: code, segment: real.segmentNumber };
    expect(codeCut({ slides: [whole] }, lesson)).toEqual([]);
    expect(codeCut({ slides: [whole, { title: 'Look at one line', bullets: [code[4]!, 'What does this line do?'], segment: real.segmentNumber }] }, lesson)).toEqual([]);
  });

  it('is let be where it is a single line, or too long for any slide', () => {
    const one: Lesson = { ...lesson, segments: lesson.segments.map((s) => ({ ...s, shown: s.shown?.length ? ['`x = 1`', 'Predict the result.', '`y = 2`'] : [] })) };
    expect(codeCut({ slides: [{ bullets: ['`x = 1`'], segment: real.segmentNumber }, { bullets: ['`y = 2`'], segment: real.segmentNumber }] }, one)).toEqual([]);
    const long: Lesson = { ...lesson, segments: lesson.segments.map((s) => ({ ...s, shown: s.shown?.length ? Array.from({ length: 20 }, (_, i) => `\`line_${i} = ${i}\``) : [] })) };
    expect(codeCut({ slides: [{ bullets: ['`line_0 = 0`'], segment: 1 }, { bullets: ['`line_1 = 1`'], segment: 1 }] }, long)).toEqual([]);
  });
});

describe('a function the writer cut into a slide and its "(continued)"', () => {
  // Two decks Folio really wrote after the writer was told, and asked again, to keep a function on one slide.
  const decks = (JSON.parse(readFileSync(new URL('./fixtures/algorithms-continued.json', import.meta.url), 'utf8')) as { decks: Record<string, { title: string; bullets: string[]; notes: string; segment: number }[]> }).decks;
  const allCode = (s: { bullets: string[] }) => s.bullets.length > 0 && s.bullets.every((b) => /^`[^`]+`$/.test(b.trim()));

  it('is the real case: in each deck, two slides of nothing but code, one after the other', () => {
    for (const deck of Object.values(decks)) expect(deck.some((s, i) => allCode(s) && deck[i + 1] !== undefined && allCode(deck[i + 1]!) && deck[i + 1]!.title.includes('continued'))).toBe(true);
  });

  it('is put back on one slide, every line in order, the first title kept, nothing else touched', async () => {
    const { joinCode } = await import('../src/slideSteps');
    for (const deck of Object.values(decks)) {
      const joined = joinCode(deck);
      expect(joined).toHaveLength(deck.length - 1);
      expect(joined.some((s) => s.title.includes('continued'))).toBe(false);
      expect(joined.flatMap((s) => s.bullets)).toEqual(deck.flatMap((s) => s.bullets));
      const block = joined.find((s) => allCode(s))!;
      expect(block.bullets.length).toBeGreaterThanOrEqual(10);
      expect(block.bullets[0]).toMatch(/^`def /);
    }
  });

  it('leaves apart code in different segments, code with other lines, and what would not fit one slide', async () => {
    const { joinCode } = await import('../src/slideSteps');
    const code = (n: number, segment: number, extra: string[] = []) => ({ title: 'T', notes: '', segment, bullets: [...Array.from({ length: n }, (_, i) => `\`x${i} = ${i}\``), ...extra] });
    expect(joinCode([code(3, 1), code(3, 2)])).toHaveLength(2);
    expect(joinCode([code(3, 1), code(3, 1, ['What does it print?'])])).toHaveLength(2);
    expect(joinCode([code(9, 1), code(9, 1)])).toHaveLength(2);
    expect(joinCode([code(3, 1), code(3, 1), code(3, 1)])).toHaveLength(1);
  });
});
