import { buildPlan, priceFor } from '@folio/ai';
import { MATERIAL_KINDS, orderedLessons, type Course, type MaterialKind } from '@folio/core';
import { sampleCourse } from '@folio/core/sample';
import { describe, expect, it } from 'vitest';
import { estimateLines, estimateShort, planEstimate, priceFactor, type Paying } from './estimate';

const task = (kind: string, state: string, lesson = 1, neededBy?: string) => ({ kind, state, lesson, ...(neededBy ? { neededBy } : {}) });
const folio = (balance: number | null, packs = [{ id: 'p5', usd: 5, credits: 500 }, { id: 'p20', usd: 20, credits: 2200 }]): Paying => ({ provider: 'folio', model: 'claude-sonnet-5-5', price: null, balance, packs });
const own = (provider: Paying['provider'], model: string): Paying => ({ provider, model, price: provider && provider !== 'local' ? priceFor(provider, model) : null, balance: null, packs: [] });

/** The sample course with only these materials chosen and nothing written. */
function unwritten(kinds: MaterialKind[]): Course {
  const c = sampleCourse();
  return { ...c, materials: Object.fromEntries(MATERIAL_KINDS.map((k) => [k, { enabled: kinds.includes(k), options: {} }])) as Course['materials'], lessons: Object.fromEntries(orderedLessons(c).map((l) => [l.id, { ...l, gen: {} as never }])) };
}

describe('what a build is expected to take, read from its plan', () => {
  it('is a range over the parts to run: nothing for what is written or for a lesson that sets no such work', () => {
    const e = planEstimate([task('slides', 'done'), task('slides', 'run', 2), task('assignments', 'noWork', 2), task('quiz', 'run', 2)]);
    expect(e).toMatchObject({ parts: 2, credits: [40, 90], reckoned: 0, unknown: 0, needed: [] });
    expect(e.dollars[0]).toBeCloseTo(0.137, 2);
    expect(planEstimate([])).toMatchObject({ parts: 0, credits: [0, 0] });
  });

  it('counts every part of the plan it is given: the estimate and the queue are one list', () => {
    for (const kinds of [['slides'], ['plan'], ['quiz'], ['study'], ['rubrics'], ['plan', 'slides', 'assignments', 'rubrics']] as MaterialKind[][]) {
      const plan = buildPlan(unwritten(kinds));
      const run = plan.filter((t) => t.state === 'run');
      const e = planEstimate(plan);
      expect(e.parts).toBe(run.length);
      expect(e.unknown).toBe(0);
      // Never nothing while something is to be written.
      if (run.length) expect(e.credits[0]).toBeGreaterThan(0);
      expect(e.needed.reduce((n, x) => n + x.lessons.length, 0)).toBe(run.filter((t) => t.neededBy).length);
    }
  });

  it('rubrics alone are never free: the work they are written with is in the figure and named', () => {
    const e = planEstimate(buildPlan(unwritten(['rubrics'])));
    expect(e.credits[0]).toBeGreaterThan(0);
    expect(e.needed.some((n) => n.kind === 'assignments' && n.neededBy === 'rubrics')).toBe(true);
    expect(estimateLines(e, folio(750)).join(' ')).toContain('Also written: the graded work of');
    // Written work that lost its rubric: a rubric alone, in the figure by reckoning and said to be.
    const alone = planEstimate([task('rubrics', 'run')]);
    expect(alone).toMatchObject({ parts: 1, credits: [0, 20], reckoned: 1 });
    expect(estimateLines(alone, folio(750)).join(' ')).toContain('by reckoning, not by measurement');
  });

  it('lesson facts and their second reading are in the figure, at one pass and at two', () => {
    const e = planEstimate([task('facts', 'run', 1, 'slides'), task('slides', 'run')]);
    expect(e).toMatchObject({ parts: 2, credits: [40, 130], reckoned: 1 });
    expect(estimateLines(e, folio(null))[1]).toBe('Also part of this: the facts of lesson 1, settled once first for the slide deck, since no lesson plan is written.');
  });

  it('a part with no figure is said and never added as nothing', () => {
    const e = planEstimate([task('slides', 'run'), task('mystery', 'run')]);
    expect(e).toMatchObject({ parts: 2, unknown: 1 });
    expect(estimateLines(e, folio(750)).join(' ')).toContain('One part is not in the figure: what it costs is not known.');
    expect(estimateLines(planEstimate([task('mystery', 'run')]), folio(750))[0]).toBe('One part is to be written, and what it costs is not known.');
    expect(estimateShort(planEstimate([task('mystery', 'run')]), folio(750))).toBe('cost not known');
  });
});

describe('who is paid, kept apart', () => {
  const e = planEstimate([task('plan', 'run'), task('slides', 'run'), task('quiz', 'run')]);

  it('Folio credits: what is used, what that is worth, and whether anything has to be bought', () => {
    expect(e.credits).toEqual([120, 210]);
    expect(estimateLines(e, folio(750)).slice(0, 2)).toEqual(['About 120 to 210 credits ($1.20 to $2.10 of credits at the standard rate).', 'You have 750: nothing to buy.']);
    expect(estimateLines(e, folio(150))[1]).toBe('You have 150: it may be enough, and may fall up to 60 short; the $5 pack (500 credits) covers it.');
    expect(estimateLines(e, folio(20))[1]).toBe('You have 20: 100 to 190 more are needed; the $5 pack (500 credits) covers it.');
    expect(estimateLines(e, folio(20, []))[1]).toContain('buying credits opens soon');
    expect(estimateLines(e, folio(null))).toHaveLength(2);
    expect(estimateShort(e, folio(750))).toBe('about 120 to 210 credits');
  });

  it('a key of one’s own: the provider’s charge at the model’s price, never credits', () => {
    const sonnet = estimateLines(e, own('anthropic', 'claude-sonnet-5-5'))[0]!;
    expect(sonnet).toBe('About $0.42 to $0.68 charged by your provider for claude-sonnet-5-5, not by Folio. Reckoned from what Folio’s own models were measured to cost, by this model’s price; not measured on it.');
    expect(sonnet).not.toContain('credits');
    // A model at a twentieth of the price: a twentieth of the figure.
    expect(priceFactor('openai', priceFor('openai', 'gpt-6-luna'))).toBeCloseTo(0.05);
    expect(estimateLines(e, own('openai', 'gpt-6-luna'))[0]).toContain('About 2¢ to 3¢ charged by your provider for gpt-6-luna');
    expect(priceFactor('anthropic', priceFor('anthropic', 'claude-opus-5-5'))).toBe(2);
  });

  it('a model with no known price has no figure, and a model on one’s own computer no charge', () => {
    expect(priceFor('google', 'gemini-3.8-flash')).toBeNull();
    expect(estimateLines(e, own('google', 'gemini-3.8-flash'))[0]).toBe('No price is known for gemini-3.8-flash, so no figure can be given: 3 parts are to be written, charged by your provider.');
    expect(estimateShort(e, own('google', 'gemini-3.8-flash'))).toBe('cost not known');
    expect(estimateLines(e, own('local', 'llama3.1'))[0]).toBe('Written by a model on your own computer: no provider charges for it.');
  });

  it('nothing to run says so; every figure says it is an estimate and what a retry adds', () => {
    expect(estimateLines(planEstimate([task('slides', 'done')]), folio(750))).toEqual(['Everything chosen is written: there is nothing left to pay for.']);
    expect(estimateLines(e, folio(750)).at(-1)).toContain('not a bill and not a limit');
  });
});
