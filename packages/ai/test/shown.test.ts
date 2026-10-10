import { orderedLessons } from '@folio/core';
import { describe, expect, it } from 'vitest';
import { generateSection } from '../src';
import { planSummary } from '../src/continuity';
import { applyPlanMend } from '../src/mend';
import { fakeInference, smallCourse } from './fake';

describe('what a segment puts on the screen', () => {
  const course = smallCourse();
  const first = orderedLessons(course)[0]!;
  const seg = (title: string, shown?: string[]) => ({ id: `x_${title}`, session: 0, kind: 'practice' as const, title, minutes: 10, description: 'Students answer.', teacherNotes: 'Answer: B.', ...(shown ? { shown } : {}) });
  const question = 'Which is a physical change? A. Rust forming B. Ice melting C. Paper burning';
  const lesson = { ...first, keyIdeas: ['k', 'k2'], segments: [seg('Warm-up'), seg('Clicker question', [question])] };
  const withPlan = { ...course, lessons: { ...course.lessons, [first.id]: lesson } };

  it('is told to the writers that come after, item by item', () => {
    expect(planSummary(lesson)).toContain(`- Clicker question (10 min): Students answer.\n  On the screen:\n    • ${question}\n  Teacher notes: Answer: B.`);
    expect(planSummary(lesson)).toContain('- Warm-up (10 min): Students answer.\n  Teacher notes');
  });

  it('is on a slide in the plan’s words, or the deck is asked for once more', async () => {
    const slide = (title: string, bullets: string[]) => ({ layout: 'bullets', title, bullets, notes: '' });
    const filler = ['Matter', 'Physical change', 'Chemical change', 'Signs of each'].map((t) => slide(t, ['One point', 'Another point']));
    // The first deck leaves the question to the speaker notes; asked again, it has a slide of its own.
    const model = fakeInference((_req, call) => ({ slides: [...filler, slide('Question', call === 1 ? ['Vote now'] : [question])] }));
    const out = await generateSection(model, withPlan, first.id, 'slides');
    expect(model.calls).toHaveLength(2);
    expect(model.calls[1]!.prompt).toMatch(/The plan puts these on the screen, and no slide carries them in the plan's words: "Which is a physical change\? A\. Rust forming/);
    expect(JSON.stringify(out.commands)).toContain('Ice melting');
    // A deck that carries it is asked for once; and if it never does, nothing is left on the lesson for the teacher.
    const sound = fakeInference(() => ({ slides: [...filler, slide('Question', [question])] }));
    await generateSection(sound, withPlan, first.id, 'slides');
    expect(sound.calls).toHaveLength(1);
    const stubborn = fakeInference(() => ({ slides: [...filler, slide('Question', ['Vote now'])] }));
    expect((await generateSection(stubborn, withPlan, first.id, 'slides')).flagged).toBe(0);
  });

  it('does not ask a slide to carry code that is typed and run, and reads a mend numbered from 0', async () => {
    const slide = (title: string, bullets: string[]) => ({ layout: 'bullets', title, bullets, notes: '' });
    const lab = { ...lesson, segments: [seg('Warm-up'), seg('Lab', ['library(tidyverse)', 'glimpse(penguins)', 'penguins |>', '# Lab 1: describing distributions', 'body <- penguins$body_mass_g'])] };
    const model = fakeInference(() => ({ slides: ['A', 'B', 'C', 'D', 'E'].map((t) => slide(t, ['One point'])) }));
    await generateSection(model, { ...withPlan, lessons: { ...withPlan.lessons, [first.id]: lab } }, first.id, 'slides');
    expect(model.calls).toHaveLength(1);
    const { PlanMend } = await import('../src/mend');
    const from0 = PlanMend.parse({ segments: [{ number: 0, kind: 'practice', session: 1, title: 'a', minutes: 5, description: 'd', teacherNotes: '' }, { number: 2, kind: 'practice', session: 1, title: 'c', minutes: 5, description: 'd', teacherNotes: '' }], left: [] });
    expect(from0.segments.map((x) => x.number)).toEqual([1, 3]);
  });

  it('is kept when a mend writes the segment again without saying it', () => {
    const plan = { keyIdeas: ['k', 'k2'], vocabulary: [], segments: lesson.segments.map(({ id: _id, session: _s, ...s }) => ({ ...s, session: 1 })) };
    const mended = applyPlanMend(plan, { segments: [{ number: 2, kind: 'practice', session: 1, title: 'Clicker question', minutes: 10, description: 'Students vote, then explain.', teacherNotes: 'Answer: B.' }], keyIdeas: [], vocabulary: [], left: [] });
    expect(mended.value.segments[1]).toMatchObject({ description: 'Students vote, then explain.', shown: [question] });
  });
});
