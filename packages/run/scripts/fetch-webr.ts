/**
 * Gather R as browsers will fetch it: webR's own files from the installed package, and the packages course code
 * uses, recorded as webR itself asks the public repository for them. One folder, `~/.cache/folio/webr-<version>/`,
 * laid out as the site serves it. Run again to add a package: what is there is kept.
 *
 *   pnpm --filter @folio/run exec tsx scripts/fetch-webr.ts [package ...]
 */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const DIST = dirname(require.resolve('webr'));
const VERSION = (JSON.parse(readFileSync(join(DIST, '..', 'package.json'), 'utf8')) as { version: string }).version;
export const WEBR_DIR = process.env.FOLIO_WEBR_DIR ?? join(homedir(), '.cache', 'folio', `webr-${VERSION}`);
export const WEBR_VERSION = VERSION;
/** What a first statistics course loads: the tidyverse, the data sets textbooks use, and tidy model output. */
const PACKAGES = ['tidyverse', 'palmerpenguins', 'NHANES', 'broom', 'gapminder', 'nycflights13', 'openintro'];
const UPSTREAM = 'https://repo.r-wasm.org';
const CORE = ['R.js', 'R.wasm', 'libRblas.so', 'libRlapack.so', 'webr-worker.js', 'webr.js'];

async function main(): Promise<void> {
  mkdirSync(WEBR_DIR, { recursive: true });
  for (const file of CORE) cpSync(join(DIST, file), join(WEBR_DIR, file));
  cpSync(join(DIST, 'vfs'), join(WEBR_DIR, 'vfs'), { recursive: true });
  // A stand-in for the repository that keeps what passes through it.
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://x').pathname.replace(/^\/+/, '');
    const file = join(WEBR_DIR, path);
    const send = (body: Buffer) => (res.writeHead(200, { 'content-length': body.length }), res.end(req.method === 'HEAD' ? undefined : body));
    if (path.includes('..')) return void res.writeHead(404).end();
    if (existsSync(file)) return send(readFileSync(file));
    void fetch(`${UPSTREAM}/${path}`).then(async (r) => {
      if (!r.ok) return void res.writeHead(r.status).end();
      const body = Buffer.from(await r.arrayBuffer());
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, body);
      process.stdout.write(`kept ${path} (${(body.length / 1e6).toFixed(1)} MB)\n`);
      send(body);
    }, () => res.writeHead(502).end());
  });
  await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready));
  const port = (server.address() as { port: number }).port;
  const { WebR } = await import('webr');
  const webR = new WebR({ interactive: false, repoUrl: `http://127.0.0.1:${port}/` });
  await webR.init();
  const wanted = process.argv.slice(2).length ? process.argv.slice(2) : PACKAGES;
  await webR.installPackages(wanted, { quiet: true });
  for (const name of wanted) {
    const shelter = await new webR.Shelter();
    const loaded = await shelter.captureR(`suppressPackageStartupMessages(library(${name}))`).then(() => true, () => false);
    process.stdout.write(`${loaded ? 'loads' : 'DOES NOT LOAD'} ${name}\n`);
    shelter.purge();
  }
  webR.close();
  server.close();
  process.exit(0);
}

if (process.argv[1]?.endsWith('fetch-webr.ts')) void main();
