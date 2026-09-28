import { describe, expect, it } from 'vitest';
import { applyPlanReview, type PlanDraft, type PlanIssue } from '../src';

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

  it('skips an edit whose words are not in the field it names, appear twice, or that points at nothing', () => {
    const { plan: next, applied } = applyPlanReview(plan, [
      edit({ find: 'not in the notes', replace: 'x' }),
      edit({ number: 4, find: 'steam', replace: 'x' }),
      edit({ part: 'keyIdea', field: 'description', find: 'vapor', replace: 'x' }),
      // "vapor" is also inside "Evaporation": ambiguous, so left alone.
      edit({ part: 'keyIdea', field: 'text', find: 'vapor', replace: 'x' }),
    ]);
    expect(applied).toHaveLength(0);
    expect(next).toEqual(plan);
  });

  it('takes a replacement literally, dollar signs included', () => {
    const { plan: next } = applyPlanReview(plan, [edit({ find: 'steam is water vapor', replace: 'about $1.25 a week ($& is not a pattern)' })]);
    expect(next.segments[0]!.teacherNotes).toBe('Expected answer: about $1.25 a week ($& is not a pattern).');
  });
});
