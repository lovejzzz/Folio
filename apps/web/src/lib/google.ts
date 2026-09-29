import type { MaterialKind } from '@folio/core';
import { GOOGLE_RETURN_PATH } from './googlePath';

/**
 * Google Docs export. It runs in a tab of its own, opened on the teacher's
 * click: the tab goes to Google to ask for permission to create a file in
 * their Drive, comes back with a short-lived token, uploads the course as a
 * Word file that Drive converts, and then becomes that Google Doc. A tab
 * opened after the upload instead would be blocked as a pop-up, so the
 * teacher would have to open the document themselves.
 * The OAuth client ID comes from configuration (VITE_GOOGLE_CLIENT_ID), never from source.
 */

export type GoogleErrorCode = 'googleUnfinished' | 'googleCancelled' | 'googleRefused';

/** Why an upload to Google Drive failed, as a code the interface words in the teacher's language. */
export class GoogleUploadError extends Error {
  constructor(
    readonly code: GoogleErrorCode,
    detail: string,
  ) {
    super(detail);
    this.name = 'GoogleUploadError';
  }
}

/** What to export, carried through the trip to Google. */
export interface GoogleExportRequest {
  courseId: string;
  kinds: MaterialKind[];
  audience: 'student' | 'teacher';
  lessons?: string[];
}

interface Pending {
  state: string;
  request: GoogleExportRequest;
}

const PENDING = 'folio.googleExport';

/** Remember the request in this tab, and return where to send the teacher to sign in. */
export function startGoogleSignIn(clientId: string, origin: string, request: GoogleExportRequest): string {
  const state = crypto.randomUUID();
  sessionStorage.setItem(PENDING, JSON.stringify({ state, request } satisfies Pending));
  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${origin}${GOOGLE_RETURN_PATH}`,
    response_type: 'token',
    scope: 'https://www.googleapis.com/auth/drive.file',
    include_granted_scopes: 'true',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${query.toString()}`;
}

/** Google's reply, with the export it was for: a token, or why there is none. */
export type GoogleReply = { request: GoogleExportRequest } & ({ token: string } | { error: GoogleUploadError });

/**
 * What Google sent back in the address, if anything. The request is taken from this tab's storage, so a
 * reload can't upload twice; a reply whose state doesn't match the one sent was not asked for here, and
 * is refused.
 */
export function finishGoogleSignIn(hash: string): GoogleReply | null {
  const reply = new URLSearchParams(hash.replace(/^#/, ''));
  if (!reply.has('access_token') && !reply.has('error')) return null;
  const saved = sessionStorage.getItem(PENDING);
  sessionStorage.removeItem(PENDING);
  const pending = saved ? (JSON.parse(saved) as Pending) : null;
  if (!pending || reply.get('state') !== pending.state) throw new GoogleUploadError('googleUnfinished', 'The sign-in reply was not for this export.');
  const token = reply.get('access_token');
  if (token) return { token, request: pending.request };
  const code = reply.get('error') === 'access_denied' ? 'googleCancelled' : 'googleRefused';
  return { error: new GoogleUploadError(code, reply.get('error') ?? 'No token.'), request: pending.request };
}

/** Upload a .docx and let Drive convert it. Returns the new document's URL. */
export async function uploadToGoogleDocs(token: string, name: string, bytes: Uint8Array): Promise<string> {
  const boundary = `folio${Math.random().toString(16).slice(2)}`;
  const meta = JSON.stringify({ name: name.replace(/\.docx$/, ''), mimeType: 'application/vnd.google-apps.document' });
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`,
    `--${boundary}\r\nContent-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document\r\n\r\n`,
    bytes as BlobPart,
    `\r\n--${boundary}--`,
  ]);
  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!response.ok) throw new GoogleUploadError('googleRefused', `Google Drive refused the upload (${response.status}).`);
  const data = (await response.json()) as { webViewLink?: string; id: string };
  return data.webViewLink ?? `https://docs.google.com/document/d/${data.id}/edit`;
}
