import { describe, expect, it } from 'vitest';
import { sectionPrompt, SlidesDraft } from '../src';
import { oneVisualEach, slideVisual } from '../src/slideVisual';
import { smallCourse } from './fake';

describe('a chain of steps and things side by side, as a slide writer gives them', () => {
  it('are asked for where the lesson has a sequence or sets things against each other', () => {
    const c = smallCourse();
    const prompt = sectionPrompt(c, c.lessons[c.lessonOrder[0]!]!, 'slides');
    expect(prompt).toContain('a chain of steps (under "steps")');
    expect(prompt).toContain('side by side (under "compare")');
    const slide = { layout: 'bullets', title: 'T', bullets: [], notes: '', segment: 1 };
    expect(SlidesDraft.safeParse({ slides: [slide, { ...slide, steps: { steps: [{ title: 'A' }, { title: 'B' }] } }, { ...slide, compare: { sides: [{ title: 'A', points: ['x'] }, { title: 'B', points: [] }] } }] }).success).toBe(true);
  });

  it('are kept when they have two named parts at the least, and dropped when they have not', () => {
    expect(slideVisual(undefined, undefined, { steps: [{ title: 'Heat', detail: '' }, { title: 'Stir', detail: 'gently' }], cycle: false })).toEqual({ visual: { kind: 'steps', steps: [{ title: 'Heat', detail: '' }, { title: 'Stir', detail: 'gently' }], cycle: false } });
    expect(slideVisual(undefined, undefined, { steps: [{ title: 'Heat', detail: '' }, { title: ' ', detail: 'x' }], cycle: false })).toEqual({});
    expect(slideVisual(undefined, undefined, undefined, { sides: [{ title: 'CPU', points: ['few cores'] }, { title: 'GPU', points: ['many'] }], ask: 'Which?' })).toEqual({ visual: { kind: 'compare', sides: [{ title: 'CPU', points: ['few cores'] }, { title: 'GPU', points: ['many'] }], ask: 'Which?' } });
    expect(slideVisual(undefined, undefined, undefined, { sides: [{ title: 'CPU', points: [] }], ask: '' })).toEqual({});
    // A table the writer also gave is not lost to an empty chain.
    expect(slideVisual({ columns: ['a', 'b'], rows: [['1', '2']] }, undefined, { steps: [], cycle: false })).toMatchObject({ visual: { kind: 'table' } });
  });
});

describe('a slide that was given two visuals', () => {
  it('keeps both, the second on a slide of its own in the same segment', () => {
    // "How this course works" kept its chain and lost the grade table the pairs then worked from.
    const steps = { steps: [{ title: 'Draft', detail: '' }, { title: 'Peer review', detail: '' }, { title: 'Revision', detail: '' }], cycle: false };
    const table = { columns: ['Graded work', 'Share'], rows: [['Essay 1', '15%'], ['Essay 2', '20%']] };
    const draft = { layout: 'bullets' as const, title: 'How this course works', bullets: ['Four essays'], notes: 'Pairs add the shares.', segment: 2, steps, table } as SlidesDraft['slides'][number];
    const out = oneVisualEach([draft]);
    expect(out.map((x) => [x.title, x.segment, Boolean(x.steps), Boolean(x.table), x.bullets.length])).toEqual([
      ['How this course works', 2, true, false, 1],
      ['How this course works (continued)', 2, false, true, 0],
    ]);
    // One visual, or one sound one beside a broken one: the slide as it was.
    expect(oneVisualEach([{ ...draft, table: undefined }])).toHaveLength(1);
    expect(oneVisualEach([{ ...draft, table: { columns: ['Only'], rows: [] } }])).toHaveLength(1);
  });
});
