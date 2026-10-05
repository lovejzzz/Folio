/**
 * Put the runtime folder where browsers fetch it from: the account's bucket, under `_runtime/pyodide-<version>/`.
 * Run `fetch-runtime.ts` first. Files already there are left alone: a version's files never change.
 *
 *   pnpm --filter @folio/run exec tsx scripts/upload-runtime.ts [--dry]
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { version } from 'pyodide';
import { RUNTIME_DIR } from '../src/node';

const BUCKET = 'folio-media';
const SITE = 'https://folio.university';
const dry = process.argv.includes('--dry');
const TYPES: Record<string, string> = { wasm: 'application/wasm', json: 'application/json', js: 'text/javascript', zip: 'application/zip', whl: 'application/zip' };

async function main(): Promise<void> {
  // The page-side scripts (pyodide.mjs, pyodide.asm.mjs) ship with the site itself; these are what the page feeds in.
  const files = readdirSync(RUNTIME_DIR).filter((f) => (/\.(wasm|zip|json|whl)$/.test(f) || f === 'pyodide.asm.js') && f !== 'manifest.json');
  let sent = 0;
  for (const file of files) {
    const there = await fetch(`${SITE}/api/runtime/pyodide-${version}/${file}`, { method: 'GET', headers: { range: 'bytes=0-0' } }).then((r) => r.ok || r.status === 206, () => false);
    if (there) continue;
    const size = (statSync(join(RUNTIME_DIR, file)).size / 1e6).toFixed(1);
    process.stdout.write(`${dry ? 'would send' : 'sending'} ${file} (${size} MB)\n`);
    if (dry) continue;
    execFileSync('npx', ['wrangler', 'r2', 'object', 'put', `${BUCKET}/_runtime/pyodide-${version}/${file}`, '--file', join(RUNTIME_DIR, file), '--content-type', TYPES[file.split('.').pop()!] ?? 'application/octet-stream', '--remote'], { stdio: ['ignore', 'ignore', 'inherit'] });
    sent += 1;
  }
  process.stdout.write(`${files.length} files, ${sent} sent\n`);
}

void main();
