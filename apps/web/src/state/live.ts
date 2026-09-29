import type { GeneratedKind } from '@folio/core';
import { create } from 'zustand';

/**
 * A course being written, as it happens: each section's answer so far, and a
 * short account of what is being written and what has just been finished.
 * Nothing here is saved; the course itself is only ever changed by commands.
 */

export type LiveStage = 'writing' | 'checking' | 'done' | 'failed';

/** One section in the account: updated in place as it goes, never appended again. */
export interface LiveRow {
  key: string;
  lessonId: string;
  kind: GeneratedKind;
  stage: LiveStage;
  /** Why each fix the plan's review made was needed. */
  fixes: string[];
  /** Problems the review left for the teacher. */
  notes: number;
  /** The plan's review has come back. */
  checked: boolean;
  started: number;
  ended: number;
}

interface LiveState {
  /** Each section's answer so far, keyed `${lessonId}:${kind}`, while it is written. */
  partial: Record<string, unknown>;
  rows: Record<string, LiveRow>;
  /** Sections seen taking shape: they settle where they are rather than fade in. */
  streamed: Record<string, true>;
}

export const useLive = create<LiveState>(() => ({ partial: {}, rows: {}, streamed: {} }));

// An answer streams in a few words at a time; the map redraws at most once a frame, whatever arrives.
let pending: Record<string, unknown> = {};
let frame: number | null = null;

function flush(): void {
  frame = null;
  const keys = Object.keys(pending);
  if (!keys.length) return;
  const { partial, streamed } = useLive.getState();
  useLive.setState({ partial: { ...partial, ...pending }, streamed: { ...streamed, ...Object.fromEntries(keys.map((k) => [k, true as const])) } });
  pending = {};
}

const nextFrame = (run: () => void): number => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(run) : (setTimeout(run, 16) as unknown as number));

export function showPartial(key: string, value: unknown): void {
  pending[key] = value;
  frame ??= nextFrame(flush);
}

function setRow(key: string, patch: Partial<LiveRow>): void {
  const { rows } = useLive.getState();
  const row = rows[key];
  if (row) useLive.setState({ rows: { ...rows, [key]: { ...row, ...patch } } });
}

export function startRow(lessonId: string, kind: GeneratedKind): void {
  const key = `${lessonId}:${kind}`;
  const row: LiveRow = { key, lessonId, kind, stage: 'writing', fixes: [], notes: 0, checked: false, started: performance.now(), ended: 0 };
  useLive.setState({ rows: { ...useLive.getState().rows, [key]: row } });
}

export const checkingRow = (key: string): void => setRow(key, { stage: 'checking' });
export const reviewedRow = (key: string, fixes: string[], notes: number): void => setRow(key, { fixes, notes, checked: true });

/** The section is saved, or given up on: its answer so far is no longer needed. */
export function endRow(key: string, stage: 'done' | 'failed'): void {
  delete pending[key];
  const { partial } = useLive.getState();
  const rest = { ...partial };
  delete rest[key];
  useLive.setState({ partial: rest });
  setRow(key, { stage, ended: performance.now() });
}

/** A new run starts with a clean account. */
export function resetLive(): void {
  pending = {};
  useLive.setState({ partial: {}, rows: {}, streamed: {} });
}

/** What is being written, in the order it began, so rows stay put while others come and go. */
export function workingRows(rows: Record<string, LiveRow>): LiveRow[] {
  return Object.values(rows)
    .filter((r) => r.stage === 'writing' || r.stage === 'checking')
    .sort((a, b) => a.started - b.started);
}

/** What was finished last, latest first. */
export function finishedRows(rows: Record<string, LiveRow>, limit: number): LiveRow[] {
  return Object.values(rows)
    .filter((r) => r.stage === 'done' || r.stage === 'failed')
    .sort((a, b) => b.ended - a.ended)
    .slice(0, limit);
}
