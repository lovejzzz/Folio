import { applyPatches, enablePatches, produceWithPatches, type Patch } from 'immer';
import { applyCommand, type Command } from './commands';
import { newId } from './ids';
import type { Course } from './schema';

enablePatches();

/** A translatable history label: a message key plus values. */
export interface Label {
  key: string;
  values?: Record<string, string | number>;
}

export type ChangeSource = 'teacher' | 'ai';

export interface HistoryEntry {
  id: string;
  label: Label;
  source: ChangeSource;
  at: string;
  commands: Command[];
  patches: Patch[];
  inverse: Patch[];
  /** Values at each touched path right after the change; used to detect conflicts. */
  refs: PathRef[];
  /** False for build steps: they stay in history but ⌘Z skips them. */
  undoable: boolean;
  undone: boolean;
}

export interface PathRef {
  path: (string | number)[];
  value: unknown;
}

export interface ApplyOptions {
  label: Label;
  source: ChangeSource;
  /** Build steps are recorded in history but skipped by ⌘Z. */
  undoable?: boolean;
  /** Bookkeeping (such as the build status) that never appears in history. */
  silent?: boolean;
}

export type UndoResult = { ok: true } | { ok: false; reason: 'conflict' | 'nothing' };

/** How many entries history keeps, in memory and on disk. */
export const HISTORY_LIMIT = 200;

function getIn(root: unknown, path: (string | number)[]): unknown {
  let node: unknown = root;
  for (const key of path) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string | number, unknown>)[key];
  }
  return node;
}

/** Array patches address indexes and `length`; compare the whole array instead. */
function targetPath(patch: Patch, root: unknown): (string | number)[] {
  const path = patch.path;
  const parent = path.slice(0, -1);
  if (Array.isArray(getIn(root, parent))) return parent;
  return path;
}

function refsFor(patches: Patch[], root: unknown): PathRef[] {
  const seen = new Set<string>();
  const out: PathRef[] = [];
  for (const patch of patches) {
    const path = targetPath(patch, root);
    const key = JSON.stringify(path);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ path, value: getIn(root, path) });
  }
  return out;
}

/** Keys that hold a value: a key set to `undefined` is the same as no key once saved and loaded. */
function definedKeys(o: object): string[] {
  return Object.keys(o).filter((k) => (o as Record<string, unknown>)[k] !== undefined);
}

/**
 * Structural equality for JSON-like values. Undo rebuilds arrays, and history
 * restored from storage holds copies, so identity alone would see conflicts that aren't there.
 */
export function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = definedKeys(a);
  const kb = definedKeys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.hasOwn(b, k) && sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/** A loose check that a stored value has the shape of a history entry. */
function isEntry(value: unknown): value is HistoryEntry {
  if (!value || typeof value !== 'object') return false;
  const e = value as Partial<HistoryEntry>;
  return (
    typeof e.id === 'string' &&
    typeof e.at === 'string' &&
    typeof e.label?.key === 'string' &&
    (e.source === 'teacher' || e.source === 'ai') &&
    Array.isArray(e.commands) &&
    Array.isArray(e.patches) &&
    Array.isArray(e.inverse) &&
    Array.isArray(e.refs) &&
    typeof e.undoable === 'boolean' &&
    typeof e.undone === 'boolean'
  );
}

function unchanged(refs: PathRef[], root: unknown): boolean {
  return refs.every((ref) => sameValue(getIn(root, ref.path), ref.value));
}

type Listener = () => void;

/**
 * Holds one course and changes it only through commands. Applying a command
 * records Immer patches, so undo, redo and history come for free.
 */
export class CourseStore {
  private state: Course;
  private entries: HistoryEntry[] = [];
  private redoStack: { entry: HistoryEntry; refs: PathRef[] }[] = [];
  private listeners = new Set<Listener>();

  /** `history` restores entries saved earlier for this course (see `exportHistory`). */
  constructor(course: Course, history: readonly unknown[] = []) {
    this.state = course;
    this.entries = CourseStore.restore(history);
  }

  private static restore(history: readonly unknown[]): HistoryEntry[] {
    return history.filter(isEntry).slice(-HISTORY_LIMIT).map((e) => ({ ...e }));
  }

