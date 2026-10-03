import { orderedLessons } from '@folio/core';
import { describe, expect, it } from 'vitest';
import { generateSection, type CompletionRequest, type SectionProgress } from '../src';
import { fakeInference, planDraft, smallCourse } from './fake';

/** A model that streams its answer in three pieces before returning it whole. */
function streaming(answer: unknown) {
  return fakeInference((req: CompletionRequest) => {
    const text = JSON.stringify(answer);
    for (const end of [20, 60, text.length]) req.onText?.(text.slice(0, end));
    return answer;
  });
}

describe('a section taking shape', () => {
  it('is shown as it streams in, then checked, then what the check changed', async () => {
    const course = smallCourse();
    const lesson = orderedLessons(course)[0]!;
    const seen: SectionProgress[] = [];
    const reviewer = fakeInference(() => ({
      issues: [{ part: 'segment', number: 2, field: 'teacherNotes', kind: 'fact', why: 'Say which atoms to balance.', find: 'Balance it together.', replace: 'Balance the oxygen together.' }],
    }));
    await generateSection(streaming(planDraft), course, lesson.id, 'plan', undefined, { reviewer, onProgress: (p) => seen.push(p) });
    const partials = seen.filter((p) => p.type === 'partial');
    expect(partials.length).toBeGreaterThanOrEqual(2);
    expect(partials.at(-1)).toEqual({ type: 'partial', value: planDraft });
    expect(seen.slice(-2)).toEqual([{ type: 'checking' }, { type: 'reviewed', fixes: ['Say which atoms to balance.'], notes: 0 }]);
  });

  const note = (why: string) => ({ part: 'segment', number: 1, field: 'description', kind: 'feasibility', why, find: '', replace: '' });

  it('is written once more when its review leaves notes, told what they are, and kept if it comes back cleaner', async () => {
    const course = smallCourse();
    const lesson = orderedLessons(course)[0]!;
    const writer = fakeInference((_req, call) => (call === 1 ? planDraft : { ...planDraft, keyIdeas: ['Rewritten', 'Plants make sugar from light'] }));
    const reviewer = fakeInference((_req, call) => ({ issues: call === 1 ? [note('The leaves need a week in the dark first.')] : [] }));
    const result = await generateSection(writer, course, lesson.id, 'plan', undefined, { reviewer });
    expect(writer.calls).toHaveLength(2);
    expect(writer.calls[1]!.prompt).toContain('The leaves need a week in the dark first.');
    expect(result.flagged).toBe(0);
    expect(JSON.stringify(result.commands)).toContain('Rewritten');
  });

  it('keeps the first plan when the rewrite does no better', async () => {
    const course = smallCourse();
    const lesson = orderedLessons(course)[0]!;
    const writer = fakeInference((_req, call) => (call === 1 ? planDraft : { ...planDraft, keyIdeas: ['Rewritten', 'Plants make sugar from light'] }));
    const reviewer = fakeInference(() => ({ issues: [note('Still not possible in the time.')] }));
    const result = await generateSection(writer, course, lesson.id, 'plan', undefined, { reviewer });
    expect(result.flagged).toBe(1);
    expect(JSON.stringify(result.commands)).not.toContain('Rewritten');
  });

  it('is not asked to stream when nobody is watching', async () => {
    const course = smallCourse();
    const writer = streaming({ slides: [{ layout: 'title', title: 'T', bullets: [], notes: '' }] });
    await generateSection(writer, course, orderedLessons(course)[0]!.id, 'slides').catch(() => undefined);
    expect(writer.calls[0]!.onText).toBeUndefined();
  });
});
