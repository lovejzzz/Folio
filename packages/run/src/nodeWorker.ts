import { parentPort } from 'node:worker_threads';
import { loadPyodide } from 'pyodide';
import type { Cell, Limits } from './result';
import { createSession, type Session } from './session';

/** The thread that holds Python for the Node runner: apart from the caller, so a cell that never ends can be ended. */

type Ask = { t: 'open'; indexURL: string; limits: Limits } | { t: 'run'; id: number; cell: Cell } | { t: 'versions'; id: number };

let session: Promise<Session> | null = null;

parentPort!.on('message', (m: Ask) => {
  if (m.t === 'open') session = createSession({ loadPyodide: loadPyodide as never, indexURL: m.indexURL, limits: m.limits });
  else if (m.t === 'run') void session!.then((s) => s.run(m.cell)).then((res) => parentPort!.postMessage({ id: m.id, res }), (error: unknown) => parentPort!.postMessage({ id: m.id, error: String(error).slice(0, 2000) }));
  else void session!.then((s) => parentPort!.postMessage({ id: m.id, res: s.versions() }), (error: unknown) => parentPort!.postMessage({ id: m.id, error: String(error).slice(0, 2000) }));
});
