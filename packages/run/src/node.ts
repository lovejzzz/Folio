import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { loadPyodide, version } from 'pyodide';
import { cleanResult, cleanVersions, failed, LIMITS, type Cell, type CellResult, type Limits, type Runner } from './result';
import { createSession, type Session } from './session';

/** Where `scripts/fetch-runtime.mjs` puts the interpreter with its libraries, checked against their hashes. */
export const RUNTIME_DIR = process.env.FOLIO_RUNTIME_DIR ?? join(homedir(), '.cache', 'folio', `pyodide-${version}`);

/** The fetched folder when it is there; otherwise the package's own, which has Python and no libraries. */
function indexURL(): string {
  if (existsSync(join(RUNTIME_DIR, 'pyodide-lock.json'))) return RUNTIME_DIR + '/';
  return dirname(createRequire(import.meta.url).resolve('pyodide')) + '/';
}

/**
 * The runner for the command line, the tests and the check-ups: the same interpreter and the same driver as
 * the browser's, so a course generated here shows what a teacher's browser would show.
 * It has no time limit of its own and is not a sandbox: it is for code our own pipeline wrote.
 */
export function nodeRunner(limits: Limits = LIMITS): Runner {
  let session: Promise<Session> | null = null;
  const open = (): Promise<Session> => (session ??= createSession({ loadPyodide: loadPyodide as never, indexURL: indexURL(), limits }));
  return {
    async run(cell: Cell): Promise<CellResult> {
      try {
        return cleanResult(await (await open()).run(cell), limits) ?? failed('RunnerError', 'The runner sent nothing back.');
      } catch (e) {
        session = null;
        return failed('RunnerError', String(e).slice(0, 2000));
      }
    },
    async reset() {
      session = null;
    },
    versions: async () => cleanVersions((await open()).versions()),
    close() {
      session = null;
    },
  };
}
