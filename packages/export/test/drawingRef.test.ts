import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { DRAWING_REF } from '../src/media';

describe('a drawn picture’s reference', () => {
  it('is the one the page’s resolver answers to', () => {
    const page = readFileSync(new URL('../../../apps/web/src/lib/exportMedia.ts', import.meta.url), 'utf8');
    expect(page).toContain(`const DRAWING_REF = '${DRAWING_REF}';`);
  });
});
