import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderTokens } from '../src/tokensCss';

/** Generates tokens.css from tokens.ts. `--check` fails if the file is stale. */

const OUT = fileURLToPath(new URL('../src/tokens.css', import.meta.url));

const check = process.argv.includes('--check');
const next = renderTokens();
if (check) {
  const current = readFileSync(OUT, 'utf8');
  if (current !== next) {
    console.error('tokens.css is out of date. Run `pnpm tokens`.');
    process.exit(1);
  }
  console.log('tokens.css is up to date.');
} else {
  writeFileSync(OUT, next);
  console.log(`Wrote ${OUT}`);
}
