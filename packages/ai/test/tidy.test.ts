import { describe, expect, it } from 'vitest';
import { withoutSpan, tidyFollowUps, tidyPlanSources, tidySlides, tidySteps, tidyTrueFalse, unquote, unfence, unfenceAll } from '../src/tidy';
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
    const v = tidySteps({ title: 't', prompt: 'p', steps: ['1. List MLR.1 to MLR.5.', 'Step 2: Run lm().', '第三步：解释系数', '2 × 3 is a product, not a number prefix', '2.5 hours of reading', '3:1 odds'], rubric: { levels: [], criteria: [] }, answerKey: '' });
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

  it('keeps a question and its lettered options on one slide', () => {
    const poll = { layout: 'bullets' as const, title: 'Poll', bullets: ['Which is an output?', 'A. Families enrolled', 'B. Fewer placements', 'C. Staff hired', 'D. Trust in the agency', 'Answer in the poll: 60 seconds'], notes: '' };
    expect(tidySlides({ slides: [poll] }, 'en').slides).toHaveLength(1);
  });
});

describe('fenced code', () => {
  it('becomes one marked line per line of code', () => {
    expect(unfence('Fit the model:\n```r\nfit <- lm(wage ~ educ, data = wage1)\n\nsummary(fit)\n```\nThen read the table.')).toBe(
      'Fit the model:\n`fit <- lm(wage ~ educ, data = wage1)`\n\n`summary(fit)`\nThen read the table.',
    );
    expect(unfence('Call ```summary(fit)``` once.')).toBe('Call `summary(fit)` once.');
    expect(unfence('No code here.')).toBe('No code here.');
  });

  it('reaches every string in an answer', () => {
    expect(unfenceAll({ a: ['```\nx\n```'], b: { c: 'plain', n: 3 } })).toEqual({ a: ['`x`'], b: { c: 'plain', n: 3 } });
  });
});

describe('plan sources and rubric bands', () => {
  it('drops passage numbers a teacher cannot follow from plan text', () => {
    const seg = (teacherNotes: string) => ({ kind: 'teach' as const, title: 'T', minutes: 10, description: 'Derive it (passage [2]).', teacherNotes });
    const out = tidyPlanSources({ segments: [seg('Common slip: X as n×k. Source [1].'), seg('See passages [2] and [3].'), seg('Uses the week 3 notes.')] });
    expect(out.segments.map((s) => s.teacherNotes)).toEqual(['Common slip: X as n×k.', '', 'Uses the week 3 notes.']);
    expect(out.segments[0]!.description).toBe('Derive it.');
  });

  it('drops a passage number inside a sentence and keeps the sentence', () => {
    const seg = (teacherNotes: string) => ({ kind: 'teach' as const, title: 'T', minutes: 10, description: 'D.', teacherNotes });
    const out = tidyPlanSources({ segments: [seg('The evidence is Torres’s report in passage [6] that students slept more.'), seg('Fact: an event in Torres’s article, passage [6]. It counts.')] });
    expect(out.segments.map((s) => s.teacherNotes)).toEqual(['The evidence is Torres’s report that students slept more.', 'Fact: an event in Torres’s article. It counts.']);
  });

  it('names a rubric level by its band, the points showing its floor', () => {
    const v = { title: 'T', prompt: 'P', steps: ['Do it'], rubric: { levels: [{ label: 'First (70+)', points: 70 }, { label: 'Upper second (60–69)', points: 60 }, { label: 'B', points: 80 }], criteria: [] } };
    expect(tidySteps(v as never).rubric.levels.map((l) => l.label)).toEqual(['First', 'Upper second', 'B']);
  });
});

describe('course length in summaries', () => {
  it('leaves the span out and mends the article', () => {
    expect(withoutSpan('A four-week module on simple and multiple regression.')).toBe('A module on simple and multiple regression.');
    expect(withoutSpan('An eight-week introduction to OLS.')).toBe('An introduction to OLS.');
    expect(withoutSpan('A 90-minute introductory lecture.')).toBe('An introductory lecture.');
    expect(withoutSpan('Students meet for six 2-hour seminars.')).toBe('Students meet for six seminars.');
    expect(withoutSpan('A unit on the ten-week plan')).toBe('A unit on the plan');
    expect(withoutSpan('A four-topic course in regression analysis.')).toBe('A course in regression analysis.');
    expect(withoutSpan('Regression for economists.')).toBe('Regression for economists.');
    expect(withoutSpan('It covers the five topic areas.')).toBe('It covers the five topic areas.');
  });
});
