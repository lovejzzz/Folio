import { FIGURE_CATALOG, FigureIdSchema } from '@folio/core';
import { describe, expect, it } from 'vitest';
import { generateSection, sectionPrompt, SlidesDraft } from '../src';
import { fakeInference, planDraft, smallCourse } from './fake';

const deck = (figure: unknown) => ({ slides: [{ layout: 'title', title: 'T', bullets: [], notes: '', segment: 0 }, { layout: 'bullets', title: 'Walking down the loss', bullets: [], notes: '', segment: 1, figure }, { layout: 'bullets', title: 'Due', bullets: ['Read 2.1'], notes: '', segment: 0 }] });

describe('a demonstration a slide writer names', () => {
  it('is offered from Folio\'s own list, each with the numbers it takes', () => {
    const c = smallCourse();
    const prompt = sectionPrompt(c, c.lessons[c.lessonOrder[0]!]!, 'slides');
    for (const id of FigureIdSchema.options) expect(prompt).toContain(FIGURE_CATALOG[id]);
    expect(SlidesDraft.safeParse(deck({ figure: 'gradientDescent', values: [4, 0.3, 5], target: 1 })).success).toBe(true);
    // Never a figure Folio does not keep.
    expect(SlidesDraft.safeParse(deck({ figure: 'backprop', values: [1], target: 0 })).success).toBe(false);
  });

  it('is kept on its slide when its numbers can be worked, and dropped when they cannot', async () => {
    const run = async (figure: unknown) => {
      const c = smallCourse();
      const inference = fakeInference((req) => (req.task === 'folio_slides' ? deck(figure) : planDraft));
      const result = await generateSection(inference, c, c.lessonOrder[0]!, 'slides', new AbortController().signal);
      const set = result.commands.find((x) => JSON.stringify(x).includes('Walking down the loss'));
      return JSON.stringify(set);
    };
    expect(await run({ figure: 'gradientDescent', values: [4, 0.3, 5], target: 1 })).toContain('"visual":{"kind":"figure","look":"composite","figure":"gradientDescent","values":[4,0.3,5],"target":1}');
    // A search of a list out of order, a descent with no learning rate: no picture, and the slide stands without one.
    expect(await run({ figure: 'binarySearch', values: [5, 1, 3], target: 3 })).not.toContain('"kind":"figure"');
    expect(await run({ figure: 'gradientDescent', values: [4, 0, 5], target: 1 })).not.toContain('"kind":"figure"');
  });
});
