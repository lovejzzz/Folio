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
    const sheet = { title: 'Spread', kind: 'worksheet', usedIn: 'The equation', copies: 'One each', blocks: [{ type: 'para', text: 'Find the standard deviation. For 5 and 2 the average is 2.5.' }] };
    const model = fakeInference(() => ({}), { handouts: [sheet], keyed: { keys: [{ title: 'Spread', key: 'About 25.79.' }], corrections: [{ find: 'about 25.70', replace: 'about 25.79' }, { find: 'not in the plan', replace: 'x' }, { find: 'the average is 2.5', replace: 'the average is 3.5' }] } });
    const out = await withHandouts(model, course, lesson, written);
    const store = new CourseStore(course);
    store.apply(out.commands, { label: { key: 'b' }, source: 'ai' });
    expect(store.getState().lessons[lesson.id]!.segments[0]!.teacherNotes).toBe('The standard deviation is about 25.79.');
    // The key is the second writer's, set on the sheet it names.
    expect(store.getState().lessons[lesson.id]!.handouts.map((h) => [h.title, h.key])).toEqual([['Spread', 'About 25.79.']]);
    // And a wrong number on the sheet itself is put right on the sheet: its key is the key to the corrected sheet.
    expect(JSON.stringify(store.getState().lessons[lesson.id]!.handouts[0]!.blocks)).toContain('the average is 3.5');
  });
});

