import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { onTheSheet, saidShown, shownUnlisted, unlistedAsk } from '../src/onScreen';

/**
 * Segments Folio really wrote (the frozen batch of twelve lessons at 96e0492), every one that said a thing was shown
 * and listed nothing for the screen, as a teacher was given them: test/fixtures/batch1-said-shown.json.
 */
interface Seg { title: string; description: string; teacherNotes: string; shown?: string[] }
const batch = JSON.parse(readFileSync(new URL('./fixtures/batch1-said-shown.json', import.meta.url), 'utf8')) as Record<string, { segments: Seg[]; sheets: { title: string; usedIn: string }[] }>;
const seg = (lesson: string, title: string) => batch[lesson]!.segments.find((s) => s.title === title)!;
const sheetsOf = (lesson: string, title: string) => batch[lesson]!.sheets.filter((h) => h.usedIn.trim().toLowerCase() === title.trim().toLowerCase()).map((h) => h.title);
const sheeted = (lesson: string) => new Set(batch[lesson]!.sheets.map((h) => h.usedIn.trim().toLowerCase()));

describe('a segment whose items are on a sheet', () => {
  it('said "on the screen" of statements only the sheet held, as it was written', () => {
    const was = seg('ug-physics-mechanics L1', 'Find and fix the mistake');
    expect(was.description).toContain('three flawed worked statements on the screen');
    expect(was.shown).toBeUndefined();
    expect(sheetsOf('ug-physics-mechanics L1', was.title)).toEqual(['Find and fix the mistake']);
  });

  it('says the sheet, and tells the teacher to give it out', () => {
    const now = onTheSheet(seg('ug-physics-mechanics L1', 'Find and fix the mistake'), ['Find and fix the mistake']);
    expect(now.description.split('\n')[0]).toBe('Give out the sheet “Find and fix the mistake”.');
    expect(now.description).toContain('Each student gets three flawed worked statements on the sheet and writes the error');
    expect(now.description).not.toMatch(/on the screen/);
  });

  it('holds for every such segment of the batch: none goes on saying the screen', () => {
    const left: string[] = [];
    let changed = 0;
    for (const [lesson, { segments }] of Object.entries(batch)) {
      for (const s of segments) {
        const sheets = sheetsOf(lesson, s.title);
        if (!sheets.length || !saidShown(s.description).length) continue;
        const now = onTheSheet(s, sheets);
        changed += 1;
        if (saidShown(now.description).some((x) => /on (?:the )?screen/i.test(x))) left.push(`${lesson}: ${s.title}`);
        expect(now.description).toContain(sheets[0]);
      }
    }
    expect(left).toEqual([]);
    expect(changed).toBeGreaterThanOrEqual(7);
  });

  it('turns an order to show into what the sheet has, and keeps a longer order whole', () => {
    expect(onTheSheet(seg('uni-stats-lab L1', 'Find and fix the mistakes'), ['Find and fix the mistakes']).description).toContain('The sheet has a classmate’s worked solution for five made-up study hours.');
    expect(onTheSheet(seg('uni-stats-lab L2', 'Find and fix the mistakes'), ['Find and fix the mistakes']).description).toContain('A classmate’s worked solution is on the sheet.');
    const long = onTheSheet(seg('ug-calculus-1 L1', 'Reading limits from a graph'), ['Reading limits from a graph']).description;
    expect(long).toContain('Show the function h by its pieces and have students picture its graph from the description.');
    expect(long.startsWith('Give out the sheet “Reading limits from a graph”.')).toBe(true);
  });

  it('leaves on the screen the code a teacher runs there', () => {
    const live = seg('ug-data-structures-room L1', 'Trace delete by hand');
    expect(live.description).toContain('runs the code in the notes on the screen');
    expect(saidShown(live.description)).toEqual([]);
    expect(onTheSheet(live, ['Trace delete by hand']).description).toContain('runs the code in the notes on the screen');
  });
});

describe('a thing said to be shown that nothing lists', () => {
  it('is found where no sheet holds it, and not where the screen is only left as it is', () => {
    const found = shownUnlisted(batch['ug-physics-mechanics L1']!.segments, sheeted('ug-physics-mechanics L1'));
    expect(found.map((f) => f.title)).toEqual(['How the course runs and how it is graded', 'SI units and chained conversion factors', 'Adding and subtracting vectors']);
    expect(found[1]!.said).toEqual(['Show prefixes from nano to giga.']);
    // "Leave the commute data on the screen for the next segment." asks for nothing new.
    expect(shownUnlisted(batch['uni-stats-lab L1']!.segments, sheeted('uni-stats-lab L1')).map((f) => f.title)).not.toContain('Short break');
  });

  it('is put to the slides\' writer by its sentence, to be on a slide whole or drawn on the board and said so', () => {
    const ask = unlistedAsk(batch['ug-physics-mechanics L1']!.segments, sheeted('ug-physics-mechanics L1'));
    expect(ask).toContain('- SI units and chained conversion factors: "Show prefixes from nano to giga."');
    expect(ask).toContain('"Show tip-to-tail addition on a drawing, then the component method');
    expect(ask).toContain('"On the board:"');
    expect(unlistedAsk([{ title: 'Warm-up', description: 'Students write one sentence.', teacherNotes: '' }], new Set())).toBe('');
  });

  it('is not said of "show that" or of what students show', () => {
    expect(saidShown('Show that subtraction means adding the negative.\nHear one student say what the two sketches show.')).toEqual([]);
  });
});
