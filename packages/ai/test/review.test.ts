import { describe, expect, it } from 'vitest';
import { orderedLessons } from '@folio/core';
import { applyPlanReview, generateSection, type PlanDraft, type PlanIssue } from '../src';
import { fakeInference, planDraft, smallCourse } from './fake';

const plan: PlanDraft = {
  keyIdeas: ['Evaporation turns liquid water into vapor.'],
  segments: [
    {
      kind: 'teach',
      session: 1,
      title: 'Steam and vapor',
      minutes: 15,
      description: 'Boil water on a hot plate.\nStudents watch steam rise and call it evaporation.\nHold a cold lid above the pot.',
      teacherNotes: 'Expected answer: steam is water vapor.',
    },
  ],
  vocabulary: [{ term: 'Median', definition: 'The middle value, $44,000 here.' }],
};

const edit = (fields: Partial<PlanIssue>): PlanIssue => ({ part: 'segment', number: 1, field: 'teacherNotes', kind: 'fact', why: 'Wrong.', find: '', replace: '', ...fields });

describe('applying a plan review', () => {
  it('replaces only the quoted words and keeps the rest of the field', () => {
    const { plan: next, applied } = applyPlanReview(plan, [
      edit({ field: 'description', find: 'call it evaporation', replace: 'see droplets that have already condensed' }),
    ]);
    expect(applied).toHaveLength(1);
    expect(next.segments[0]!.description).toBe('Boil water on a hot plate.\nStudents watch steam rise and see droplets that have already condensed.\nHold a cold lid above the pot.');
    expect(plan.segments[0]!.description).toContain('call it evaporation');
  });

  it('fixes key ideas and definitions the same way', () => {
    const { plan: next } = applyPlanReview(plan, [
      edit({ part: 'keyIdea', field: 'text', find: 'into vapor', replace: 'into invisible vapor' }),
      edit({ part: 'vocabulary', field: 'definition', find: '$44,000', replace: '$43,500' }),
    ]);
    expect(next.keyIdeas[0]).toBe('Evaporation turns liquid water into invisible vapor.');
    expect(next.vocabulary[0]!.definition).toBe('The middle value, $43,500 here.');
  });

  it('leaves for the teacher a fix whose words are not in the field it names, appear twice, or that points at nothing', () => {
    const { plan: next, applied, notes } = applyPlanReview(plan, [
      edit({ find: 'not in the notes', replace: 'x' }),
      edit({ number: 4, find: 'steam', replace: 'x' }),
      edit({ part: 'keyIdea', field: 'description', find: 'vapor', replace: 'x' }),
      // "vapor" is also inside "Evaporation": ambiguous, so left alone.
      edit({ part: 'keyIdea', field: 'text', find: 'vapor', replace: 'x' }),
    ]);
    expect(applied).toHaveLength(0);
    expect(notes).toHaveLength(4);
    expect(next).toEqual(plan);
  });

  it('leaves a problem that came without a fix for the teacher', () => {
    const { plan: next, notes } = applyPlanReview(plan, [edit({ why: 'The text students read is never given.' })]);
    expect(notes.map((n) => n.why)).toEqual(['The text students read is never given.']);
    expect(next).toEqual(plan);
  });

  it('takes a replacement literally, dollar signs included', () => {
    const { plan: next } = applyPlanReview(plan, [edit({ find: 'steam is water vapor', replace: 'about $1.25 a week ($& is not a pattern)' })]);
    expect(next.segments[0]!.teacherNotes).toBe('Expected answer: about $1.25 a week ($& is not a pattern).');
  });
});

describe('a reviewed plan', () => {
  it('is saved with the fixes made and the rest noted for the teacher, by segment title', async () => {
    const course = smallCourse();
    const lesson = orderedLessons(course)[0]!;
    const writer = fakeInference(() => planDraft);
    const reviewer = fakeInference(() => ({
      issues: [
        { part: 'segment', number: 2, field: 'teacherNotes', kind: 'fact', why: 'Say what to balance.', find: 'Balance it together.', replace: 'Balance the oxygen atoms together.' },
        { part: 'segment', number: 3, field: 'description', kind: 'consistency', why: 'The two questions are never given.', find: '', replace: '' },
      ],
    }));
    const { commands, flagged } = await generateSection(writer, course, lesson.id, 'plan', undefined, { reviewer });
    const fill = commands[0]!.payload as { flags: unknown[]; content: { segments: { teacherNotes: string }[] } };
    expect(fill.content.segments[1]!.teacherNotes).toBe('Balance the oxygen atoms together.');
    // It was sent to be put right and is still there: said as that.
    expect(fill.flags).toEqual([{ code: 'reviewNote', values: { where: 'Segment 3, Exit ticket', text: 'Folio could not fix this itself: The two questions are never given.' } }]);
    expect(flagged).toBe(1);
  });

  it('goes out as written when the review fails, marked as not checked', async () => {
    const course = smallCourse();
    const lesson = orderedLessons(course)[0]!;
    const reviewer = fakeInference(() => {
      throw new Error('overloaded');
    });
    const { commands } = await generateSection(fakeInference(() => planDraft), course, lesson.id, 'plan', undefined, { reviewer });
    const fill = commands[0]!.payload as { flags: unknown[]; content: { segments: { teacherNotes: string }[] } };
    expect(fill.content.segments[1]!.teacherNotes).toBe('Balance it together.');
    expect(fill.flags).toEqual([{ code: 'unreviewed' }]);
  });
});

describe('what a second reading may pass on', () => {
  it('keeps what was sent to the mend and is still there, and drops a first finding on what the mend has just written', async () => {
    const { reviewed } = await import('../src/secondRead');
    const note = (where: string, text: string) => ({ code: 'reviewNote' as const, values: { where, text } });
    let reading = 0;
    // First reading: a problem in segment 2, and a count that puts segment 5 over. After the mend of both: the first is still
    // there, and the reader has an objection of its own to segment 5 as the mend wrote it.
    const read = async (draft: string) => {
      reading += 1;
      const notes = reading === 1 ? [note('Segment 2, Sources', 'Turner is not a settler.'), note('Segment 5, Peer review', 'Counted by its parts this needs about 46 minutes and has 20: 11 × pairs scored. To fit: cut.')] : [note('Segment 2, Sources', 'Turner is still not a settler.'), note('Segment 5, Peer review', 'It must be scored in class.')];
      return { value: draft, fixes: [], notes };
    };
    const mend = async (draft: string) => ({ value: `${draft}+`, changed: ['Segment 2', 'Segment 5'], left: [] });
    const out = await reviewed(read, 'plan', undefined, mend);
    const told = out.problems.map((p) => (p.flag.code === 'reviewNote' ? `${p.flag.values.where}: ${p.flag.values.text}` : p.flag.code));
    expect(told).toEqual(['Segment 2, Sources: Folio could not fix this itself: Turner is still not a settler.']);
  });
});