describe('sheets that ask more than their segment holds', () => {
  it('are written once more, shorter, and the shorter ones are kept', async () => {
    const { withHandouts } = await import('../src/handouts');
    const { CourseStore, cmd, orderedLessons, newId } = await import('@folio/core');
    const { fakeInference, smallCourse } = await import('./fake');
    const course = smallCourse();
    const lesson = orderedLessons(course)[0]!;
    const segments = [{ id: newId('x'), session: 0, kind: 'practice' as const, title: 'Four cases', minutes: 10, description: 'Students work the cases.', teacherNotes: '' }];
    const written = { commands: [cmd('section.fill', { lessonId: lesson.id, kind: 'plan', flags: [], content: { segments, keyIdeas: ['k'], vocabulary: [] } })], flagged: 0 };
    const sheet = (rooms: number) => ({ title: 'Cases', kind: 'worksheet', usedIn: 'Four cases', copies: 'One each', blocks: [{ type: 'para', text: 'Answer each.' }, ...Array.from({ length: rooms }, () => ({ type: 'yours', text: '', lines: 3 }))] });
    // The first answer is twelve answer rooms; asked again, four.
    // And the plan, which told of twelve, is written again for that segment from the four.
    const model = fakeInference((req) => (req.task === 'folio_plan_mend' ? { segments: [{ number: 1, kind: 'practice', session: 1, title: 'Four cases', minutes: 10, description: 'Students work the four cases.', teacherNotes: 'Answers to cases 1 to 4.' }], left: [] } : {}), ((n: number) => ({ handouts: [sheet(n === 1 ? 12 : 4)] })) as never);
    const out = await withHandouts(model, course, lesson, written);
    const store = new CourseStore(course);
    store.apply(out.commands, { label: { key: 'b' }, source: 'ai' });
    expect(model.sheets).toHaveLength(2);
    // The room each segment has was said before the first writing, by the count that is made after it.
    expect(model.sheets[0]!.prompt).toMatch(/the writing a segment's sheets ask comes to no more than these minutes: "Four cases": 8\./);
    expect(model.sheets[1]!.prompt).toMatch(/"Cases" asks for about 24 minutes of writing in "Four cases", which has 10/);
    expect(store.getState().lessons[lesson.id]!.handouts[0]!.blocks.filter((b) => b.type === 'yours')).toHaveLength(4);
    expect(model.calls.filter((c) => c.task === 'folio_plan_mend').map((c) => /Four cases: The sheet students are handed here was shortened to fit the segment's 10 minutes/.test(c.prompt))).toEqual([true]);
    expect(store.getState().lessons[lesson.id]!.segments[0]).toMatchObject({ minutes: 10, description: 'Students work the four cases.', teacherNotes: 'Answers to cases 1 to 4.' });
  });
});

describe('a key and the notes beside a sheet that was cut', () => {
  it('drops what a key\'s writer says of itself, and asks again for notes left telling of the longer sheet', async () => {
    const { withoutSelfReport } = await import('../src/tidy');
    expect(withoutSelfReport('1. 10,000 rows. R execution verification remains pending because Rscript is unavailable in the checking environment. 2. `glimpse(NHANES)` lists the columns.')).toBe('1. 10,000 rows. 2. `glimpse(NHANES)` lists the columns.');
    expect(withoutSelfReport('Run `Rscript lab.R` from the terminal.\nAccept any tidy answer.')).toBe('Run `Rscript lab.R` from the terminal.\nAccept any tidy answer.');
    expect(withoutSelfReport('Mean 43.9 mm. Data values checked against the Palmer penguins source data. R execution was unavailable during preparation; the R lines were not executed. Accept 43.9 or 44.')).toBe('Mean 43.9 mm. Accept 43.9 or 44.');
    expect(withoutSelfReport('Verification note: R execution was unavailable, so outputs are from the documentation. The mean is 4.2.')).toBe('The mean is 4.2.');
    // What a teacher does with students' answers is not the writer's report.
    expect(withoutSelfReport('Check each answer against the printed output. A student who has not run the code will give 12.')).toBe('Check each answer against the printed output. A student who has not run the code will give 12.');
    const { sheetLeads } = await import('../src/sheetLeads');
    const { orderedLessons } = await import('@folio/core');
    const { fakeInference, smallCourse } = await import('./fake');
    const course = smallCourse();
    const seg = { kind: 'practice' as const, session: 1, title: 'Five cases', minutes: 10, description: 'Students sort five cases.', teacherNotes: 'Answers: 1 trouble, 2 issue, 3 issue, 4 trouble, 5 issue.' };
    const plan = { keyIdeas: ['k', 'k2'], vocabulary: [], segments: [seg] };
    // The first mend changes the description and leaves the notes word for word; asked by name, the notes follow.
    const model = fakeInference((_req, call) => ({ segments: [{ number: 1, ...seg, description: 'Students sort four cases, A to D.', teacherNotes: call === 1 ? seg.teacherNotes : 'Answers: A trouble, B issue, C issue, D trouble.' }], left: [] }));
    const out = await sheetLeads(model, course, orderedLessons(course)[0]!, plan, [{ title: 'Cases', usedIn: 'Five cases', blocks: [] }], [{ segment: 'Five cases', minutes: 10, asked: 16, sheets: ['Cases'] }]);
    expect(model.calls).toHaveLength(2);
    expect(model.calls[1]!.prompt).toMatch(/its teacher's notes still tell of the longer one/);
    expect(out.segments[0]).toMatchObject({ minutes: 10, description: 'Students sort four cases, A to D.', teacherNotes: 'Answers: A trouble, B issue, C issue, D trouble.' });
  });
});

describe('an instruction that comes back as advice', () => {
  it('is taken out of the notes, and nothing else is', async () => {
    const { withoutEchoes } = await import('../src/tidy');
    expect(withoutEchoes('Score with the rubric from last time; write no criteria of your own. Hear two pairs.')).toBe('Hear two pairs.');
    expect(withoutEchoes('Groups hand in one sheet. Use new cases and numbers, not those from the examples in class. Post solutions after class.')).toBe('Groups hand in one sheet. Post solutions after class.');
    expect(withoutEchoes('Students take the quiz. The quiz is scored by points. Collect the papers.')).toBe('Students take the quiz. Collect the papers.');
    expect(withoutEchoes('Hand out the sheet.\n`x = 1  # written separately`\nThe handout is written separately; do not model it.')).toBe('Hand out the sheet.\n`x = 1  # written separately`');
    expect(withoutEchoes('Each criterion is scored from 1 to 4 points.')).toBe('Each criterion is scored from 1 to 4 points.');
  });
});
