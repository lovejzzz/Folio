import { CORE_FILES, type BootOptions, type FromRunner, type FromWorker, type ToRunner, type ToWorker } from './protocol';

/**
 * The runner page: the frame's own thread. It never runs course code. It owns the worker that does, ends a cell
 * that runs too long by ending the worker, and passes plain data up to the host and down to the worker.
 * Kept small on purpose: what runs here is outside the worker's limits.
 */

declare const WORKER_SOURCE: string;

/** The one page allowed to speak to this frame: whoever embeds it. A frame with no origin cannot check a name. */
const host = window.parent;
const up = (m: FromRunner, transfer: Transferable[] = []): void => host.postMessage(m, '*', transfer);

const TEXT = 400;
/** Messages a worker may send up in a second before it is taken for a flood and ended. */
const MAX_PER_SECOND = 200;
const PONG_MS = 1500;

interface Running {
  id: number;
  cell: unknown;
  cellMs: number;
  hard: ReturnType<typeof setTimeout>;
  timer?: ReturnType<typeof setTimeout>;
}

let worker: Worker | null = null;
let ready = false;
let options: BootOptions | null = null;
let current: Running | null = null;
let queued: Running | null = null;
let seen = { at: 0, n: 0 };
let pings = 0;

const down = (m: ToWorker, transfer: Transferable[] = []): void => worker?.postMessage(m, transfer);

function kill(): void {
  worker?.terminate();
  worker = null;
  ready = false;
}

/** The interpreter's script, asked of the host once: it goes at the head of every worker's code. */
let interpreter: ArrayBuffer | null = null;
const INTERPRETER_RID = -1;

function spawn(): void {
  kill();
  if (!interpreter) return up({ t: 'need', rid: INTERPRETER_RID, name: CORE_FILES[0]! });
  const url = URL.createObjectURL(new Blob([interpreter, '\n', WORKER_SOURCE], { type: 'text/javascript' }));
  const made = new Worker(url);
  worker = made;
  made.onmessage = (e) => {
    // Let go of the text only once the worker has read it: Safari's engine reads it late, and found it gone.
    if ((e.data as FromWorker)?.t === 'alive') URL.revokeObjectURL(url);
    if (made === worker) fromWorker(e.data as FromWorker);
  };
  made.onerror = (e) => made === worker && lost(String(e.message ?? 'worker error'));
}

/** The cell that was running ends with an error of ours, and the next one starts in a new notebook. */
function end(type: string, message: string): void {
  const cur = current;
  current = null;
  if (cur) {
    clearTimeout(cur.timer);
    clearTimeout(cur.hard);
    up({ t: 'result', id: cur.id, res: { error: { type, message, line: null, traceback: '' }, sessionLost: true } });
  }
  spawn();
}

function lost(message: string): void {
  if (current) end('RunnerError', message.slice(0, TEXT));
  else {
    kill();
    up({ t: 'crash', message: message.slice(0, TEXT) });
  }
}

function start(run: Running): void {
  current = run;
  down({ t: 'run', id: run.id, cell: run.cell as never });
}

/** After a result the worker must answer at once: one that goes on computing is ended, whatever it reported. */
function stillThere(): void {
  const n = ++pings;
  const made = worker;
  down({ t: 'ping', n });
  setTimeout(() => {
    if (made === worker && pings === n && !current) spawn();
  }, PONG_MS);
}

function fromWorker(m: FromWorker): void {
  const now = performance.now();
  seen = now - seen.at > 1000 ? { at: now, n: 1 } : { at: seen.at, n: seen.n + 1 };
  if (seen.n > MAX_PER_SECOND) return lost('The runner sent too much, too fast.');
  if (!m || typeof m !== 'object') return;
  if (m.t === 'alive' && options) down({ t: 'boot', options });
  else if (m.t === 'ready') {
    ready = true;
    up({ t: 'ready', versions: m.versions, speed: Number(m.speed) || 1 });
    if (queued) start(queued);
    queued = null;
  } else if (m.t === 'need') up({ t: 'need', rid: Number(m.rid), name: String(m.name).slice(0, 200) });
  else if (m.t === 'package') up({ t: 'package', message: String(m.message).slice(0, TEXT) });
  else if (m.t === 'exec' && current && m.id === current.id && !current.timer) current.timer = setTimeout(() => end('TimeoutError', `The cell ran for more than ${Math.round(current!.cellMs / 1000)} seconds and was stopped.`), current.cellMs);
  else if (m.t === 'pong') pings += 1;
  else if (m.t === 'fatal') lost(String(m.message));
  else if (m.t === 'result' && current && m.id === current.id) finish(m.res);
}

function finish(res: Record<string, unknown>): void {
  const cur = current!;
  current = null;
  clearTimeout(cur.timer);
  clearTimeout(cur.hard);
  const figures = Array.isArray(res?.figures) ? res.figures : [];
  const buffers = figures.flatMap((f: { png?: unknown }) => (f?.png instanceof Uint8Array ? [f.png.buffer as ArrayBuffer] : []));
  // Out of memory, the notebook still holds whatever filled it: the next cell gets a new one.
  const full = (res?.error as { type?: string } | null)?.type === 'MemoryError';
  up({ t: 'result', id: cur.id, res: full ? { ...res, sessionLost: true } : res }, buffers);
  if (full) spawn();
  else stillThere();
}

window.addEventListener('message', (e: MessageEvent<ToRunner>) => {
  if (e.source !== host) return;
  const m = e.data;
  if (!m || typeof m !== 'object') return;
  if (m.t === 'init') {
    options = m.options;
    if (!worker) spawn();
  } else if (m.t === 'file' && m.rid === INTERPRETER_RID) {
    if (!m.buf) return lost('The interpreter could not be had.');
    interpreter = m.buf;
    spawn();
  } else if (m.t === 'file') down({ t: 'file', rid: m.rid, buf: m.buf }, m.buf ? [m.buf] : []);
  else if (m.t === 'reset') {
    current = null;
    queued = null;
    spawn();
  } else if (m.t === 'run' && !current && !queued) {
    // The hard limit covers a worker that never says it started: libraries to load, then the cell.
    const run: Running = { id: m.id, cell: m.cell, cellMs: m.cellMs, hard: setTimeout(() => end('TimeoutError', 'The cell did not finish and was stopped.'), m.loadMs + m.cellMs) };
    if (ready) start(run);
    else queued = run;
  }
});
up({ t: 'hello' });
