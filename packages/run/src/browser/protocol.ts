import type { Cell, Limits } from '../result';

/**
 * What passes between the three places a run lives. The page of Folio (the host) holds the course and is the
 * only one trusted. The runner page sits in a frame with no origin, no network and no storage; it owns a worker
 * and kills it when a cell runs too long. The worker holds Python. Everything is plain data, and everything
 * coming up from the runner is checked again by the host before it is used.
 */

/** A made-up address the interpreter asks for its files at. Nothing is fetched from it: each file is handed in. */
export const FEED = 'https://runtime.invalid/';

export interface Hardening {
  /** Megabytes the interpreter's memory may grow to. */
  maxHeapMB: number;
  /** Megabytes of files course code may write. */
  fileQuotaMB: number;
}

export interface BootOptions {
  limits: Limits;
  harden: Hardening;
}

/** Host → runner page. */
export type ToRunner =
  | { t: 'init'; options: BootOptions }
  | { t: 'run'; id: number; cell: Cell; cellMs: number; loadMs: number }
  | { t: 'reset' }
  | { t: 'file'; rid: number; buf?: ArrayBuffer };

/** Runner page → host. Strings are cut by the runner page; the host checks every field again. */
export type FromRunner =
  | { t: 'hello' }
  | { t: 'ready'; versions: unknown; speed: number }
  | { t: 'need'; rid: number; name: string }
  | { t: 'package'; message: string }
  | { t: 'result'; id: number; res: unknown }
  | { t: 'crash'; message: string };

/** Runner page → worker. */
export type ToWorker = { t: 'boot'; options: BootOptions } | { t: 'run'; id: number; cell: Cell } | { t: 'file'; rid: number; buf?: ArrayBuffer } | { t: 'ping'; n: number };

/** Worker → runner page. Course code can post anything from here: the runner page treats it as a stranger's. */
export type FromWorker =
  | { t: 'alive' }
  | { t: 'ready'; versions: unknown; speed: number }
  | { t: 'need'; rid: number; name: string }
  | { t: 'package'; message: string }
  | { t: 'exec'; id: number }
  | { t: 'result'; id: number; res: Record<string, unknown> }
  | { t: 'pong'; n: number }
  | { t: 'fatal'; message: string };

/** Files a session cannot start without: asked for before the worker asks, so they arrive together. */
export const CORE_FILES = ['pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json'];
