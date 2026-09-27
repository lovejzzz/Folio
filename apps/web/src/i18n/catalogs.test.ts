import { describe, expect, it } from 'vitest';
import { en } from './en';
import { flagText } from './index';
import { zh } from './zh';

function shape(value: unknown): unknown {
  if (typeof value === 'function') return 'fn';
  if (Array.isArray(value)) return 'array';
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v)]));
  return typeof value;
}

describe('message catalogues', () => {
  it('have the same keys and kinds in English and Chinese', () => {
    expect(shape(zh)).toEqual(shape(en));
  });

  it('never use emoji or the words the design rules out', () => {
    const text = JSON.stringify(en);
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(text.toLowerCase()).not.toMatch(/\b(pipeline|artifact|deliverable|compiler|scion|genome|ledger)\b/);
  });

  it('word plural forms correctly', () => {
    expect(en.common.questions(1)).toBe('1 question');
    expect(en.build.readyLook(2)).toBe('Course ready. Please check 2 things.');
    expect(zh.build.progress(3, 6)).toBe('正在生成第 3 课，共 6 课');
  });

  it('word "needs a look" notes from their codes, in either language', () => {
    expect(flagText([{ code: 'questionCount', values: { got: 1, want: 5 } }], en)).toBe('There is 1 question instead of 5.');
    expect(flagText([{ code: 'questionCount', values: { got: 3, want: 5 } }], en)).toBe('There are 3 questions instead of 5.');
    const both = [{ code: 'answerNotInChoices' }, { code: 'repeatsQuestion' }] as const;
    expect(flagText([...both], en)).toBe('The answer is not one of the choices. It repeats an earlier question.');
    expect(flagText([...both], zh)).toBe('答案不在选项之中。这道题与前面的题目重复。');
    expect(flagText([{ code: 'note', values: { text: 'Written by an older Folio.' } }], zh)).toBe('Written by an older Folio.');
  });

  it('use Chinese punctuation in Chinese labels', () => {
    expect(zh.map.cellLabel('第 1 课', '测验与题库', '5 道题')).toBe('第 1 课，测验与题库：5 道题');
    expect(`${zh.map.stale}${zh.common.period}${zh.changes.because(zh.changes.reasonList(['课题改了', '教案改了']))}`).toBe('需要更新。因为课题改了，教案改了。');
    expect(en.history.leftOutMaterial({ material: en.materialsInline.syllabus })).toBe('Left out the syllabus');
  });
});
