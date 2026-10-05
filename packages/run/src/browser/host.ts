import { cleanResult, cleanVersions, failed, LIMITS, type Cell, type CellResult, type Limits, type Runner, type Versions } from '../result';
import { CORE_FILES, type BootOptions, type FromRunner, type ToRunner } from './protocol';

/**
 * Folio's side of the workshop. It puts the runner page in a frame that may run scripts and nothing else (no
 * origin of ours, so none of our storage; no network), feeds it the interpreter's files, and takes back text and
 * pictures. What comes back is a stranger's: every message is checked for where it came from and what it holds.
 */

export interface HostOptions {
  /** The runner page's address, on this site. */
  runnerUrl: string;
  /** Where the interpreter's files are, ending in a slash. */
  runtimeUrl: string;
  limits?: Limits;
  /** Bytes of the interpreter's files as they arrive, the first time they are needed. */
  onDownload?: (file: string, loaded: number) => void;
}

/** Seconds a cell may run on an ordinary machine; a slower one is given more, by how much slower it is. */
const CELL_MS = 10_000;
const LOAD_MS = 120_000;
const BOOT_MS = 180_000;
const GRACE_MS = 5_000;
const FILE = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,159}$/;

interface Pending {
  id: number;
  resolve: (res: CellResult) => void;
  watchdog: ReturnType<typeof setTimeout>;
  started: number;
}

class Workshop implements Runner {
  private frame: HTMLIFrameElement | null = null;
  private pending: Pending | null = null;
  private ready: Promise<{ versions: Versions; speed: number }> | null = null;
  private settle: { resolve: (v: { versions: Versions; speed: number }) => void; reject: (e: Error) => void } | null = null;
  private allowed: Promise<Set<string>> | null = null;
  private fetched = new Map<string, Promise<ArrayBuffer>>();
  private seq = 0;
  private readonly limits: Limits;
  private readonly onMessage = (e: MessageEvent): void => this.message(e);

  constructor(private readonly options: HostOptions) {
    this.limits = options.limits ?? LIMITS;
  }

  private mount(): Promise<{ versions: Versions; speed: number }> {
    this.frame?.remove();
    window.addEventListener('message', this.onMessage);
    const frame = document.createElement('iframe');
    // Scripts and nothing else: without "allow-same-origin" the frame has no origin, so none of Folio's storage.
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('referrerpolicy', 'no-referrer');
    frame.setAttribute('aria-hidden', 'true');
    frame.setAttribute('tabindex', '-1');
    frame.hidden = true;
    frame.src = this.options.runnerUrl;
    document.body.appendChild(frame);
    this.frame = frame;
    for (const name of CORE_FILES) void this.file(name).catch(() => undefined);
    this.ready = new Promise((resolve, reject) => {
      this.settle = { resolve, reject };
      setTimeout(() => reject(new Error('The runner did not start.')), BOOT_MS);
    });
    this.ready.catch(() => undefined);
    return this.ready;
  }

  private send(m: ToRunner, transfer: Transferable[] = []): void {
    // "*": a frame with no origin has no name to address; the message goes to that one window and no other.
    this.frame?.contentWindow?.postMessage(m, '*', transfer);
  }

  /** Only what the lock file lists, or the interpreter itself: the runner cannot make the host fetch a name of its choosing. */
  private async mayFetch(name: string): Promise<boolean> {
    if (!FILE.test(name)) return false;
    if (CORE_FILES.includes(name)) return true;
    this.allowed ??= this.file('pyodide-lock.json').then((buf) => new Set(Object.values((JSON.parse(new TextDecoder().decode(buf)) as { packages: Record<string, { file_name: string }> }).packages).map((p) => p.file_name)));
    return (await this.allowed).has(name);
  }

  private file(name: string): Promise<ArrayBuffer> {
    const had = this.fetched.get(name);
    if (had) return had;
    const got = (async () => {
      const res = await fetch(this.options.runtimeUrl + name, { credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!res.ok || !res.body) throw new Error(`${name}: ${res.status}`);
      const chunks: Uint8Array[] = [];
      let loaded = 0;
      for (const reader = res.body.getReader(); ; ) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.byteLength;
        this.options.onDownload?.(name, loaded);
      }
      const all = new Uint8Array(loaded);
      chunks.reduce((at, c) => (all.set(c, at), at + c.byteLength), 0);
      return all.buffer;
    })();
    this.fetched.set(name, got);
    got.catch(() => this.fetched.delete(name));
    return got;
  }

