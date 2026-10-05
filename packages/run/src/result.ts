/** A file put in the working folder before a cell runs: a data file the course provides. */
export interface RunFile {
  path: string;
  data: string | Uint8Array;
}

export interface Cell {
  code: string;
  files?: RunFile[];
  /** What `input()` reads, line by line. Empty: `input()` fails as it does when nobody is there to type. */
  stdin?: string;
}

export interface RunError {
  /** The exception's class, or one of ours: `TimeoutError`, `MemoryError`, `RunnerUnresponsive`. */
  type: string;
  message: string;
  /** The line of the cell it happened on, counted from 1. */
  line: number | null;
  traceback: string;
}

export interface RunFigure {
  png: Uint8Array;
  widthIn: number | null;
  heightIn: number | null;
}

export interface CellResult {
  stdout: string;
  stderr: string;
  /** The repr of the cell's last expression, as a notebook shows it. */
  value: string | null;
  error: RunError | null;
  figures: RunFigure[];
  /** Figures left out: past the limit, too large, or not a picture. */
  figuresDropped: number;
  /** The output went past the limit and was cut. */
  cut: boolean;
  /** A library the cell asked for could not be brought in. */
  loadError: string | null;
  /** The interpreter was thrown away with this cell: names from earlier cells are gone. */
  sessionLost: boolean;
  ms: number;
}

/** Which Python and which libraries ran the code, by version: `{ python: '3.14.2', pandas: '3.0.2' }`. */
export type Versions = Record<string, string>;

export interface Limits {
  /** Characters of stdout, and of stderr, kept from one cell. */
  maxOut: number;
  maxFigures: number;
  maxPngBytes: number;
  /** Pixels a figure may have along a side: a picture is decoded whole wherever it is shown or exported. */
  maxPngSide: number;
  maxTraceback: number;
}

export const LIMITS: Limits = { maxOut: 200_000, maxFigures: 6, maxPngBytes: 2_000_000, maxPngSide: 4096, maxTraceback: 20_000 };

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const record = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

function cleanError(raw: unknown, limits: Limits): RunError | null {
  const e = record(raw);
  if (!e) return null;
  return { type: text(e.type, 200), message: text(e.message, 4000), line: num(e.line), traceback: text(e.traceback, limits.maxTraceback) };
}

function cleanFigure(raw: unknown, limits: Limits): RunFigure | null {
  const f = record(raw);
  if (!f) return null;
  const png = f.png instanceof ArrayBuffer ? new Uint8Array(f.png) : f.png instanceof Uint8Array ? f.png : null;
  if (!png || png.byteLength < 24 || png.byteLength > limits.maxPngBytes || !PNG.every((b, i) => png[i] === b)) return null;
  // The size is read from the file's own header, before anything decodes it.
  const side = (at: number) => ((png[at]! << 24) | (png[at + 1]! << 16) | (png[at + 2]! << 8) | png[at + 3]!) >>> 0;
  if (side(16) < 1 || side(20) < 1 || side(16) > limits.maxPngSide || side(20) > limits.maxPngSide) return null;
  return { png, widthIn: num(f.width_in), heightIn: num(f.height_in) };
}

/**
 * A result rebuilt from the fields we know, each checked for its type and cut to its limit.
 * What ran the code is not trusted: anything else it sent is dropped, and a figure is kept only if it is a PNG.
 */
export function cleanResult(raw: unknown, limits: Limits = LIMITS): CellResult | null {
  const r = record(raw);
  if (!r) return null;
  const sent = Array.isArray(r.figures) ? r.figures.slice(0, 64) : [];
  const figures = sent.map((f) => cleanFigure(f, limits)).filter((f): f is RunFigure => f !== null);
  const kept = figures.slice(0, limits.maxFigures);
  return {
    stdout: text(r.stdout, limits.maxOut),
    stderr: text(r.stderr, limits.maxOut),
    value: typeof r.value === 'string' ? text(r.value, limits.maxOut) : null,
    error: cleanError(r.error, limits),
    figures: kept,
    figuresDropped: (num(r.figures_dropped) ?? 0) + (sent.length - kept.length),
    cut: r.cut === true,
    loadError: typeof r.loadError === 'string' ? text(r.loadError, 2000) : null,
    sessionLost: r.sessionLost === true,
    ms: num(r.ms) ?? 0,
  };
}

export function cleanVersions(raw: unknown): Versions {
  const out: Versions = {};
  for (const [k, v] of Object.entries(record(raw) ?? {}).slice(0, 20)) if (typeof v === 'string') out[k.slice(0, 40)] = v.slice(0, 40);
  return out;
}

/** A result for a cell that never ran or never answered. */
export function failed(type: string, message: string, ms = 0): CellResult {
  return { stdout: '', stderr: '', value: null, error: { type, message, line: null, traceback: '' }, figures: [], figuresDropped: 0, cut: false, loadError: null, sessionLost: true, ms };
}

/** The interpreter's version: the folder its files are served from, and what Node runs. A test holds it to the installed package. */
export const RUNTIME_VERSION = '314.0.7';

/**
 * The interpreter tests whether it is in the kind of worker it refuses by loading an empty script: there, the
 * load succeeds. In the runner it must fail, and it does, because the runner's policy refuses every script; but
 * Safari's engine reports each refusal as a violation. The test is taken out: this worker is of that kind, and
 * the interpreter runs in it.
 */
const PROBE = /return\s+(?:globalThis\.)?importScripts\("data:text\/javascript,"\),!0/g;
export function withoutProbe(code: string): string {
  const out = code.replace(PROBE, 'return!1');
  if (out.includes('data:text/javascript')) throw new Error('The interpreter tests for its worker in a way this does not know.');
  return out;
}

/**
 * The interpreter's own script as a worker can hold it. It is published as a module; a worker made from text
 * cannot import one in every browser (Safari's engine refuses), so it is turned into a plain script that leaves
 * its one function where the worker finds it. Each edit is checked: a version shaped otherwise fails here.
 * The name carries the edit's number: a browser keeps a runtime file for good, so a changed file needs a new name.
 */
export const ASM_SCRIPT = 'pyodide.asm.folio2.js';
export function classicAsm(module: string): string {
  const tail = 'export default _createPyodideModule;';
  if (!module.trimEnd().endsWith(tail) || !module.startsWith('async function _createPyodideModule(')) throw new Error('The interpreter\'s script is not shaped as expected.');
  return withoutProbe(module.trimEnd().slice(0, -tail.length).replaceAll('import.meta.url', 'self.location.href'));
}

/** Errors that are the runner's own, not the code's: the cell was never judged. */
export const RUNNER_ERRORS = ['RunnerError', 'RunnerUnresponsive'];

/** Something that runs cells in order, one notebook at a time. */
export interface Runner {
  run(cell: Cell): Promise<CellResult>;
  /** Start a new notebook: names and files from earlier cells are gone. */
  reset(): Promise<void>;
  versions(): Promise<Versions>;
  close(): void;
}
