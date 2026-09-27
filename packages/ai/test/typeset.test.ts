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
