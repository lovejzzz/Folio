import { readFileSync } from 'node:fs';
import { orderedLessons, parseCourse } from '@folio/core';
import { describe, expect, it } from 'vitest';
import { AS_RUN, sectionPrompt } from '../src/prompts';

/**
 * A lesson Folio really wrote (statistics with R, the frozen batch at 96e0492; test/fixtures/batch1-stats.json). Its
 * plan and its sheet's key, both set against a run of the code, say what `summary()` prints for a text column in
 * R 4.6. Its study guide, written after them and shown them, said what older versions printed.
 */
const course = parseCourse(JSON.parse(readFileSync(new URL('./fixtures/batch1-stats.json', import.meta.url), 'utf8')) as unknown);
const first = orderedLessons(course)[0]!;

describe('what a command prints, in the guide written after the plan', () => {
  it('was said two ways in the lesson as it was written', () => {
    const plan = first.segments.map((s) => s.teacherNotes).join('\n');
    const key = first.handouts.map((h) => h.key).join('\n');
    const guide = first.study.points.map((p) => p.explanation).join('\n');
    expect(plan).toContain('Text columns show length, the number of unique values, the number of blank entries, and minimum and maximum character lengths.');
    expect(key).toContain('character columns report length, unique values, blank entries, and minimum and maximum character lengths');
    expect(first.handouts.find((h) => h.title === 'A data frame and summary()')!.keyChecked).toBe('held');
    expect(guide).toContain('Text columns show only their length, class and mode');
  });

  it('is asked of the guide and the FAQ as the plan has it, in a lesson with code', () => {
    expect(sectionPrompt(course, first, 'study')).toContain(AS_RUN);
    expect(sectionPrompt(course, first, 'faq')).toContain(AS_RUN);
    // The plan they are shown carries the sentence itself.
    expect(sectionPrompt(course, first, 'study')).toContain('Text columns show length, the number of unique values');
  });

  it('is not asked where the plan has no code, nor of the writers the plan does not bind this way', () => {
    const plain = { ...first, segments: first.segments.map((s) => ({ ...s, description: s.description.replace(/`/g, ''), teacherNotes: s.teacherNotes.replace(/`/g, '') })) };
    expect(sectionPrompt(course, plain, 'study')).not.toContain(AS_RUN);
    expect(sectionPrompt(course, first, 'quiz')).not.toContain(AS_RUN);
  });
});
