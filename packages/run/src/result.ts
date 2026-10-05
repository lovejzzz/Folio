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
  maxTraceback: number;
}

export const LIMITS: Limits = { maxOut: 200_000, maxFigures: 6, maxPngBytes: 8_000_000, maxTraceback: 20_000 };

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
  if (!png || png.byteLength > limits.maxPngBytes || !PNG.every((b, i) => png[i] === b)) return null;
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

/** Something that runs cells in order, one notebook at a time. */
export interface Runner {
  run(cell: Cell): Promise<CellResult>;
  /** Start a new notebook: names and files from earlier cells are gone. */
  reset(): Promise<void>;
  versions(): Promise<Versions>;
  close(): void;
}
