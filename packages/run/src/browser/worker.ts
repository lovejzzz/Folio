import { loadPyodide } from 'pyodide';
import { createSession, type Session } from '../session';
import { CORE_FILES, FEED, type BootOptions, type FromWorker, type ToWorker } from './protocol';

/**
 * Inside the runner's worker: one Python, one notebook. It has no network at all, so the interpreter's files
 * are asked of the host by name and handed in; the host fetches them where a browser cache works.
 */

const scope = self as unknown as { postMessage(m: FromWorker, transfer?: Transferable[]): void; onmessage: ((e: MessageEvent<ToWorker>) => void) | null; fetch: typeof fetch; Worker?: unknown };
const post = (m: FromWorker, transfer: Transferable[] = []): void => scope.postMessage(m, transfer);

const waiting = new Map<number, (buf: ArrayBuffer | undefined) => void>();
let asked = 0;
/** A file by its name, from the host. */
const need = (name: string): Promise<ArrayBuffer | undefined> =>
  new Promise((resolve) => {
    waiting.set(++asked, resolve);
    post({ t: 'need', rid: asked, name });
  });

const MIME: Record<string, string> = { wasm: 'application/wasm', json: 'application/json', zip: 'application/zip', whl: 'application/zip' };

/** The interpreter fetches its files from one address: those requests are answered from what the host hands in. */
function feed(): void {
  const real = scope.fetch.bind(self);
  scope.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith(FEED)) return real(input, init);
    const name = url.slice(FEED.length).split(/[?#]/)[0]!;
    const buf = await need(name);
    if (!buf) return new Response('not available', { status: 404 });
    return new Response(buf, { status: 200, headers: { 'content-type': MIME[name.split('.').pop() ?? ''] ?? 'application/octet-stream' } });
  };
}

/** Python's memory lives in one growing block: refuse growth past the cap, and Python sees a MemoryError. */
function capHeap(megabytes: number): void {
  const grow = WebAssembly.Memory.prototype.grow;
  const pages = megabytes * 16; // 64 KiB each
  WebAssembly.Memory.prototype.grow = function (delta: number) {
    if (this.buffer.byteLength / 65536 + delta > pages) throw new RangeError('folio: memory limit');
    return grow.call(this, delta);
  };
}

/** How many times slower than an ordinary laptop this machine runs Python: time limits stretch by it. */
async function speed(session: Session): Promise<number> {
  const res = await session.run({ code: 'import time as _t\n_s = _t.perf_counter()\n_n = 0\nfor _i in range(300000):\n    _n += _i * _i % 7\n(_t.perf_counter() - _s) * 1000' });
  const ms = Number(res.value);
  // About 40 ms on a 2023 laptop.
  return Number.isFinite(ms) ? Math.min(8, Math.max(1, ms / 40)) : 1;
}

async function boot(options: BootOptions): Promise<Session> {
  capHeap(options.harden.maxHeapMB);
  feed();
  const asm = await need(CORE_FILES[0]!);
  if (!asm) throw new Error('The interpreter could not be had.');
  const url = URL.createObjectURL(new Blob([asm], { type: 'text/javascript' }));
  const createPyodideModule = ((await import(/* @vite-ignore */ url)) as { default: unknown }).default;
  URL.revokeObjectURL(url);
  const session = await createSession({
    loadPyodide: loadPyodide as never,
    indexURL: FEED,
    limits: options.limits,
    fileQuotaMB: options.harden.fileQuotaMB,
    // `import js` in Python gets an empty object, not this worker's own scope.
    loadOptions: { createPyodideModule, jsglobals: {}, packageBaseUrl: FEED },
    onPackage: (message) => post({ t: 'package', message }),
  });
  // No workers of its own: one would outlive its cell and the time limit with it.
  try {
    delete scope.Worker;
  } catch {
    scope.Worker = undefined;
  }
  return session;
}

let session: Session | null = null;

scope.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.t === 'file') {
      waiting.get(m.rid)?.(m.buf);
      waiting.delete(m.rid);
    } else if (m.t === 'ping') post({ t: 'pong', n: m.n });
    else if (m.t === 'boot') {
      session = await boot(m.options);
      const factor = await speed(session);
      post({ t: 'ready', versions: session.versions(), speed: factor });
    } else if (m.t === 'run' && session) {
      const res = await session.run(m.cell, () => post({ t: 'exec', id: m.id }));
      const buffers = (Array.isArray(res.figures) ? res.figures : []).flatMap((f: { png?: Uint8Array }) => {
        if (!(f.png instanceof Uint8Array)) return [];
        // Out of the interpreter's memory into a buffer of its own, which can be handed over without a copy.
        const copy = f.png.slice();
        f.png = copy;
        return [copy.buffer as ArrayBuffer];
      });
      post({ t: 'result', id: m.id, res }, buffers);
    }
  } catch (error) {
    post({ t: 'fatal', message: String(error).slice(0, 2000) });
  }
};
post({ t: 'alive' });
