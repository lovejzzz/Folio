/**
 * Put R where browsers fetch it from: the account's bucket, under `_runtime/webr-<version>/`, in the folders R
 * asks for. Run `fetch-webr.ts` first. Files already there are left alone: a version's files never change.
 *
 *   pnpm --filter @folio/run exec tsx scripts/upload-webr.ts [--dry]
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { WEBR_DIR, WEBR_VERSION } from './fetch-webr';

const BUCKET = 'folio-media';
const SITE = 'https://folio.university';
const dry = process.argv.includes('--dry');
const TYPES: Record<string, string> = { wasm: 'application/wasm', js: 'text/javascript', tgz: 'application/gzip' };
const NAME = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,159}$/;

const walk = (dir: string): string[] => readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? walk(join(dir, name)) : [join(dir, name)]));

async function main(): Promise<void> {
  const files = walk(WEBR_DIR).map((f) => relative(WEBR_DIR, f));
  // The site serves a file only when every part of its path is a plain name: one that is not would be sent and never found.
  const odd = files.filter((f) => !f.split('/').every((part) => NAME.test(part)));
  if (odd.length) throw new Error(`Names the site will not serve: ${odd.slice(0, 5).join(', ')}`);
  let sent = 0;
  for (const file of files) {
    const there = await fetch(`${SITE}/api/runtime/webr-${WEBR_VERSION}/${file}`, { method: 'HEAD' }).then((r) => r.ok, () => false);
    if (there) continue;
    process.stdout.write(`${dry ? 'would send' : 'sending'} ${file} (${(statSync(join(WEBR_DIR, file)).size / 1e6).toFixed(1)} MB)\n`);
    if (dry) continue;
    execFileSync('npx', ['wrangler', 'r2', 'object', 'put', `${BUCKET}/_runtime/webr-${WEBR_VERSION}/${file}`, '--file', join(WEBR_DIR, file), '--content-type', TYPES[file.split('.').pop()!] ?? 'application/octet-stream', '--remote'], { stdio: ['ignore', 'ignore', 'inherit'] });
    sent += 1;
  }
  process.stdout.write(`${files.length} files, ${sent} sent\n`);
}

void main();
