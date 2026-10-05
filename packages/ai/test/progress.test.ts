import { CourseStore, cmd, orderedLessons } from '@folio/core';
import { describe, expect, it } from 'vitest';
import { generateSection, supportedHandout, type CompletionRequest, type SectionProgress } from '../src';
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

  it('comes with the sheets its plan hands out, written from the plan as reviewed, and stands without them when they cannot be had', async () => {
    const course = smallCourse();
    const lesson = orderedLessons(course)[0]!;
    const sheet = { title: 'Exit ticket', kind: 'slips', usedIn: 'Exit ticket', copies: 'One per student', key: '1. Six of each.', blocks: [{ type: 'para', text: 'Answer both before you leave.' }, { type: 'list', items: ['How many CO2 molecules go in?', 'Where does the oxygen come from?'] }, { type: 'yours', text: '' }] };
    const writer = fakeInference(() => planDraft, { handouts: [sheet] });
    const result = await generateSection(writer, course, lesson.id, 'plan', undefined, { reviewer: fakeInference(() => ({ issues: [] })) });
    const content = (result.commands[0]!.payload as { content: { handouts: { title: string; key: string; blocks: { type: string }[] }[] } }).content;
    expect(content.handouts).toMatchObject([{ title: 'Exit ticket', kind: 'slips', key: '1. Six of each.', blocks: [{ type: 'para' }, { type: 'list' }, { type: 'yours' }] }]);
    // The sheets are asked for with the plan in front of the writer, its teacher's notes included.
    expect(writer.sheets[0]!.prompt).toContain('3. Exit ticket (check, 20 min): Two questions.');
    expect(writer.sheets[0]!.prompt).toContain("Teacher's notes: Balance it together.");
    const failing = fakeInference(() => planDraft, 'not an answer');
    const bare = await generateSection(failing, course, lesson.id, 'plan');
    expect((bare.commands[0]!.payload as { content: { handouts?: unknown[] } }).content.handouts).toBeUndefined();
    expect(bare.flagged).toBe(0);
  });

  it('gets, when the teacher asks, a copy of a sheet with language supports straight after it: the same task, the original untouched', async () => {
    const start = smallCourse();
    const lesson = orderedLessons(start)[0]!;
    const sheet = { id: 'x_a', title: 'Exit ticket', kind: 'slips' as const, usedIn: 'Close', copies: 'One per student', key: '1. Six.', blocks: [{ type: 'para' as const, text: 'How many CO2 molecules go in?' }] };
    const other = { ...sheet, id: 'x_b', title: 'Cards' };
    const course = { ...start, lessons: { ...start.lessons, [lesson.id]: { ...lesson, handouts: [sheet, other] } } };
    const model = fakeInference(() => ({ blocks: [{ type: 'table', columns: ['Word', 'Meaning'], rows: [['molecule', 'a tiny piece of a gas']] }, { type: 'para', text: 'How many CO2 molecules go in?' }, { type: 'yours', text: 'I count … molecules.', lines: 2 }], keyNote: 'A word bank and a sentence starter were added.' }));
    const commands = await supportedHandout(model, course, lesson.id, 'x_a', 'with language supports');
    const handouts = (commands[0]!.payload as { handouts: { id: string; title: string; key: string; kind: string; blocks: { type: string }[] }[] }).handouts;
    expect(handouts.map((h) => h.title)).toEqual(['Exit ticket', 'Exit ticket (with language supports)', 'Cards']);
    expect(handouts[0]).toEqual(sheet);
    expect(handouts[1]).toMatchObject({ kind: 'slips', key: '1. Six.\n\nA word bank and a sentence starter were added.', blocks: [{ type: 'table' }, { type: 'para' }, { type: 'yours' }] });
    expect(model.calls[0]!.prompt).toContain('nothing is taken out, made easier or answered for them');
    // And a note put right on the plan fills the plan again without taking its sheets away.
    const store = new CourseStore(course);
    store.apply([cmd('section.fill', { lessonId: lesson.id, kind: 'plan', flags: [], content: { keyIdeas: ['a', 'b'], segments: [], vocabulary: [] } })], { label: { key: 'built' }, source: 'ai' } as never);
    expect(store.getState().lessons[lesson.id]!.handouts).toHaveLength(2);
  });

  it('is not asked to stream when nobody is watching', async () => {
    const course = smallCourse();
    const writer = streaming({ slides: [{ layout: 'title', title: 'T', bullets: [], notes: '' }] });
    await generateSection(writer, course, orderedLessons(course)[0]!.id, 'slides').catch(() => undefined);
    expect(writer.calls[0]!.onText).toBeUndefined();
  });
});
