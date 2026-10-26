import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { afterPurchase, creditsText, useCredits } from './credits';

/** The server's balance, as a list of answers in turn. */
function server(answers: number[]) {
  let i = 0;
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ balance: answers[Math.min(i++, answers.length - 1)], available: true, packs: [] }), { status: 200 })));
}

describe('back from paying', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useCredits.setState({ balance: null });
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('tells what was added against the balance before paying, once it has come', async () => {
    sessionStorage.setItem('folio.creditsBefore', '651');
    server([651, 651, 1651]);
    const came = afterPurchase();
    await vi.runAllTimersAsync();
    expect(await came).toEqual({ added: 1000, balance: 1651 });
    expect(creditsText.arrived(1000, 1651)).toBe('1,000 credits added. You now have 1,651.');
    expect(sessionStorage.getItem('folio.creditsBefore')).toBeNull();
  });

  it('says nothing has come yet when the balance has not moved after its last look', async () => {
    sessionStorage.setItem('folio.creditsBefore', '651');
    server([651]);
    const came = afterPurchase();
    await vi.runAllTimersAsync();
    expect(await came).toBeNull();
    expect(creditsText.late).toContain('nothing more is charged');
  });
});
