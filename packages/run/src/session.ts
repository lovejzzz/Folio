import type { PyodideAPI } from 'pyodide';
import { DRIVER } from './driver';
import type { Cell, Limits } from './result';

type Load = (options: Record<string, unknown>) => Promise<PyodideAPI>;

export interface SessionOptions {
  loadPyodide: Load;
  /** Where the interpreter's own files and the libraries are, ending in a slash. */
  indexURL: string;
  limits: Limits;
  /** Megabytes of files course code may write. 0: no limit. */
  fileQuotaMB?: number;
  /** Extra options for the loader: the browser hides its own globals from Python here. */
  loadOptions?: Record<string, unknown>;
  onPackage?: (message: string) => void;
}

/** One interpreter: one notebook. What `run` returns is raw and still has to go through `cleanResult`. */
export interface Session {
  /** `onExec` is called when the libraries are in and the cell's own code is about to start: its time is counted from there. */
  run(cell: Cell, onExec?: () => void): Promise<Record<string, unknown>>;
  versions(): Record<string, unknown>;
  heapBytes(): number | null;
}

interface PyCallable {
  callKwargs(...args: unknown[]): PyProxyLike;
  (...args: unknown[]): PyProxyLike;
}
interface PyProxyLike {
  toJs(options: { dict_converter: typeof Object.fromEntries; create_pyproxies: boolean }): unknown;
  destroy(): void;
}
interface FileOps {
  write: (this: unknown, stream: { node: { usedBytes?: number } }, buffer: unknown, offset: number, length: number, position: number, canOwn?: boolean) => number;
}
interface Memfs {
  stream_ops: FileOps;
  ops_table?: { file?: { stream: FileOps } };
}

/**
 * Files live in JavaScript memory outside the interpreter's heap, so a cap on the heap does not cover them.
 * Count what course code writes and refuse past the quota: Python sees a full disk.
 */
function fileQuota(py: PyodideAPI, megabytes: number): (on: boolean) => void {
  const fs = py.FS as unknown as { filesystems: { MEMFS: Memfs }; ErrnoError: new (errno: number) => Error };
  const memfs = fs.filesystems.MEMFS;
  const write = memfs.stream_ops.write;
  const quota = megabytes * 1_048_576;
  let grown = 0;
  let counting = false;
  const guarded: FileOps['write'] = function (stream, buffer, offset, length, position, canOwn) {
    const more = Math.max(0, position + length - (stream.node.usedBytes ?? 0));
    if (counting) {
      if (grown + more > quota) throw new fs.ErrnoError(51); // no space left on device
      grown += more;
    }
    return write.call(this, stream, buffer, offset, length, position, canOwn);
  };
  memfs.stream_ops.write = guarded;
  // The file system copies its operations into a table when the first file is made: that copy is the one used.
  if (memfs.ops_table?.file) memfs.ops_table.file.stream.write = guarded;
  return (on) => (counting = on);
}

function writeFiles(py: PyodideAPI, files: Cell['files']): void {
  for (const f of files ?? []) {
    const dir = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : '';
    if (dir) py.FS.mkdirTree(dir);
    py.FS.writeFile(f.path, f.data);
  }
}

export async function createSession(options: SessionOptions): Promise<Session> {
  const py = await options.loadPyodide({
    indexURL: options.indexURL,
    // A fixed hash seed: the order of a set of strings is the same in every run and on every machine.
    env: { MPLBACKEND: 'Agg', HOME: '/home/pyodide', MPLCONFIGDIR: '/tmp/mpl', PYTHONHASHSEED: '0' },
    stdout: () => undefined,
    stderr: () => undefined,
    // Nobody is there to type: without this Node waits on the terminal for ever and a browser fails another way.
    stdin: () => null,
    ...options.loadOptions,
  });
  const counting = options.fileQuotaMB ? fileQuota(py, options.fileQuotaMB) : () => undefined;
  const ns = py.globals.get('dict')();
  py.runPython(DRIVER, { globals: ns, filename: '<folio>' });
  const runCell = ns.get('run_cell') as PyCallable;
  const prepare = ns.get('prepare') as PyCallable;
  const versions = ns.get('versions') as PyCallable;
  const toJs = (proxy: PyProxyLike): unknown => {
    const v = proxy.toJs({ dict_converter: Object.fromEntries, create_pyproxies: false });
    proxy.destroy();
    return v;
  };

  async function run(cell: Cell, onExec?: () => void): Promise<Record<string, unknown>> {
    const started = performance.now();
    let loadError: string | null = null;
    try {
      const loaded = await py.loadPackagesFromImports(cell.code, { messageCallback: (m: string) => options.onPackage?.(String(m).slice(0, 300)), errorCallback: () => undefined });
      prepare(loaded.map((p) => p.name));
    } catch (e) {
      loadError = String(e).slice(0, 2000);
    }
    writeFiles(py, cell.files);
    onExec?.();
    counting(true);
    try {
      const res = toJs(runCell.callKwargs(cell.code, { max_out: options.limits.maxOut, max_figs: options.limits.maxFigures, stdin: cell.stdin ?? '' })) as Record<string, unknown>;
      return { ...res, loadError, ms: performance.now() - started };
    } finally {
      counting(false);
    }
  }

  return {
    run,
    versions: () => toJs(versions()) as Record<string, unknown>,
    heapBytes: () => (py as unknown as { _module?: { HEAPU8?: Uint8Array } })._module?.HEAPU8?.length ?? null,
  };
}
