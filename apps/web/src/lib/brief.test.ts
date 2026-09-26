import { describe, expect, it } from 'vitest';
import { guessLanguage, guessLessons, guessLevel } from './brief';

describe('reading the brief for the chips', () => {
  it.each([
    ['A 4-lesson introduction to statistics', 4],
    ['six lessons on the French Revolution', 6],
    ['Photosynthesis for year 7, three lessons', 3],
    ['唐诗入门，四节课，初中二年级', 4],
    ['一个单元，10课时', 10],
    ['statistics for grade 11', null],
  ])('%s → %s lessons', (text, n) => expect(guessLessons(text)).toBe(n));

  it.each([
    ['intro statistics for grade 11', 'Grade 11'],
    ['Photosynthesis for year 7', 'Year 7'],
    ['a first-year university course', 'University'],
    ['唐诗入门，初中二年级', '初中二年级'],
    ['a course on bees', null],
  ])('%s → level %s', (text, level) => expect(guessLevel(text)).toBe(level));

  it('detects Chinese briefs', () => {
    expect(guessLanguage('唐诗入门，四节课')).toBe('zh-CN');
    expect(guessLanguage('The French Revolution')).toBe('en');
    expect(guessLanguage('ab')).toBeNull();
  });
});
