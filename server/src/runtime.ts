import type { R2Bucket } from './types';

/**
 * The Python that runs course code in a teacher's browser: the interpreter and the libraries, as files. They are
 * kept beside teachers' media under a name no account can have, one folder per version, and never change once
 * there: a browser keeps what it fetched for good. Public: they are the published open-source files.
 */

const VERSION = /^(?:pyodide|webr)-\d+(\.\d+){1,3}$/;
const FILE = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,159}$/;
const TYPES: Record<string, string> = { wasm: 'application/wasm', json: 'application/json', js: 'text/javascript', zip: 'application/zip', whl: 'application/zip', tgz: 'application/gzip' };

export const runtimeKey = (version: string, file: string): string => `_runtime/${version}/${file}`;

/**
 * R's files lie in folders (its library, its packages), and are asked for by R itself from a frame that has no
 * origin: so they are served to any origin, and answer a question about their size without sending the file.
 */
const SHARED = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-length', 'cross-origin-resource-policy': 'cross-origin' };

export async function runtimeFile(bucket: R2Bucket | undefined, version: string, path: string[], method = 'GET'): Promise<Response> {
  const r = version.startsWith('webr-');
  const none = (status: number) => new Response(null, { status, headers: { 'cache-control': 'no-store', ...(r ? SHARED : {}) } });
  if (!bucket) return none(501);
  // One name for Python's files; folders for R's, each part a plain name, and never more than R's library is deep.
  if (!VERSION.test(version) || !path.length || path.length > (r ? 12 : 1) || !path.every((part) => FILE.test(part))) return none(404);
  const file = path.join('/');
  const found = await bucket.get(runtimeKey(version, file));
  if (!found) return none(404);
  return new Response(method === 'HEAD' ? null : found.body, {
    headers: {
      ...(r ? SHARED : {}),
      'content-type': TYPES[file.split('.').pop() ?? ''] ?? 'application/octet-stream',
      'content-length': String(found.size),
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    },
  });
}
