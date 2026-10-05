import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { cleanResult, cleanVersions, failed, LIMITS, RUNTIME_VERSION, type Cell, type CellResult, type Limits, type Runner } from './result';

/** Where `scripts/fetch-runtime.ts` puts the interpreter with its libraries, checked against their hashes. */
export const RUNTIME_DIR = process.env.FOLIO_RUNTIME_DIR ?? join(homedir(), '.cache', 'folio', `pyodide-${RUNTIME_VERSION}`);

/** The fetched folder when it is there; otherwise the package's own, which has Python and no libraries. */
function indexURL(): string {
  if (existsSync(join(RUNTIME_DIR, 'pyodide-lock.json'))) return RUNTIME_DIR + '/';
  return dirname(createRequire(import.meta.url).resolve('pyodide')) + '/';
}

/** How long one cell may take here, libraries and all: generous, since it only has to end what would never end. */
const CELL_MS = 120_000;

interface Answer {
  id: number;
  res?: unknown;
  error?: string;
}

/**
 * The runner for the command line, the tests and the check-ups: the same interpreter and the same driver as
 * the browser's, so a course generated here shows what a teacher's browser would show. Python is in a thread
 * of its own, ended when a cell runs too long. It is not a sandbox: it is for code our own pipeline wrote.
 */
export function nodeRunner(limits: Limits = LIMITS, cellMs = CELL_MS): Runner {
  let worker: Worker | null = null;
  let seq = 0;
  const waiting = new Map<number, (a: Answer) => void>();
  const close = (): void => {
    void worker?.terminate();
    worker = null;
    for (const [id, done] of waiting) done({ id, error: 'The notebook was closed.' });
    waiting.clear();
  };
  const open = (): Worker => {
    if (worker) return worker;
    // The thread reads TypeScript as this process does.
    const made = new Worker(new URL('./nodeWorker.ts', import.meta.url), { execArgv: ['--import', 'tsx'] });
    made.unref();
    made.on('message', (a: Answer) => (waiting.get(a.id)?.(a), waiting.delete(a.id)));
    made.on('error', () => made === worker && close());
    made.postMessage({ t: 'open', indexURL: indexURL(), limits });
    return (worker = made);
  };
  const ask = (m: { t: 'run'; cell: Cell } | { t: 'versions' }): Promise<Answer> =>
    new Promise((resolve) => {
      const id = ++seq;
      waiting.set(id, resolve);
      open().postMessage({ ...m, id });
    });
  return {
    async run(cell: Cell): Promise<CellResult> {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const late = new Promise<Answer>((resolve) => (timer = setTimeout(() => resolve({ id: 0, error: 'late' }), cellMs)));
      const a = await Promise.race([ask({ t: 'run', cell }), late]);
      clearTimeout(timer);
      if (a.error === 'late') {
        close();
        return failed('TimeoutError', `The cell ran for more than ${cellMs / 1000} seconds and was stopped.`, cellMs);
      }
      if (a.error) close();
      return a.error ? failed('RunnerError', a.error) : (cleanResult(a.res, limits) ?? failed('RunnerError', 'The runner sent nothing back.'));
    },
    async reset() {
      close();
    },
    versions: async () => cleanVersions((await ask({ t: 'versions' })).res),
    close,
  };
}
