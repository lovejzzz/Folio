import { describe, expect, it } from 'vitest';
import { asksForSources } from './sourceHint';

describe('asksForSources', () => {
  it('notices a brief that asks for source work or names the teacher’s notes', () => {
    for (const brief of [
      'GCSE History: four lessons built around source analysis and one essay.',
      'Using primary sources from the Industrial Revolution.',
      'Two lessons built on my notes about photosynthesis experiments.',
      '初中历史，三节课，以史料分析为主。',
    ])
      expect(asksForSources(brief)).toBe(true);
  });

  it('leaves ordinary briefs alone', () => {
    for (const brief of ['Renewable sources of energy for year 8, three lessons.', 'Descriptive statistics for grade 11.', '唐诗入门，三节课。']) expect(asksForSources(brief)).toBe(false);
  });
});
