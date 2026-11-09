import { cmd, type Command, type Slide } from '@folio/core';
import { drawInNode } from '@folio/draw/node';
import { describe, expect, it } from 'vitest';
import { slideWords, withDrawings } from '../src';
import { fakeInference, smallCourse } from './fake';

const bars = (label: string) => `card({id:'seeds', name:'Bar chart', of:'seeds sprouted', note:'Each bar is the seeds that sprouted that day. Touch a bar.',
  draw(){ [['Monday',12],['Tuesday',30]].forEach(([d,v],i) => PT(d+': '+v+' seeds', () => { flat(rrect(120+i*180,330-v*6,90,v*6,4),'#c4a46b'); TX(165+i*180,360,d,{anchor:'middle'}); TX(165+i*180,320-v*6,${label},{anchor:'middle'}); }, {lift:[0,-6]})); }});`;

const slides: Slide[] = [
  { id: 's1', layout: 'title', title: 'How this unit is graded', bullets: ['Quizzes 40%'], notes: '' },
  { id: 's2', layout: 'bullets', title: 'Seeds that sprouted', bullets: ['12 on Monday', '30 on Tuesday'], notes: 'Ask which day was warmer.', visual: { kind: 'steps', cycle: false, steps: [{ title: 'Soak', detail: '' }, { title: 'Wait', detail: '' }] } },
];

function deck(): { course: ReturnType<typeof smallCourse>; lessonId: string; commands: Command[] } {
  const course = smallCourse();
  const lessonId = course.lessonOrder[0]!;
  return { course, lessonId, commands: [cmd('section.fill', { lessonId, kind: 'slides', content: { slides }, flags: [] } as never)] };
}

const deckOf = (commands: Command[]): Slide[] => {
  const c = commands[0]!;
  return c.type === 'section.fill' && c.payload.kind === 'slides' ? c.payload.content.slides : [];
};

describe('drawing slides while a deck is written', () => {
  it('draws the picked slide, keeps what it replaced, and leaves the rest', async () => {
    const { course, lessonId, commands } = deck();
    const model = fakeInference((req) => (req.task === 'folio_draw_pick' ? { slides: [{ slide: 2, type: 'bar', object: 'pots of seeds' }] } : { type: 'bar', object: 'pots', code: bars("String(v)") }));
    const out = deckOf(await withDrawings(model, async (code) => drawInNode(code), course, lessonId, commands));
    expect(out[0]).toEqual(slides[0]);
    const v = out[1]!.visual!;
    expect(v.kind).toBe('drawing');
    if (v.kind !== 'drawing') return;
    expect(v.parts).toEqual(['Monday: 12 seeds', 'Tuesday: 30 seeds']);
    expect(JSON.parse(v.from)).toMatchObject({ kind: 'steps' });
    // The card call saw the example of its type and the teacher's notes of a slide that asks nothing.
    const card = model.calls.find((c) => c.task === 'folio_draw_card')!;
    expect(card.prompt).toMatch(/<example_card type="bar">\ncard\(\{id:'bar'/);
    expect(card.prompt).toContain('Ask which day was warmer.');
  });

  it('sends a card with faults back once, and keeps the slide as it was when the mend has faults too', async () => {
    const { course, lessonId, commands } = deck();
    const model = fakeInference((req) => (req.task === 'folio_draw_pick' ? { slides: [{ slide: 2, type: 'bar', object: 'pots' }] } : { type: 'bar', object: 'pots', code: bars("String(v * 7)") }));
    const out = deckOf(await withDrawings(model, async (code) => drawInNode(code), course, lessonId, commands));
    expect(out).toEqual(slides);
    const cards = model.calls.filter((c) => c.task === 'folio_draw_card');
    expect(cards).toHaveLength(2);
    expect(cards[1]!.prompt).toMatch(/Numbers the slide does not give: 84, 210/);
  });

  it('mends a card that would not run', async () => {
    const { course, lessonId, commands } = deck();
    const model = fakeInference((req, n) => (req.task === 'folio_draw_pick' ? { slides: [{ slide: 2, type: 'bar', object: 'pots' }] } : { type: 'bar', object: 'pots', code: n === 2 ? bars('String(v') : bars('String(v)') }));
    const out = deckOf(await withDrawings(model, async (code) => drawInNode(code), course, lessonId, commands));
    expect(out[1]!.visual?.kind).toBe('drawing');
    expect(model.calls.filter((c) => c.task === 'folio_draw_card')[1]!.prompt).toMatch(/The code did not run: SyntaxError/);
  });

  it('keeps the deck when the pick fails, or picks a type the kit does not have', async () => {
    const { course, lessonId, commands } = deck();
    const failing = fakeInference(() => {
      throw new Error('down');
    });
    expect(deckOf(await withDrawings(failing, async (code) => drawInNode(code), course, lessonId, commands))).toEqual(slides);
    const unknown = fakeInference(() => ({ slides: [{ slide: 2, type: 'hologram', object: 'x' }] }));
    expect(deckOf(await withDrawings(unknown, async (code) => drawInNode(code), course, lessonId, commands))).toEqual(slides);
    expect(unknown.calls).toHaveLength(1);
  });
});

describe('what a question slide may be drawn from', () => {
  it('reads a question’s choices, and keeps its notes (and answer) from the drawing', async () => {
    const q: Slide = { id: 'q', layout: 'question', title: 'Where does the mass go?', bullets: ['The balance reads 130.00 g. The new reading is:', 'A. More than 130.00 g', 'B. Less than 130.00 g'], notes: 'Answer: B. The gas escapes.' };
    expect(slideWords(q).choices).toEqual(['More than 130.00 g', 'Less than 130.00 g']);
    const course = smallCourse();
    const lessonId = course.lessonOrder[0]!;
    const commands = [cmd('section.fill', { lessonId, kind: 'slides', content: { slides: [q] }, flags: [] } as never)];
    const model = fakeInference((req) => (req.task === 'folio_draw_pick' ? { slides: [{ slide: 1, type: 'bar', object: 'a balance' }] } : { type: 'bar', object: 'x', code: bars('String(v)') }));
    await withDrawings(model, async (code) => drawInNode(code), course, lessonId, commands);
    for (const c of model.calls) expect(c.prompt).not.toContain('Answer: B');
  });
});
