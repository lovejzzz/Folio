import type { R2Bucket } from './types';

/**
 * The Python that runs course code in a teacher's browser: the interpreter and the libraries, as files. They are
 * kept beside teachers' media under a name no account can have, one folder per version, and never change once
 * there: a browser keeps what it fetched for good. Public: they are the published open-source files.
 */

const VERSION = /^pyodide-\d+(\.\d+){1,3}$/;
const FILE = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,159}$/;
const TYPES: Record<string, string> = { wasm: 'application/wasm', json: 'application/json', js: 'text/javascript', zip: 'application/zip', whl: 'application/zip' };

export const runtimeKey = (version: string, file: string): string => `_runtime/${version}/${file}`;

export async function runtimeFile(bucket: R2Bucket | undefined, version: string, file: string): Promise<Response> {
  const none = (status: number) => new Response(null, { status, headers: { 'cache-control': 'no-store' } });
  if (!bucket) return none(501);
  if (!VERSION.test(version) || !FILE.test(file)) return none(404);
  const found = await bucket.get(runtimeKey(version, file));
  if (!found) return none(404);
  return new Response(found.body, {
    headers: {
      'content-type': TYPES[file.split('.').pop() ?? ''] ?? 'application/octet-stream',
      'content-length': String(found.size),
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    },
  });
}
