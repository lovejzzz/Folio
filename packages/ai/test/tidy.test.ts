import { describe, expect, it } from 'vitest';
import { tidyFollowUps, tidySlides, tidySteps, tidyTrueFalse, unquote } from '../src/tidy';
import { QuestionDraft } from '../src/schemas';

const tf = (answer: string, choices: string[] = []): QuestionDraft =>
  ({ format: 'truefalse', prompt: 'A low R² means the estimates are biased.', choices, answer, explanation: '', difficulty: 2, objective: 1 }) as QuestionDraft;

describe('tidyTrueFalse', () => {
  it('supplies the two choices when the model left them out', () => {
    expect(tidyTrueFalse(tf('False'), 'en')).toMatchObject({ choices: ['True', 'False'], answer: 'False' });
  });

  it('uses the course language', () => {
    expect(tidyTrueFalse(tf('对', ['对', '错']), 'zh-CN')).toMatchObject({ choices: ['正确', '错误'], answer: '正确' });
  });

  it('leaves an answer it cannot read for the checks to flag', () => {
    const q = tf('Probably', []);
    expect(tidyTrueFalse(q, 'en')).toBe(q);
  });

  it('leaves other formats alone', () => {
    const q = { ...tf('B'), format: 'choice' } as QuestionDraft;
    expect(tidyTrueFalse(q, 'en')).toBe(q);
  });
});

describe('tidySteps', () => {
  it('drops numbers the page would repeat', () => {
    const v = tidySteps({ title: 't', prompt: 'p', steps: ['1. List MLR.1 to MLR.5.', 'Step 2: Run lm().', '第三步：解释系数', '2 × 3 is a product, not a number prefix', '2.5 hours of reading', '3:1 odds'], rubric: { levels: [], criteria: [] } });
    expect(v.steps).toEqual(['List MLR.1 to MLR.5.', 'Run lm().', '解释系数', '2 × 3 is a product, not a number prefix', '2.5 hours of reading', '3:1 odds']);
  });
});

describe('tidyFollowUps', () => {
  it('keeps the first three', () => {
    expect(tidyFollowUps({ discussions: [{ prompt: 'p', followUps: ['a', 'b', 'c', 'd'] }] }).discussions[0]!.followUps).toEqual(['a', 'b', 'c']);
  });
});

describe('unquote', () => {
  it('drops quotation marks around a whole title', () => {
    expect(unquote('“知觉：从感觉输入到物体识别”')).toBe('知觉：从感觉输入到物体识别');
    expect(unquote('"Sampling bias"')).toBe('Sampling bias');
  });

  it('keeps quotes that belong to the title', () => {
    expect(unquote('《认知心理学》导读')).toBe('《认知心理学》导读');
    expect(unquote('“Nudge” and its critics')).toBe('“Nudge” and its critics');
    expect(unquote('“Free will” or “determinism”')).toBe('“Free will” or “determinism”');
  });
});

describe('QuestionDraft', () => {
  it('reads a missing choices, expression or source passage as empty, not as an error', () => {
    const q = QuestionDraft.parse({ format: 'short', prompt: 'Why?', answer: 'Because.', explanation: 'It follows.', difficulty: 2, objective: 1 });
    expect(q).toMatchObject({ choices: [], expression: null, sourcePassage: null });
  });
});

describe('tidySlides', () => {
  it('splits a crowded slide in two and keeps every bullet', () => {
    const crowded = { layout: 'bullets' as const, title: 'Needs and wants', bullets: ['a', 'b', 'c', 'd', 'e', 'f'], notes: 'Talk it through.' };
    const v = tidySlides({ slides: [crowded] }, 'en');
    expect(v.slides.map((s) => [s.title, s.bullets.join('')])).toEqual([['Needs and wants', 'abc'], ['Needs and wants (continued)', 'def']]);
    expect(v.slides[1]!.notes).toBe('');
  });
});
