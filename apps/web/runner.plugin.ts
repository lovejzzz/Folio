import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
// By its file: this is read by Node as the build starts, before anything resolves a workspace package.
import { withoutProbe } from '../../packages/run/src/result.ts';
import { build, type Plugin } from 'vite';

/**
 * The runner page: where course code is run, in a frame with no origin, no network and no storage. It is one
 * file with one script in it, the worker's code held inside as text, so the page asks the network for nothing
 * and its policy can forbid every connection. The policy names the script by its hash.
 */

const entry = (name: string): string => join(dirname(createRequire(import.meta.url).resolve('@folio/run')), 'browser', `${name}.ts`);

async function bundle(file: string, define: Record<string, string> = {}): Promise<string> {
  const out = await build({
    configFile: false,
    logLevel: 'error',
    define,
    // Pyodide's loader carries branches for Node that a browser never takes.
    build: { write: false, minify: true, target: 'es2022', lib: { entry: file, formats: ['iife'], name: 'folioRunner' }, rollupOptions: { external: [/^node:/, 'ws'] } },
  });
  const chunk = (Array.isArray(out) ? out : [out]).flatMap((o) => ('output' in o ? o.output : [])).find((o) => o.type === 'chunk');
  if (!chunk || chunk.type !== 'chunk') throw new Error(`folio:runner could not build ${file}`);
  return chunk.code;
}

export interface RunnerPage {
  html: string;
  /** The script's hash, as a policy names it. */
  hash: string;
}

export async function runnerPage(): Promise<RunnerPage> {
  const worker = withoutProbe(await bundle(entry('worker')));
  // Text inside a script cannot hold the tag that ends it.
  const script = (await bundle(entry('page'), { WORKER_SOURCE: JSON.stringify(worker) })).replace(/<\/script/gi, '<\\/script');
  const hash = `'sha256-${createHash('sha256').update(script).digest('base64')}'`;
  return { html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Folio runner</title></head><body><script>${script}</script></body></html>\n`, hash };
}

/** What the runner page may do: run its one script, start a worker from text, run WebAssembly. No other script from anywhere, and no connection of any kind. */
export const runnerPolicy = (hash: string): string => `default-src 'none'; script-src ${hash} 'wasm-unsafe-eval'; worker-src blob:; connect-src 'none'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'`;

/** Writes /runner/index.html into the build and its policy into _headers; serves the same page in development. */
export function runner(): Plugin {
  let outDir = 'dist';
  let made: Promise<RunnerPage> | null = null;
  return {
    name: 'folio:runner',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    configureServer(server) {
      server.middlewares.use('/runner', (_req, res) => {
        void (made ??= runnerPage()).then((page) => {
          res.setHeader('content-type', 'text/html; charset=utf-8');
          res.setHeader('content-security-policy', runnerPolicy(page.hash));
          res.end(page.html);
        });
      });
    },
    async closeBundle() {
      if (this.environment?.config.command !== 'build') return;
      const page = await runnerPage();
      mkdirSync(join(outDir, 'runner'), { recursive: true });
      writeFileSync(join(outDir, 'runner', 'index.html'), page.html);
      const file = join(outDir, '_headers');
      writeFileSync(file, readFileSync(file, 'utf8').replace('RUNNER_POLICY', runnerPolicy(page.hash)));
    },
  };
}
