import { describe, expect, it } from 'vitest';
import { drawingFaults, pictureOf, softenHex } from '../src';
import { drawInNode, fonts } from '../src/node';

const CARD = `card({id:'seeds', name:'Bar chart', of:'seeds sprouted', note:'Each bar is the seeds that sprouted that day. Touch a bar.',
  draw(){ const D = [['Monday',12],['Tuesday',30]]; D.forEach(([d,v],i) => PT(d+': '+v+' seeds', () => { flat(rrect(120+i*180,330-v*6,90,v*6,4),'#c4a46b'); TX(165+i*180,360,d,{anchor:'middle'}); TX(165+i*180,320-v*6,String(v),{anchor:'middle'}); }, {lift:[0,-6]})); }});`;
const slide = { text: 'Seeds sprouted: 12 on Monday and 30 on Tuesday.', choices: [] };

describe('drawing a card', () => {
  it('draws a card in Node and finds its parts and words', () => {
    const r = drawInNode(CARD);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.drawn).toHaveLength(1);
    expect(r.drawn[0]!.parts).toEqual(['Monday: 12 seeds', 'Tuesday: 30 seeds']);
    expect(drawingFaults(r.drawn[0]!, slide)).toEqual([]);
    const svg = pictureOf(r.drawn[0]!, fonts);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('font/woff2');
  });

  it('draws the same card the same way every time', () => {
    const a = drawInNode(CARD);
    const b = drawInNode(CARD);
    expect(a.ok && b.ok && a.drawn[0]!.body === b.drawn[0]!.body).toBe(true);
  });

  it('says a broken card as its error, and stops a card that never ends', () => {
    const broken = drawInNode(`card({id:'x', name:'Bar chart', of:'x', note:'x', draw(){ notAThing(); }});`);
    expect(broken.ok).toBe(false);
    if (!broken.ok) expect(broken.error).toMatch(/notAThing/);
    const endless = drawInNode(`card({id:'x', name:'x', of:'x', note:'x', draw(){ for(;;){} }});`, 200);
    expect(endless.ok).toBe(false);
    expect(drawInNode('const a = 1;')).toMatchObject({ ok: false });
  });

  it('finds made-up numbers, writing past the edge, and an answered question', () => {
    const r = drawInNode(`card({id:'x', name:'Flowchart', of:'mass', note:'Touch a step.', draw(){ PT('before', () => { TX(20,40,'before: 130.00 g'); TX(20,80,'after: less than 130.00 g (C)'); TX(500,120,'a very long label that runs off'); TX(20,160,'about 47 grams'); }); }});`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const faults = drawingFaults(r.drawn[0]!, { text: 'The balance reads 130.00 g. A. More than 130.00 g B. Exactly 130.00 g C. Less than 130.00 g', choices: ['More than 130.00 g', 'Exactly 130.00 g', 'Less than 130.00 g'] });
    expect(faults.join('\n')).toMatch(/past the edge/);
    expect(faults.join('\n')).toMatch(/does not give: 47/);
    expect(faults.join('\n')).toMatch(/answers it/);
  });

  it('allows a number worked from two of the slide’s', () => {
    const r = drawInNode(`card({id:'x', name:'Stacked bar', of:'a class', note:'Touch a part.', draw(){ PT('all', () => { TX(20,40,'all students 27 (12 + 15)'); TX(20,80,'44%'); }); }});`);
    expect(r.ok && drawingFaults(r.drawn[0]!, { text: '12 girls and 15 boys', choices: [] })).toEqual([]);
  });

  it('softens a colour as the skill’s build does', () => {
    // Values from the skill's build.py, run on the same colours.
    expect(softenHex('#ff0000')).toBe('#ce6252');
    expect(softenHex('#2f261e')).toBe(PY_INK);
    expect(softenHex('#c4a46b')).toBe('#bea67a');
  });
});

// #2f261e through build.py's soften.
const PY_INK = '#2d2820';

describe('the kit’s examples', () => {
  it('finds every type’s example card', async () => {
    const { EXAMPLES, TYPES } = await import('../src/kitText');
    const { exampleCard, typeIds } = await import('../src');
    const ids = typeIds(TYPES);
    expect(ids).toHaveLength(54);
    for (const id of ids) expect(exampleCard(EXAMPLES, id), id).toMatch(new RegExp(`^card\\(\\{id:'${id}'`));
  });
});
