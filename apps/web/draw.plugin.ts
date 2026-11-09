import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { build, type Plugin } from 'vite';

/**
 * The drawing page: where the code of a drawn slide picture runs (packages/draw, frame/page.ts). Like the runner
 * page, it is one file with one script, in a frame with no origin, no network and no storage; each card runs in a
 * worker made from text, which the policy allows and nothing else. The kit itself comes from the page that embeds
 * the frame, as a message: the frame asks the network for nothing.
 */

const entry = (): string => join(dirname(createRequire(import.meta.url).resolve('@folio/draw/frame')), 'page.ts');

export interface DrawPage {
  html: string;
  hash: string;
}

export async function drawPage(): Promise<DrawPage> {
  const out = await build({ configFile: false, logLevel: 'error', build: { write: false, minify: true, target: 'es2022', lib: { entry: entry(), formats: ['iife'], name: 'folioDraw' } } });
  const chunk = (Array.isArray(out) ? out : [out]).flatMap((o) => ('output' in o ? o.output : [])).find((o) => o.type === 'chunk');
  if (!chunk || chunk.type !== 'chunk') throw new Error('folio:draw could not build the drawing page');
  const script = chunk.code.replace(/<\/script/gi, '<\\/script');
  const hash = `'sha256-${createHash('sha256').update(script).digest('base64')}'`;
  return { html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Folio drawing</title></head><body><script>${script}</script></body></html>\n`, hash };
}

/** What the drawing page may do: run its one script and start workers from text. No other script, and no connection of any kind. */
export const drawPolicy = (hash: string): string => `default-src 'none'; script-src ${hash}; worker-src blob:; connect-src 'none'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'`;

/** Writes /draw/index.html into the build and its policy into _headers; serves the same page in development. */
export function drawFrame(): Plugin {
  let outDir = 'dist';
  let made: Promise<DrawPage> | null = null;
  return {
    name: 'folio:draw',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    configureServer(server) {
      server.middlewares.use('/draw', (_req, res) => {
        void (made ??= drawPage()).then((page) => {
          res.setHeader('content-type', 'text/html; charset=utf-8');
          res.setHeader('content-security-policy', drawPolicy(page.hash));
          res.end(page.html);
        });
      });
    },
    async closeBundle() {
      if (this.environment?.config.command !== 'build') return;
      const page = await drawPage();
      mkdirSync(join(outDir, 'draw'), { recursive: true });
      writeFileSync(join(outDir, 'draw', 'index.html'), page.html);
      const file = join(outDir, '_headers');
      writeFileSync(file, readFileSync(file, 'utf8').replace('DRAW_POLICY', drawPolicy(page.hash)));
    },
  };
}
