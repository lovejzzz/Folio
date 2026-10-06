import { describe, expect, it } from 'vitest';
import { codeFaults } from '../src/codeLines';

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
});
