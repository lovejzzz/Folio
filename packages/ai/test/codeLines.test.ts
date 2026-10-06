import { describe, expect, it } from 'vitest';
import { codeFaults } from '../src/codeLines';
import { HandoutsDraft, sheetFault } from '../src/handouts';

describe('code a room lesson shows, line by line', () => {
  it('passes a listing with each line on its own and its indentation kept', () => {
    const notes = 'Type this:\n`def balanced(text):`\n`    s = []`\n`    for ch in text:`\n`        s.append(ch)`\n`    return not s`';
    expect(codeFaults({ segments: [{ teacherNotes: notes }] })).toEqual([]);
    expect(codeFaults({ blocks: [{ type: 'list', items: ['`while cur is not None:`', '`    cur = cur.next`'] }] })).toEqual([]);
    // A single statement named in a sentence is not a listing.
    expect(codeFaults('The branch `else:` runs when nothing matched; `x = 1` is then set.')).toEqual([]);
  });

  it('names a listing whose indentation was squeezed or whose lines run on, in a note and on a sheet', () => {
    const squeezed = codeFaults({ blocks: [{ type: 'list', items: ['`def balanced(text):`', '` s = ListStack()`', '` for ch in text:`', '` s.push(ch)`'] }] });
    expect(squeezed).toHaveLength(1);
    expect(JSON.stringify(squeezed)).toMatch(/after `for ch in text:`/);
    expect(codeFaults({ teacherNotes: 'Write `class ListStack:` `    def __init__(self):` `        self.items = []` on the board.' })).toHaveLength(1);
  });

  it('names a sheet whose table came without headings or cells', () => {
    const sheet = (block: object) => HandoutsDraft.parse({ handouts: [{ title: 'Tax', kind: 'worksheet', usedIn: 'Tax', copies: 'One each', blocks: [block] }] });
    expect(sheetFault(sheet({ type: 'table', text: 'Complete the table.', rows: [[], [], []] }))).toMatch(/"Tax" has a table without its headings/);
    expect(sheetFault(sheet({ type: 'table', columns: ['Price', 'Quantity'], rows: [['$2', ''], ['$4', '']] }))).toBeNull();
  });
});

describe('the keys to a lesson\'s sheets, written from the sheets by another writer', () => {
  it('are set on their sheets, and a number of the plan they contradict is put right in the plan', async () => {
    const { withHandouts } = await import('../src/handouts');
    const { CourseStore, cmd, orderedLessons, newId } = await import('@folio/core');
    const { fakeInference, planDraft, smallCourse } = await import('./fake');
    const course = smallCourse();
    const lesson = orderedLessons(course)[0]!;
    const segments = planDraft.segments.map((s, i) => ({ ...s, id: newId('x'), session: 1, kind: s.kind as 'teach', teacherNotes: i === 0 ? 'The standard deviation is about 25.70.' : s.teacherNotes }));
    const written = { commands: [cmd('section.fill', { lessonId: lesson.id, kind: 'plan', flags: [], content: { segments, keyIdeas: ['Light drives it'], vocabulary: [] } })], flagged: 0 };
    const sheet = { title: 'Spread', kind: 'worksheet', usedIn: 'The equation', copies: 'One each', blocks: [{ type: 'para', text: 'Find the standard deviation.' }] };
    const model = fakeInference(() => ({}), { handouts: [sheet], keyed: { keys: [{ title: 'Spread', key: 'About 25.79.' }], corrections: [{ find: 'about 25.70', replace: 'about 25.79' }, { find: 'not in the plan', replace: 'x' }] } });
    const out = await withHandouts(model, course, lesson, written);
    const store = new CourseStore(course);
    store.apply(out.commands, { label: { key: 'b' }, source: 'ai' });
    expect(store.getState().lessons[lesson.id]!.segments[0]!.teacherNotes).toBe('The standard deviation is about 25.79.');
    // The key is the second writer's, set on the sheet it names.
    expect(store.getState().lessons[lesson.id]!.handouts.map((h) => [h.title, h.key])).toEqual([['Spread', 'About 25.79.']]);
  });
});

describe('an instruction that comes back as advice', () => {
  it('is taken out of the notes, and nothing else is', async () => {
    const { withoutEchoes } = await import('../src/tidy');
    expect(withoutEchoes('Score with the rubric from last time; write no criteria of your own. Hear two pairs.')).toBe('Hear two pairs.');
    expect(withoutEchoes('Students take the quiz. The quiz is scored by points. Collect the papers.')).toBe('Students take the quiz. Collect the papers.');
    expect(withoutEchoes('Hand out the sheet.\n`x = 1  # written separately`\nThe handout is written separately; do not model it.')).toBe('Hand out the sheet.\n`x = 1  # written separately`');
    expect(withoutEchoes('Each criterion is scored from 1 to 4 points.')).toBe('Each criterion is scored from 1 to 4 points.');
  });
});