  private async feed(rid: number, name: string): Promise<void> {
    const frame = this.frame;
    const buf = (await this.mayFetch(name).catch(() => false)) ? await this.file(name).catch(() => undefined) : undefined;
    // A copy goes in: the file is kept here for the next notebook, which starts without fetching anything.
    if (frame === this.frame) this.send({ t: 'file', rid, buf: buf?.slice(0) }, []);
  }

  private message(e: MessageEvent): void {
    // From our frame's window, and from a page with no origin: nothing else is the runner.
    if (!this.frame || e.source !== this.frame.contentWindow || e.origin !== 'null') return;
    const m = e.data as FromRunner;
    if (!m || typeof m !== 'object' || typeof m.t !== 'string') return;
    if (m.t === 'hello') this.send({ t: 'init', options: this.bootOptions() });
    else if (m.t === 'need' && typeof m.rid === 'number' && typeof m.name === 'string') void this.feed(m.rid, m.name);
    else if (m.t === 'ready') this.settle?.resolve({ versions: cleanVersions(m.versions), speed: Math.min(8, Math.max(1, Number(m.speed) || 1)) });
    else if (m.t === 'crash') this.settle?.reject(new Error(String(m.message).slice(0, 400)));
    else if (m.t === 'result' && this.pending && m.id === this.pending.id) this.result(m.res);
  }

  private bootOptions(): BootOptions {
    return { limits: this.limits, harden: { maxHeapMB: 1024, fileQuotaMB: 256 } };
  }

  private result(raw: unknown): void {
    const p = this.pending!;
    this.pending = null;
    clearTimeout(p.watchdog);
    const res = cleanResult(raw, this.limits) ?? failed('RunnerError', 'The runner sent something that is not a result.');
    if (res.sessionLost) this.ready = this.expectReady();
    p.resolve({ ...res, ms: performance.now() - p.started });
  }

  /** The runner page starts a new notebook by itself after it ends one: wait for that one to be ready. */
  private expectReady(): Promise<{ versions: Versions; speed: number }> {
    const next = new Promise<{ versions: Versions; speed: number }>((resolve, reject) => {
      this.settle = { resolve, reject };
      setTimeout(() => reject(new Error('The runner did not start again.')), BOOT_MS);
    });
    next.catch(() => undefined);
    return next;
  }

  async run(cell: Cell): Promise<CellResult> {
    if (this.pending) return failed('RunnerError', 'A cell is already running.');
    let speed: number;
    try {
      speed = (await (this.ready ?? this.mount())).speed;
    } catch (error) {
      this.close();
      return failed('RunnerError', String(error).slice(0, 400));
    }
    const id = ++this.seq;
    const cellMs = CELL_MS * speed;
    return new Promise((resolve) => {
      // The runner page keeps the time; if the page itself has hung, the frame is thrown away.
      const watchdog = setTimeout(() => {
        if (this.pending?.id !== id) return;
        this.pending = null;
        this.close();
        resolve(failed('RunnerUnresponsive', 'The runner stopped answering and was started again.'));
      }, LOAD_MS + cellMs + GRACE_MS);
      this.pending = { id, resolve, watchdog, started: performance.now() };
      this.send({ t: 'run', id, cell: { code: String(cell.code), stdin: cell.stdin ?? '', files: cell.files ?? [] }, cellMs, loadMs: LOAD_MS });
    });
  }

  async reset(): Promise<void> {
    if (!this.frame) return;
    this.ready = this.expectReady();
    this.send({ t: 'reset' });
    await this.ready;
  }

  async versions(): Promise<Versions> {
    return (await (this.ready ?? this.mount())).versions;
  }

  close(): void {
    window.removeEventListener('message', this.onMessage);
    this.frame?.remove();
    this.frame = null;
    this.ready = null;
  }
}

/** The runner a teacher's browser uses. Nothing is fetched or started until the first cell is run. */
export const browserRunner = (options: HostOptions): Runner => new Workshop(options);
