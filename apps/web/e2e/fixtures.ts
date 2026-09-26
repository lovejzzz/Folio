import { test as base, expect } from '@playwright/test';

/**
 * Every test fails if the page reports a Content-Security-Policy violation
 * or an uncaught error, so the production policy is exercised on each run.
 */
export const test = base.extend<{ guard: void }>({
  guard: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on('console', (m) => {
        if (m.type() === 'error' && /Content Security Policy|Refused to/i.test(m.text())) problems.push(m.text());
      });
      page.on('pageerror', (e) => problems.push(`Uncaught: ${e.message}`));
      await use();
      expect(problems, 'page errors or CSP violations').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
