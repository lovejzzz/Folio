import { describe, expect, it } from 'vitest';
import { en } from './en';
import { flagText } from './index';

describe('message catalogue', () => {
  it('never uses emoji or the words the design rules out', () => {
    const text = JSON.stringify(en);
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(text.toLowerCase()).not.toMatch(/\b(pipeline|artifact|deliverable|compiler|scion|genome|ledger)\b/);
  });

  it('words plural forms correctly', () => {
    expect(en.common.questions(1)).toBe('1 question');
    expect(en.build.readyLook(2)).toBe('Course ready. Please check 2 things.');
  });

  it('words "needs a look" notes from their codes', () => {
    expect(flagText([{ code: 'questionCount', values: { got: 1, want: 5 } }], en)).toBe('There is 1 question instead of 5.');
    expect(flagText([{ code: 'questionCount', values: { got: 3, want: 5 } }], en)).toBe('There are 3 questions instead of 5.');
    expect(flagText([{ code: 'answerNotInChoices' }, { code: 'repeatsQuestion' }], en)).toBe('The answer is not one of the choices. It repeats an earlier question.');
    expect(en.history.leftOutMaterial({ material: en.materialsInline.syllabus })).toBe('Left out the syllabus');
  });
});
