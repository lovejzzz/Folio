import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { Plugin } from 'vite';

const sha256 = (text: string): string => `'sha256-${createHash('sha256').update(text).digest('base64')}'`;

/**
 * React Aria injects two small, static <style> tags (touch-action for
 * pressable elements, overscroll containment while a dialog is open). Read
 * them from the installed package so the hashes follow upgrades, and fail
 * the build rather than ship a policy that silently blocks them.
 */
function reactAriaStyleHashes(): string[] {
  const root = dirname(createRequire(import.meta.url).resolve('react-aria/package.json'));
  const files = ['dist/private/interactions/usePress.mjs', 'dist/private/overlays/usePreventScroll.mjs'];
  return files.map((file) => {
    const source = readFileSync(join(root, file), 'utf8');
    const template = source.match(/style\.textContent = `([\s\S]*?)`\.trim\(\)/)?.[1];
    if (!template) throw new Error(`folio:csp-hashes could not find the injected style in react-aria/${file}`);
    const text = template.replace(/\$\{([^}]+)\}/g, (_, name: string) => {
      const value = source.match(new RegExp(`${name.replace(/\$/g, '\\$')} = '([^']+)'`))?.[1];
      if (!value) throw new Error(`folio:csp-hashes could not resolve ${name} in react-aria/${file}`);
      return value;
    });
    return sha256(text.trim());
  });
}

/**
 * Hash every inline script and injected style into the Content-Security-Policy
 * in _headers, so the policy stays strict (no 'unsafe-inline').
 */
export function cspHashes(): Plugin {
  let outDir = 'dist';
  return {
    name: 'folio:csp-hashes',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const html = readFileSync(join(outDir, 'index.html'), 'utf8');
      const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => sha256(m[1] ?? ''));
      const file = join(outDir, '_headers');
      const headers = readFileSync(file, 'utf8')
        .replace("'sha256-INLINE_SCRIPTS'", scripts.join(' '))
        .replace("'sha256-INJECTED_STYLES'", reactAriaStyleHashes().join(' '));
      writeFileSync(file, headers);
    },
  };
}

/** Serve the built _headers during `vite preview`, so end-to-end tests run under the real CSP. */
export function previewHeaders(): Plugin {
  return {
    name: 'folio:preview-headers',
    configurePreviewServer(server) {
      const file = join(server.config.build.outDir, '_headers');
      const headers = [...readFileSync(file, 'utf8').split('/assets/*')[0]!.matchAll(/^\s+([\w-]+): (.+)$/gm)].map((m) => [m[1]!, m[2]!] as const);
      server.middlewares.use((_req, res, next) => {
        for (const [name, value] of headers) res.setHeader(name, value);
        next();
      });
    },
  };
}
