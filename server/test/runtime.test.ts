import { describe, expect, it } from 'vitest';
import { runtimeFile, runtimeKey } from '../src/runtime';
import type { R2Bucket } from '../src/types';

const bucket = (keys: string[]): R2Bucket => ({
  put: async () => undefined,
  get: async (key) => (keys.includes(key) ? { body: new Blob(['abc']).stream(), size: 3 } : null),
  list: async () => ({ objects: [], truncated: false }),
  delete: async () => undefined,
});

describe('the files a runner is made of', () => {
  const held = bucket([runtimeKey('pyodide-314.0.7', 'pyodide.asm.wasm'), runtimeKey('webr-0.6.0', 'R.wasm'), runtimeKey('webr-0.6.0', 'vfs/usr/lib/R/library/base/DESCRIPTION'), runtimeKey('webr-0.6.0', 'bin/emscripten/contrib/4.6/dplyr_1.2.0.tgz')]);

  it('serves Python’s by one name, to Folio’s own page', async () => {
    const res = await runtimeFile(held, 'pyodide-314.0.7', ['pyodide.asm.wasm']);
    expect([res.status, res.headers.get('content-type'), res.headers.get('access-control-allow-origin')]).toEqual([200, 'application/wasm', null]);
    expect((await runtimeFile(held, 'pyodide-314.0.7', ['a', 'pyodide.asm.wasm'])).status).toBe(404);
  });

  it('serves R’s from its folders to a frame with no origin, and answers a question about size without the file', async () => {
    const lib = await runtimeFile(held, 'webr-0.6.0', ['vfs', 'usr', 'lib', 'R', 'library', 'base', 'DESCRIPTION']);
    expect([lib.status, lib.headers.get('access-control-allow-origin'), lib.headers.get('content-length')]).toEqual([200, '*', '3']);
    const head = await runtimeFile(held, 'webr-0.6.0', ['R.wasm'], 'HEAD');
    expect([head.status, head.headers.get('content-length'), await head.text()]).toEqual([200, '3', '']);
    expect((await runtimeFile(held, 'webr-0.6.0', ['bin', 'emscripten', 'contrib', '4.6', 'dplyr_1.2.0.tgz'])).headers.get('content-type')).toBe('application/gzip');
    // A package the mirror does not hold is said to be missing, in words the frame may read.
    const none = await runtimeFile(held, 'webr-0.6.0', ['bin', 'emscripten', 'contrib', '4.6', 'nope_1.0.tgz']);
    expect([none.status, none.headers.get('access-control-allow-origin')]).toEqual([404, '*']);
  });

  it('gives nothing for a name that climbs out of its folder, or a version it does not know', async () => {
    for (const path of [['..', 'secret'], ['vfs', '', 'x'], ['vfs', 'a/b'], ['.hidden']]) expect((await runtimeFile(held, 'webr-0.6.0', path)).status).toBe(404);
    expect((await runtimeFile(held, 'other-1.0', ['R.wasm'])).status).toBe(404);
    expect((await runtimeFile(undefined, 'webr-0.6.0', ['R.wasm'])).status).toBe(501);
  });
});
