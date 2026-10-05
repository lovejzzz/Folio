/**
 * Build the runtime folder: the interpreter's own files from the npm package, and the libraries courses use
 * (with everything they depend on) from the official release of the same version, each checked against the
 * hash in the lock file. The folder is what Node runs from and what is uploaded for browsers.
 *
 *   pnpm --filter @folio/run exec tsx scripts/fetch-runtime.ts [numpy,pandas,...]
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { version } from 'pyodide';
import { RUNTIME_DIR } from '../src/node';

interface Lock {
  packages: Record<string, { file_name: string; sha256: string; version: string; depends: string[] }>;
}

export const LIBRARIES = ['numpy', 'pandas', 'matplotlib', 'scipy', 'statsmodels', 'scikit-learn', 'sympy'];
const CORE = ['pyodide.mjs', 'pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json'];
const sha = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');

/** The named libraries and all they need, by lock-file key. */
function closure(lock: Lock, want: string[]): string[] {
  const need = new Set<string>();
  const walk = (name: string): void => {
    const key = name.toLowerCase();
    if (need.has(key)) return;
    const p = lock.packages[key];
    if (!p) throw new Error(`The lock file has no package "${name}".`);
    need.add(key);
    p.depends.forEach(walk);
  };
  want.forEach(walk);
  return [...need].sort();
}

async function main(): Promise<void> {
  const pkg = dirname(createRequire(import.meta.url).resolve('pyodide'));
  mkdirSync(RUNTIME_DIR, { recursive: true });
  for (const f of CORE) copyFileSync(join(pkg, f), join(RUNTIME_DIR, f));
  const lock = JSON.parse(readFileSync(join(pkg, 'pyodide-lock.json'), 'utf8')) as Lock;
  const want = process.argv[2]?.split(',') ?? LIBRARIES;
  let bytes = 0;
  for (const key of closure(lock, want)) {
    const p = lock.packages[key]!;
    const dest = join(RUNTIME_DIR, p.file_name);
    if (!existsSync(dest) || sha(readFileSync(dest)) !== p.sha256) {
      const res = await fetch(`https://cdn.jsdelivr.net/pyodide/v${version}/full/${p.file_name}`);
      if (!res.ok) throw new Error(`${p.file_name}: ${res.status}`);
      const buf = new Uint8Array(await res.arrayBuffer());
      if (sha(buf) !== p.sha256) throw new Error(`${p.file_name} does not match its hash in the lock file.`);
      writeFileSync(dest, buf);
    }
    bytes += readFileSync(dest).length;
  }
  process.stdout.write(`${RUNTIME_DIR}: Pyodide ${version}, ${closure(lock, want).length} packages, ${(bytes / 1e6).toFixed(1)} MB\n`);
}

void main();
