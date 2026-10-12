import { strFromU8, unzipSync } from 'fflate';
import { SlideVisualSchema, type SemanticDoc } from '@folio/core';
import { describe, expect, it } from 'vitest';
import { renderDocx, renderPptx } from '../src';

const steps = { kind: 'steps' as const, steps: [{ title: 'Forward pass', detail: 'Predictions from the batch' }, { title: 'Loss', detail: 'How wrong they are' }, { title: 'Backward pass', detail: 'A gradient for every weight' }, { title: 'Update', detail: 'Each weight moves a little' }], cycle: true };
const compare = { kind: 'compare' as const, sides: [{ title: 'CPU', points: ['A few fast cores', 'Good at branching work'] }, { title: 'GPU', points: ['Thousands of small cores', 'Good at the same sum on many numbers', 'Its own memory'] }], ask: 'Which would you give a matrix product, and why?' };
const doc = (visual: unknown): SemanticDoc => ({ kind: 'slides', title: 'Slides', language: 'en', audience: 'teacher', blocks: [{ t: 'slide', n: 1, lesson: 'Lesson 1', layout: 'bullets', title: 'One step of training', bullets: [], notes: '', visual }] }) as never;
const xmlOf = async (visual: unknown) => Object.entries(unzipSync(await renderPptx(doc(visual)))).filter(([name]) => /ppt\/slides\/slide\d+\.xml$/.test(name)).map(([, bytes]) => strFromU8(bytes)).join('');

describe('a chain of steps and things side by side, as a file holds them', () => {
  it('are kinds a course file can hold: two to six steps, two or three sides', () => {
    expect(SlideVisualSchema.safeParse(steps).success).toBe(true);
    expect(SlideVisualSchema.safeParse(compare).success).toBe(true);
    expect(SlideVisualSchema.safeParse({ kind: 'steps', steps: [{ title: 'Only one' }] }).success).toBe(false);
    expect(SlideVisualSchema.safeParse({ kind: 'compare', sides: [{ title: 'A' }, { title: 'B' }, { title: 'C' }, { title: 'D' }] }).success).toBe(false);
  });

  it('are shapes and text of PowerPoint\'s own in a deck: every step with its number and line, every side with its points, nothing as a picture', async () => {
    const chain = await xmlOf(steps);
    for (const s of steps.steps) expect(chain).toContain(s.title);
    expect(chain).toContain('A gradient for every weight');
    expect(chain).toContain('roundRect');
    expect((chain.match(/→/g) ?? []).length).toBe(3);
    expect(chain).toContain('Then back to “Forward pass”.');
    expect(chain).not.toContain('<p:pic>');
    const sides = await xmlOf(compare);
    for (const text of ['CPU', 'GPU', 'Thousands of small cores', 'Which would you give a matrix product, and why?']) expect(sides).toContain(text);
    expect(sides).not.toContain('<p:pic>');
  });

  it('are tables in a Word file, with what is asked after them', async () => {
    const text = (bytes: Uint8Array) => strFromU8(unzipSync(bytes)['word/document.xml']!);
    const chain = text(await renderDocx([doc(steps)], { courseTitle: 'C' }));
    expect(chain).toContain('3. Backward pass');
    expect(chain).toContain('Each weight moves a little');
    const sides = text(await renderDocx([doc(compare)], { courseTitle: 'C' }));
    expect(sides).toContain('Its own memory');
    expect(sides).toContain('Which would you give a matrix product, and why?');
  });
});
