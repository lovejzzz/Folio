import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { sectionPrompt } from '../src/prompts';
import { deckFaults, spokenFixes } from '../src/slideSteps';
import { sampleCourse } from '@folio/core/sample';
import { orderedLessons } from '@folio/core';

/**
 * A slide Folio really wrote: students are asked how long "one 4096 × 4096 matrix of 32-bit numbers (201 MB)" takes to
 * copy. One such matrix is 67.1 MB; 201 MB is three. The notes know it, and have the teacher say so aloud.
 */
const real = JSON.parse(readFileSync(new URL('./fixtures/ai-training-201mb.json', import.meta.url), 'utf8')) as { segment: { shown: string[]; teacherNotes: string }; slide: { bullets: string[]; notes: string } };

describe('a figure on a slide that its notes explain away', () => {
  it('is the real case: the screen and the slide say 201 MB of one matrix, the notes 67.1 MB', () => {
    expect(real.segment.shown.join(' ')).toContain('one 4096 × 4096 matrix of 32-bit numbers (201 MB)');
    expect(real.slide.bullets.join(' ')).toContain('(201 MB)');
    expect(real.segment.teacherNotes).toContain('one matrix occupies 67,108,864 bytes, about 67.1 MB');
    expect(4096 * 4096 * 4).toBe(67_108_864);
  });

  it('is named on the deck, with the sentence, and kept for the teacher if a second writing leaves it', () => {
    expect(spokenFixes({ slides: [{ notes: 'Nothing of the kind.' }, real.slide] })).toEqual([{ n: 2, said: 'the 201 MB on the slide is all three matrices together (two inputs and the returned output)' }]);
    const lesson = orderedLessons(sampleCourse())[0]!;
    const fault = deckFaults({ slides: [{ layout: 'bullets', title: 'Memory', bullets: real.slide.bullets, notes: real.slide.notes, segment: 0 }] }, lesson).find((f) => f.issue.includes('201 MB'));
    expect(fault).toMatchObject({ kept: true });
  });

  it('lets be notes that speak of the slide without correcting a figure on it, and work shown wrong on purpose', () => {
    const fine = ['Point to the 16 GB/s on the slide and ask what it limits.', 'The student’s work on the screen is wrong; do not present it as a model.', 'Stress the common error on the slide: a comparison group alone does not make a study a cohort.', 'Read the three values on the slide aloud.'];
    expect(spokenFixes({ slides: fine.map((notes) => ({ notes })) })).toEqual([]);
  });

  it('is told to the slide writer as a rule', () => {
    const course = sampleCourse();
    expect(sectionPrompt(course, orderedLessons(course)[0]!, 'slides')).toContain('speaker notes never correct what a slide shows');
  });
});
