import { test as base, expect } from '@playwright/test';

/**
 * Every test fails if the page reports a Content-Security-Policy violation
 * or an uncaught error, so the production policy is exercised on each run.
 */
export const test = base.extend<{ guard: void }>({
  guard: [
    async ({ page }, use) => {
      // Today's prices come from OpenRouter's public list; tests get a fixed one instead of the network.
      await page.route('https://openrouter.ai/**', (route) =>
        route.fulfill({
          headers: { 'access-control-allow-origin': '*' },
          json: { data: [{ id: 'anthropic/claude-opus-5', pricing: { prompt: '0.000005', completion: '0.000025', input_cache_read: '0.0000005', input_cache_write: '0.00000625' } }] },
        }),
      );
      const problems: string[] = [];
      page.on('console', (m) => {
        // A refusal to reach example.com is a test proving that nothing leaves the frame that runs course code: there the refusal is the point.
        if (m.type() === 'error' && /Content Security Policy|Refused to/i.test(m.text()) && !m.text().includes('example.com')) problems.push(m.text());
      });
      page.on('pageerror', (e) => problems.push(`Uncaught: ${e.message}`));
      await use();
      expect(problems, 'page errors or CSP violations').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
