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
