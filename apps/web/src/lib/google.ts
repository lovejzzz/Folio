/**
 * Google Drive upload with conversion to a Google Doc. The OAuth client ID
 * comes from configuration (VITE_GOOGLE_CLIENT_ID), never from source.
 */

interface TokenResponse {
  access_token?: string;
  error?: string;
}

interface TokenClient {
  requestAccessToken: () => void;
}

interface GoogleAccounts {
  oauth2: {
    initTokenClient: (config: { client_id: string; scope: string; callback: (r: TokenResponse) => void }) => TokenClient;
  };
}

declare global {
  interface Window {
    google?: { accounts: GoogleAccounts };
  }
}

export type GoogleErrorCode = 'googleLoad' | 'googleUnavailable' | 'googleCancelled' | 'googleRefused';

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

let loading: Promise<void> | null = null;

function loadScript(): Promise<void> {
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new GoogleUploadError('googleLoad', 'Could not load Google sign-in.'));
    };
    document.head.append(s);
  });
  return loading;
}

async function token(clientId: string): Promise<string> {
  await loadScript();
  const accounts = window.google?.accounts;
  if (!accounts) throw new GoogleUploadError('googleUnavailable', 'Google sign-in is unavailable.');
  return new Promise((resolve, reject) => {
    const client = accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: (r) => (r.access_token ? resolve(r.access_token) : reject(new GoogleUploadError('googleCancelled', r.error ?? 'Sign-in was cancelled.'))),
    });
    client.requestAccessToken();
  });
}

/** Upload a .docx and let Drive convert it. Returns the new document's URL. */
export async function uploadToGoogleDocs(clientId: string, name: string, bytes: Uint8Array): Promise<string> {
  const access = await token(clientId);
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
    headers: { authorization: `Bearer ${access}`, 'content-type': `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!response.ok) throw new GoogleUploadError('googleRefused', `Google Drive refused the upload (${response.status}).`);
  const data = (await response.json()) as { webViewLink?: string; id: string };
  return data.webViewLink ?? `https://docs.google.com/document/d/${data.id}/edit`;
}