  getState = (): Course => this.state;
  getHistory = (): readonly HistoryEntry[] => this.entries;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Replace the whole course (loading a file, or another tab's copy). Clears history, or restores the history saved with it. */
  reset(course: Course, history: readonly unknown[] = []): void {
    this.state = course;
    this.entries = CourseStore.restore(history);
    this.redoStack = [];
    this.emit();
  }

  /**
   * History as plain data, oldest first, for saving beside the course. Entries
   * are copied, so a later undo doesn't change what was exported. The redo
   * stack is not included: it lasts only as long as this session.
   */
  exportHistory(): HistoryEntry[] {
    return this.entries.map((e) => ({ ...e }));
  }

  /** Put back history saved with this course (the course itself is unchanged). Anything malformed is dropped. */
  importHistory(history: readonly unknown[]): void {
    this.entries = CourseStore.restore(history);
    this.redoStack = [];
  }

  apply(commands: Command[], options: ApplyOptions): HistoryEntry | null {
    if (commands.length === 0) return null;
    const at = new Date().toISOString();
    const [next, patches, inverse] = produceWithPatches(this.state, (draft) => {
      for (const command of commands) applyCommand(draft, command, at);
    });
    if (patches.length === 0) return null;
    const entry: HistoryEntry = {
      id: newId('x'),
      label: options.label,
      source: options.source,
      at,
      commands,
      patches,
      inverse,
      refs: refsFor(patches, next),
      undoable: options.undoable !== false,
      undone: false,
    };
    this.commit(next);
    if (!options.silent) {
      this.entries.push(entry);
      if (this.entries.length > HISTORY_LIMIT) this.entries.splice(0, this.entries.length - HISTORY_LIMIT);
      this.redoStack = [];
    }
    this.emit();
    return entry;
  }

  /** Could this entry be undone right now without clobbering later changes? */
  canUndoEntry(entryId: string): boolean {
    const entry = this.entries.find((e) => e.id === entryId);
    return Boolean(entry && !entry.undone && unchanged(entry.refs, this.state));
  }

  /** Undo one entry (the latest undoable one if no ID is given). */
  undo(entryId?: string): UndoResult {
    const entry = entryId
      ? this.entries.find((e) => e.id === entryId && !e.undone)
      : [...this.entries].reverse().find((e) => e.undoable && !e.undone);
    if (!entry) return { ok: false, reason: 'nothing' };
    if (!unchanged(entry.refs, this.state)) return { ok: false, reason: 'conflict' };
    const next = applyPatches(this.state, entry.inverse);
    entry.undone = true;
    this.commit(next);
    this.redoStack.push({ entry, refs: refsFor(entry.inverse, next) });
    this.emit();
    return { ok: true };
  }

  /**
   * Take back the latest entry as though it never happened, leaving no trace
   * in history: an item that was added and then left blank. Refuses (false)
   * if it is no longer the latest entry or later changes touched it.
   */
  discard(entryId: string): boolean {
    const entry = this.entries.at(-1);
    if (!entry || entry.id !== entryId || entry.undone || !unchanged(entry.refs, this.state)) return false;
    this.entries.pop();
    this.redoStack = [];
    this.commit(applyPatches(this.state, entry.inverse));
    this.emit();
    return true;
  }

  redo(): UndoResult {
    const top = this.redoStack.at(-1);
    if (!top) return { ok: false, reason: 'nothing' };
    if (!unchanged(top.refs, this.state)) return { ok: false, reason: 'conflict' };
    this.redoStack.pop();
    const next = applyPatches(this.state, top.entry.patches);
    top.entry.undone = false;
    top.entry.refs = refsFor(top.entry.patches, next);
    this.commit(next);
    this.emit();
    return { ok: true };
  }

  canUndo(): boolean {
    return this.entries.some((e) => e.undoable && !e.undone);
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Revision and timestamp change outside the recorded patches so they never cause conflicts. */
  private commit(next: Course): void {
    this.state = { ...next, revision: next.revision + 1, updatedAt: new Date().toISOString() };
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
