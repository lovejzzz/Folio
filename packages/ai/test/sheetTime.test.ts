import { describe, expect, it } from 'vitest';
import { overfull, overfullNote, sheetMinutes } from '../src/sheetTime';
import { forTeacher, overtime } from '../src/segmentTime';

const room = (lines: number) => ({ type: 'yours', text: '', lines });
const cases = (n: number, each: number[]) => Array.from({ length: n }, () => each.map(room)).flat();

describe('a sheet against the minutes of its segment', () => {
  it('counts writing by parts: a short answer one minute, a worked one two, a paragraph five, a blank cell a quarter', () => {
    expect(sheetMinutes({ title: 'S', usedIn: 'Practice', blocks: [room(2), room(6), room(10), { type: 'field', text: '' }, { type: 'field', text: 'Given' }, { type: 'table', rows: [['x', '', ''], ['y', '', '']] }] })).toBe(1 + 2 + 5 + 0.5 + 1);
  });

  it('counts a cell or a field by what its heading asks for: a sentence under a question, a word under a label', () => {
    // An organizer of six rows: a line, a place and an age, then three questions each answered in a few words.
    const columns = ['Moment (one line)', 'Place', 'Age', 'Can I name one day and place?', 'What was true before? What after?', 'Can I see it clearly enough to describe it?', 'Star'];
    const organizer = { title: 'My moments', usedIn: 'Brainstorm', blocks: [{ type: 'table', columns, rows: Array.from({ length: 6 }, () => columns.map(() => '')) }] };
    // The line and the three answers of each row are sentences, the place, age and star quick: it passed as forty-two quick cells.
    expect(sheetMinutes(organizer)).toBe(24 + 18 * 0.25);
    expect(overfull([organizer], [{ title: 'Brainstorm', minutes: 12 }]).map((o) => o.asked)).toEqual([29]);
    // A field the same way, and one already filled in asks nothing.
    const field = (label: string, value = '') => ({ type: 'field', label, value });
    expect(sheetMinutes({ title: 'S', usedIn: 'P', blocks: [field('Design'), field('Evidence that would convince me'), field('Title', 'Homework and achievement')] })).toBe(1.5);
    // A table whose headings are its first row.
    expect(sheetMinutes({ title: 'S', usedIn: 'P', blocks: [{ type: 'table', rows: [['Study', 'Our reason, citing the passage'], ['A', ''], ['B', '']] }] })).toBe(2);
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

describe('a segment without a sheet against its minutes', () => {
  it('sums what the reader counted, by fixed rates, and notes a segment more than a quarter over', () => {
    const seg = (kind: 'practice' | 'teach', title: string, minutes: number) => ({ kind, session: 1, title, minutes, description: 'd', teacherNotes: '' });
    const plan = { segments: [seg('teach', 'Elasticity', 20), seg('practice', 'Three short problems', 9), seg('practice', 'Exit ticket', 4)] };
    const three = [{ what: 'problems with working', kind: 'worked' as const, count: 3 }, { what: 'comparing with a partner', kind: 'pair' as const, count: 2 }, { what: 'answers heard', kind: 'hear' as const, count: 3 }];
    const notes = overtime(plan, [{ segment: 2, parts: three }, { segment: 3, parts: [{ what: 'answers', kind: 'short', count: 4 }] }, { segment: 1, parts: [{ what: 'paragraphs', kind: 'paragraph', count: 9 }] }]);
    // 3 × 2 + 2 × 2 + 3 × 1 = 13 for 9; the exit ticket fits; and what students are set to write while being taught counts too.
    expect(notes.map((n) => n.values.where)).toEqual(['Segment 2, Three short problems', 'Segment 1, Elasticity']);
    expect(notes[0]!.values.text).toMatch(/^Counted by its parts this needs about 13 minutes and has 9: 3 × problems with working \(6 min\), 2 × comparing with a partner \(4 min\), 3 × answers heard \(3 min\)\. To fit: Bring it to about 9 minutes of work, here and in the notes that answer it; the minutes do not change\. It is under half over: keep every item and ask less of each .* at least three items stay in a practice/);
    // Three questions voted on once in six minutes fit (3 × 2 + 1 to set up = 7); voted on twice with talk between, they do not (10).
    const polls = { segments: [seg('practice', 'Clicker questions', 6)] };
    expect(overtime(polls, [{ segment: 1, parts: [{ what: 'questions', kind: 'vote', count: 3 }] }])).toEqual([]);
    expect(overtime(polls, [{ segment: 1, parts: [{ what: 'questions', kind: 'revote', count: 3 }] }]).map((n) => /about 10 minutes and has 6/.test(n.values.text))).toEqual([true]);
    // More than half over, items may go, after each asks less; a discussion keeps its questions, rounds and close.
    const talk = { segments: [{ ...seg('practice', 'Debate', 10), kind: 'discuss' as const }] };
    expect(overtime(talk, [{ segment: 1, parts: [{ what: 'groups heard', kind: 'hear', count: 10 }, { what: 'paragraphs', kind: 'paragraph', count: 2 }] }])[0]!.values.text).toMatch(/Ask less of each item first, and only then take items out\. A discussion keeps its questions, its rounds and its close/);
    // A drawing is two minutes, an item listed half a minute, a pair heard and scored a minute and a half; a break is never counted.
    const rates = { segments: [seg('practice', 'Shells', 12), { ...seg('practice', 'Break', 5), kind: 'break' as const }] };
    expect(overtime(rates, [{ segment: 1, parts: [{ what: 'diagrams', kind: 'drawing', count: 5 }, { what: 'names', kind: 'listed', count: 4 }] }, { segment: 2, parts: [{ what: 'x', kind: 'paragraph', count: 9 }] }])).toEqual([]);
    expect(overtime({ segments: [seg('practice', 'Pairs read aloud', 11)] }, [{ segment: 1, parts: [{ what: 'pairs heard and scored', kind: 'scored', count: 11 }] }]).map((n) => /about 17 minutes and has 11/.test(n.values.text))).toEqual([true]);
    // Read again after its mend, a little over is let be; well over is still said, and to the teacher without the writer's instructions.
    const again = (count: number) => overtime(polls, [{ segment: 1, parts: [{ what: 'questions', kind: 'worked', count }] }], true);
    expect(again(4)).toEqual([]);
    expect(forTeacher(again(6)[0]!.values.text)).toBe('Counted by its parts this needs about 12 minutes and has 6: 6 × questions (12 min). Cut a part of it, or give it more minutes.');
    // A short practice by its items: six classified, checked once with a neighbor and two heard is 9 for a slot of 6.
    expect(overtime({ segments: [seg('practice', 'Classify', 6)] }, [{ segment: 1, parts: [{ what: 'items', kind: 'short', count: 6 }, { what: 'check', kind: 'compare', count: 1 }, { what: 'heard', kind: 'hear', count: 2 }] }]).map((n) => /about 9 minutes and has 6/.test(n.values.text) && /the number is changed: items are never added/.test(n.values.text))).toEqual([true]);
    // Three groups reporting and three students answered in seven minutes: 3 × 2 + 3 × 1 = 9, and it is cut.
    expect(overtime({ segments: [{ ...seg('practice', 'Groups report', 7), kind: 'discuss' as const }] }, [{ segment: 1, parts: [{ what: 'reports', kind: 'report', count: 3 }, { what: 'answers', kind: 'hear', count: 3 }] }]).map((n) => /about 9 minutes and has 7/.test(n.values.text))).toEqual([true]);
    // A quarter over is let be: 11 for 9.
    expect(overtime(plan, [{ segment: 2, parts: [{ what: 'problems', kind: 'worked', count: 3 }, { what: 'pairs', kind: 'pair', count: 1 }, { what: 'heard', kind: 'hear', count: 3 }] }])).toEqual([]);
  });
});
