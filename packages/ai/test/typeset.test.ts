import { describe, expect, it } from 'vitest';
import { smartQuotes, typesetDraft } from '../src/typeset';

describe('smart quotes', () => {
  it('curls quotes and apostrophes', () => {
    expect(smartQuotes(`Ask: "Where did the mass come from?"`)).toBe('Ask: “Where did the mass come from?”');
    expect(smartQuotes(`Expect answers like 'the soil', 'water' or 'sunlight'.`)).toBe('Expect answers like ‘the soil’, ‘water’ or ‘sunlight’.');
    expect(smartQuotes(`It's the students' turn; don't rush.`)).toBe('It’s the students’ turn; don’t rush.');
    expect(smartQuotes(`"How much do backpacks weigh?" is statistical.`)).toBe('“How much do backpacks weigh?” is statistical.');
  });

  it('leaves primes after digits alone', () => {
    expect(smartQuotes(`She is 5' 3" tall.`)).toBe(`She is 5' 3" tall.`);
  });

  it('typesets English drafts but not calculations or Chinese', () => {
    const draft = { prompt: `What's the mean?`, expression: `(2+"3")`, choices: [`It's 4`] };
    expect(typesetDraft(draft, 'en')).toEqual({ prompt: 'What’s the mean?', expression: `(2+"3")`, choices: ['It’s 4'] });
    expect(typesetDraft(draft, 'zh-CN')).toBe(draft);
  });
});

describe('the teacher’s locale', () => {
  it('is passed to the model for English courses', async () => {
    const { systemPrompt } = await import('../src/prompts');
    expect(systemPrompt('en', 'en-GB')).toContain('The teacher’s locale is en-GB'.replace('’', "'"));
    expect(systemPrompt('en', '')).not.toContain('locale');
    expect(systemPrompt('zh-CN', 'zh-CN')).not.toContain('locale');
  });
});

describe('model text outside course content', () => {
  it('sets text actions and ⌘K summaries in English with curly quotes', async () => {
    const { runTextAction, planCourseChange } = await import('../src');
    const { fakeInference, smallCourse } = await import('./fake');
    const text = await runTextAction(fakeInference(() => ({ text: `It's the "big idea".` })), { action: 'simplify', selection: 'x', context: '', language: 'en' });
    expect(text).toBe('It’s the “big idea”.');
    const plan = await planCourseChange(fakeInference(() => ({ summary: `"Light and leaves" moves first.`, operations: [] })), smallCourse(), 'move it');
    expect(plan.rationale).toBe('“Light and leaves” moves first.');
  });

  it('leaves code between backticks as written, and still sets the prose around it', () => {
    expect(smartQuotes("Run `t.test(x, mu = 5, alternative = 'greater')` and read \"p-value\"; it's small.")).toBe("Run `t.test(x, mu = 5, alternative = 'greater')` and read “p-value”; it’s small.");
    expect(smartQuotes('`paste("a", "b")` joins them, as in "ab".')).toBe('`paste("a", "b")` joins them, as in “ab”.');
  });
});
