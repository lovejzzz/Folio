import { readFileSync } from 'node:fs';
import type { Lesson } from '@folio/core';
import { describe, expect, it } from 'vitest';
import { slideBudget } from '../src/prompts';
import type { SlidesDraft } from '../src/schemas';
import { outOfStep, withSheetSlides } from '../src/slideSteps';
import { smallCourse } from './fake';

/**
 * Two decks Folio really wrote (the frozen batch at 96e0492; test/fixtures/batch1-deck-steps.json), with their plans:
 * a week of four meetings whose seventh slide held the close of one meeting and the opening of the next, and a meeting
 * whose sixth segment, worked from a sheet, had no slide.
 */
type Real = { segments: Lesson['segments']; slides: { layout: 'title' | 'bullets' | 'question' | 'quote'; title: string; bullets: string[] }[]; handouts: { title: string; usedIn: string }[] };
const real = JSON.parse(readFileSync(new URL('./fixtures/batch1-deck-steps.json', import.meta.url), 'utf8')) as Record<string, Real>;
const lessonOf = (r: Real) => ({ segments: r.segments, handouts: r.handouts }) as unknown as Lesson;
const deck = (r: Real, segments: number[]): SlidesDraft => ({ slides: r.slides.map((s, i) => ({ ...s, notes: '', segment: segments[i] ?? 0 })) });
const lead = (sheets: string[]) => `Work from the sheet “${sheets[0]}”.`;

describe('a slide and the meetings of a week', () => {
  const physics = real['ug-physics-mechanics']!;

  it('carried the close of one meeting and the opening of the next, as it was written', () => {
    const seventh = physics.slides[6]!;
    expect(seventh.title).toBe('Two checks on vectors');
    expect(seventh.bullets.join(' ')).toContain('Claim: A = (6, 8) has magnitude');
    expect(seventh.bullets.join(' ')).toContain('A person walks 3 m east');
    // Segment 13 closes the second meeting; segment 14 opens the third.
    expect([physics.segments[12]!.session, physics.segments[13]!.session]).toEqual([1, 2]);
  });

  it('is found, and said to the writer by the slide\'s name', () => {
    expect(outOfStep(deck(physics, []), lessonOf(physics))).toEqual(['The slide "Two checks on vectors" carries what two meetings show: give each meeting\'s items a slide of their own, in that meeting\'s place']);
  });

  it('is not found where each meeting\'s items have a slide of their own, or where one meeting shows two things on a slide', () => {
    const split = { ...physics, slides: physics.slides.flatMap((s, i) => (i === 6 ? [{ ...s, bullets: s.bullets.slice(0, 1) }, { ...s, title: 'Distance versus displacement', bullets: s.bullets.slice(1) }] : [s])) };
    expect(outOfStep(deck(split, []), lessonOf(split))).toEqual([]);
    const sociology = real['ug-intro-sociology']!;
    expect(outOfStep(deck(sociology, []), lessonOf(sociology))).toEqual([]);
  });

  it('is given a deck sized to its meetings: ten slides was one meeting\'s worth asked of four', () => {
    const one = smallCourse();
    expect(slideBudget(one)).toBe('five to eight slides');
    const week = { ...one, shape: { ...one.shape, sessions: [{ kind: 'lecture', minutes: 50 }, { kind: 'lecture', minutes: 50 }, { kind: 'lecture', minutes: 50 }, { kind: 'recitation', minutes: 50 }] } } as typeof one;
    expect(slideBudget(week)).toContain('each of the 3 meetings that use slides (15 to 24 in all)');
  });

  it('is asked to stand in the order of the plan', () => {
    expect(outOfStep(deck(physics, [0, 1, 3, 2]), lessonOf(physics))[0]).toContain('not in the order of the plan');
  });
});

describe('a segment worked from a sheet', () => {
  const sociology = real['ug-intro-sociology']!;
  // As the deck stood: slides for segments 1 to 5 and 7, none for 6 ("Find and correct the mistaken theory label").
  const given = [0, 1, 2, 3, 4, 5, 7, 0];

  it('had no slide, so the one before it stayed up, as it was written', () => {
    expect(sociology.handouts.map((h) => h.usedIn)).toContain('Find and correct the mistaken theory label');
    expect(sociology.slides.map((s) => s.title)).not.toContain('Find and correct the mistaken theory label');
  });

  it('is given a slide of its own that names the sheet, in its place and before the closing slide', () => {
    const slides = withSheetSlides(deck(sociology, given).slides, lessonOf(sociology), lead);
    const at = slides.findIndex((s) => s.title === 'Find and correct the mistaken theory label');
    expect(slides[at]).toMatchObject({ segment: 6, bullets: ['Work from the sheet “Find and correct the mistaken theory label”.'] });
    expect(slides[at - 1]!.title).toBe('Three readings of one school rule');
    expect(slides[at + 1]!.title).toBe('Tracking through three lenses');
    expect(slides).toHaveLength(sociology.slides.length + 1);
    expect(slides.at(-1)!.title).toBe('Next time and what is due');
  });

  it('is given none in a meeting that runs without slides', () => {
    expect(withSheetSlides(deck(sociology, given).slides, lessonOf(sociology), lead, () => false)).toHaveLength(sociology.slides.length);
  });

  it('is left alone where its segment has a slide, and in a deck that does not say its segments', () => {
    expect(withSheetSlides(deck(sociology, [0, 1, 2, 3, 4, 5, 6, 7]).slides, lessonOf(sociology), lead)).toHaveLength(sociology.slides.length);
    expect(withSheetSlides(deck(sociology, []).slides, lessonOf(sociology), lead)).toHaveLength(sociology.slides.length);
  });
});

describe('a plan written again', () => {
  it('keeps the id of each segment that keeps its title, so its slides stay tied to it', async () => {
    const { keptIds } = await import('../src/sections');
    const before = [{ id: 'x_a', title: 'Warm-up' }, { id: 'x_b', title: 'Worked example' }, { id: 'x_c', title: 'Practice' }];
    // Written again: one renamed, one new, the order changed.
    const again = keptIds([{ title: 'Practice' }, { title: 'warm-up ' }, { title: 'A new example' }, { title: 'Exit ticket' }], before);
    expect(again.map((s) => s.id).slice(0, 2)).toEqual(['x_c', 'x_a']);
    expect(again[2]!.id).not.toBe('x_b');
    expect(new Set(again.map((s) => s.id)).size).toBe(4);
  });

  it('gives new ids where a title stands twice: two segments of one name are not told apart by it', async () => {
    const { keptIds } = await import('../src/sections');
    const again = keptIds([{ title: 'Practice' }, { title: 'Practice' }], [{ id: 'x_a', title: 'Practice' }]);
    expect(again.map((s) => s.id)).not.toContain('x_a');
  });
});
