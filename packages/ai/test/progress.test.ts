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

  const mended = { segments: [{ number: 1, ...planDraft.segments[0]!, description: 'Compare a leaf kept a week in the dark with one from the window.' }], left: [] };

  it('is mended where its review leaves notes, and read again by a reviewer told what was found', async () => {
    const course = smallCourse();
    const lesson = orderedLessons(course)[0]!;
    const writer = fakeInference((req) => (req.task === 'folio_plan_mend' ? mended : planDraft));
    const reviewer = fakeInference((_req, call) => ({ issues: call === 1 ? [note('The leaves need a week in the dark first.')] : [] }));
    const result = await generateSection(writer, course, lesson.id, 'plan', undefined, { reviewer });
    expect(writer.calls.map((c) => c.task)).toEqual(['folio_plan', 'folio_plan_mend']);
    expect(writer.calls[1]!.prompt).toContain('1. Segment 1, Leaf in the dark: The leaves need a week in the dark first.');
    expect(reviewer.calls[1]!.prompt).toMatch(/read once already[\s\S]*Written again since: Segment 1\./);
    expect(result.flagged).toBe(0);
    // Only the segment at fault changed: the rest is the plan as first written.
    expect(JSON.stringify(result.commands)).toContain('kept a week in the dark');
    expect(JSON.stringify(result.commands)).toContain('Walk through 6CO2 + 6H2O.');
  });

  it('keeps the plan as it was when a mend leaves more to put right than it found', async () => {
    const course = smallCourse();
    const lesson = orderedLessons(course)[0]!;
    const writer = fakeInference((req) => (req.task === 'folio_plan_mend' ? mended : planDraft));
    const seen: SectionProgress[] = [];
    const reviewer = fakeInference((_req, call) => ({ issues: call === 1 ? [note('Not possible in the time.')] : [note('Still not possible.'), note('And the leaf is now the wrong one.')] }));
    const result = await generateSection(writer, course, lesson.id, 'plan', undefined, { reviewer, onProgress: (p) => seen.push(p) });
    expect(result.flagged).toBe(1);
    expect(JSON.stringify(result.commands)).not.toContain('kept a week in the dark');
    expect(seen.find((p) => p.type === 'mended')).toMatchObject({ changed: ['Segment 1'], kept: false, open: ['Segment 1, Leaf in the dark: Not possible in the time.'] });
    // As many notes after as before: what it was told of is fixed, so the mended plan stands, with what the second reading found.
    const even = fakeInference((_req, call) => ({ issues: [note(call === 1 ? 'Not possible in the time.' : 'The window leaf needs a label.')] }));
    const kept = await generateSection(fakeInference((req) => (req.task === 'folio_plan_mend' ? mended : planDraft)), course, lesson.id, 'plan', undefined, { reviewer: even });
    expect(JSON.stringify(kept.commands)).toContain('kept a week in the dark');
    expect(JSON.stringify(kept.commands)).toContain('The window leaf needs a label.');
  });

  it('leaves the teacher a note only for what is theirs to decide, and drops one the reviewer agrees was mistaken', async () => {
    const course = smallCourse();
    const lesson = orderedLessons(course)[0]!;
    const left = (reason: string) => ({ segments: [], left: [{ note: 1, reason, why: 'Should the exit ticket count toward the grade?' }] });
    const reviewer = () => fakeInference((_req, call) => ({ issues: call === 1 ? [note('The exit ticket is graded nowhere.')] : [] }));
    const asked = await generateSection(fakeInference((req) => (req.task === 'folio_plan_mend' ? left('teacher') : planDraft)), course, lesson.id, 'plan', undefined, { reviewer: reviewer() });
    expect(asked.flagged).toBe(1);
    expect(JSON.stringify(asked.commands)).toContain('The exit ticket is graded nowhere. Should the exit ticket count toward the grade?');
    const second = reviewer();
    const dropped = await generateSection(fakeInference((req) => (req.task === 'folio_plan_mend' ? left('mistaken') : planDraft)), course, lesson.id, 'plan', undefined, { reviewer: second });
    expect(second.calls[1]!.prompt).toContain('The writer left these as they were, as mistaken');
    expect(dropped.flagged).toBe(0);
  });

  it('is not asked to stream when nobody is watching', async () => {
    const course = smallCourse();
    const writer = streaming({ slides: [{ layout: 'title', title: 'T', bullets: [], notes: '' }] });
    await generateSection(writer, course, orderedLessons(course)[0]!.id, 'slides').catch(() => undefined);
    expect(writer.calls[0]!.onText).toBeUndefined();
  });
});
