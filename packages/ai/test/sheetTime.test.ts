import { describe, expect, it } from 'vitest';
import { overfull, overfullNote, sheetMinutes } from '../src/sheetTime';

const room = (lines: number) => ({ type: 'yours', text: '', lines });
const cases = (n: number, each: number[]) => Array.from({ length: n }, () => each.map(room)).flat();

describe('a sheet against the minutes of its segment', () => {
  it('counts writing by parts: a short answer one minute, a worked one two, a paragraph five, a blank cell a quarter', () => {
    expect(sheetMinutes({ title: 'S', usedIn: 'Practice', blocks: [room(2), room(6), room(10), { type: 'field', text: '' }, { type: 'field', text: 'Given' }, { type: 'table', rows: [['x', '', ''], ['y', '', '']] }] })).toBe(1 + 2 + 5 + 0.5 + 1);
  });

  it('finds four cases of three answers in eleven minutes, and leaves a sheet that fits', () => {
    const segments = [{ title: 'Find the stage that went wrong', minutes: 11 }, { title: 'Exit ticket', minutes: 4 }];
    const heavy = { title: 'Four cases', usedIn: 'Find the stage that went wrong', blocks: cases(4, [3, 3, 3]) };
    const light = { title: 'Ticket', usedIn: 'exit ticket', blocks: [room(2), room(2)] };
    const over = overfull([heavy, light], segments);
    expect(over).toEqual([{ segment: 'Find the stage that went wrong', minutes: 11, asked: 24, sheets: ['Four cases'] }]);
    expect(overfullNote(over)).toMatch(/"Four cases" asks for about 24 minutes of writing in "Find the stage that went wrong", which has 11 .* cut items/);
    // Two cases of three short answers fit.
    expect(overfull([{ ...heavy, blocks: cases(2, [2, 2, 3]) }], segments)).toEqual([]);
    // A sheet used in no segment by that name is not judged.
    expect(overfull([{ ...heavy, usedIn: 'Somewhere else' }], segments)).toEqual([]);
  });
});
