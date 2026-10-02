import { describe, expect, it } from 'vitest';
import { safeReturn } from './googleSignIn';

const ORIGIN = 'https://folio.university';

describe('where a sign-in goes back to', () => {
  it('is the page of this site that asked', () => {
    expect(safeReturn('/library', ORIGIN)).toBe('/library');
    expect(safeReturn('/c/c_1/map?x=1#m-quiz', ORIGIN)).toBe('/c/c_1/map?x=1#m-quiz');
  });

  it('is never another site, however the address is dressed', () => {
    for (const asked of ['//evil.com', '/\\evil.com', '/\t/evil.com', '/\n/evil.com', 'https://evil.com', 'javascript:alert(1)', '', null]) {
      expect(safeReturn(asked, ORIGIN)).toBe('/');
    }
  });
});
