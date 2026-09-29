import { beforeEach, describe, expect, it } from 'vitest';
import { GoogleUploadError, finishGoogleSignIn, startGoogleSignIn, type GoogleExportRequest } from './google';

const request: GoogleExportRequest = { courseId: 'c1', kinds: ['plan', 'quiz'], audience: 'teacher', lessons: ['l2'] };

beforeEach(() => {
  const items = new Map<string, string>();
  Object.assign(globalThis, {
    sessionStorage: { getItem: (k: string) => items.get(k) ?? null, setItem: (k: string, v: string) => items.set(k, v), removeItem: (k: string) => items.delete(k) },
  });
});

const stateOf = (url: string) => new URL(url).searchParams.get('state')!;

describe('the trip to Google and back', () => {
  it('asks only to create files, and comes back to the export tab', () => {
    const url = new URL(startGoogleSignIn('client-1', 'https://folio.university', request));
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/drive.file');
    expect(url.searchParams.get('redirect_uri')).toBe('https://folio.university/to-google');
    expect(url.searchParams.get('response_type')).toBe('token');
  });

  it('brings back the token with what was asked for, once', () => {
    const state = stateOf(startGoogleSignIn('client-1', 'https://folio.university', request));
    expect(finishGoogleSignIn(`#state=${state}&access_token=ya29.x&token_type=Bearer`)).toEqual({ token: 'ya29.x', request });
    // A reload of the same address can't upload a second copy.
    expect(() => finishGoogleSignIn(`#state=${state}&access_token=ya29.x`)).toThrow(GoogleUploadError);
  });

  it('is nothing to finish when Google has not answered yet', () => {
    expect(finishGoogleSignIn('')).toBeNull();
  });

  it('refuses a reply it did not ask for', () => {
    startGoogleSignIn('client-1', 'https://folio.university', request);
    expect(() => finishGoogleSignIn('#state=someone-else&access_token=ya29.x')).toThrow(expect.objectContaining({ code: 'googleUnfinished' }));
  });

  it('says so when the teacher declines', () => {
    const state = stateOf(startGoogleSignIn('client-1', 'https://folio.university', request));
    const reply = finishGoogleSignIn(`#error=access_denied&state=${state}`);
    expect(reply).toEqual({ error: expect.objectContaining({ code: 'googleCancelled' }), request });
  });
});
