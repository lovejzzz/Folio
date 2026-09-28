import { generateSection } from '@folio/ai';
import { cmd, lessonNumber, staleReasons, type Command, type GeneratedKind } from '@folio/core';
import { create } from 'zustand';
import { canReach, currentInference, currentReviewer, errorMessage } from './model';
import { activeStore } from './session';
import { toast } from './toasts';
import { useUi } from './ui';

/**
 * Updating out-of-date content. If the teacher never touched it, the update
 * applies (with undo). If they did, the update waits as a proposal beside
 * their version: regenerating never overwrites what a teacher wrote.
 */

export interface Pending {
  status: 'working' | 'ready';
  commands: Command[];
  basisRevision: number;
}

interface ProposalState {
  pending: Record<string, Pending>;
}

export const useProposals = create<ProposalState>(() => ({ pending: {} }));

const key = (lessonId: string, kind: GeneratedKind) => `${lessonId}:${kind}`;

function setPending(k: string, value: Pending | null): void {
  const next = { ...useProposals.getState().pending };
  if (value) next[k] = value;
  else delete next[k];
  useProposals.setState({ pending: next });
}

export async function updateSection(lessonId: string, kind: GeneratedKind): Promise<void> {
  const store = activeStore();
  if (!store) return;
  const inference = currentInference();
  if (!inference) {
    useUi.getState().requireModel(() => void updateSection(lessonId, kind));
    return;
  }
  if (!canReach(inference)) return;
  const k = key(lessonId, kind);
  const course = store.getState();
  const edited = course.lessons[lessonId]?.gen[kind]?.edited ?? false;
  setPending(k, { status: 'working', commands: [], basisRevision: course.revision });
  try {
    const reviewer = kind === 'plan' ? (currentReviewer() ?? undefined) : undefined;
    const result = await generateSection(inference, course, lessonId, kind, undefined, { reviewer });
    if (edited) {
      setPending(k, { status: 'ready', commands: result.commands, basisRevision: course.revision });
      useUi.getState().openDrawer('changes');
    } else {
      setPending(k, null);
      applyUpdate(lessonId, kind, result.commands);
    }
  } catch (error) {
    setPending(k, null);
    toast({ message: errorMessage(error), tone: 'critical' });
  }
}

function applyUpdate(lessonId: string, kind: GeneratedKind, commands: Command[]): void {
  const store = activeStore();
  if (!store) return;
  const n = lessonNumber(store.getState(), lessonId);
  store.apply(commands, { label: { key: 'updated', values: { kind, n } }, source: 'ai' });
}

/**
 * Update several sections at once. The lesson plan goes first: the slides, the
 * quiz and the rest are built on it, and updated alongside it they came back
 * out of date at once, built on the plan it replaced.
 */
export async function updateSections(items: { lessonId: string; kind: GeneratedKind }[]): Promise<void> {
  const course = activeStore()?.getState();
  if (!course) return;
  // Settle the model once for the batch: asking per item kept only the last request, and a
  // section marked "Updating…" ahead of its turn stayed marked when the batch never ran.
  const inference = currentInference();
  if (!inference) {
    useUi.getState().requireModel(() => void updateSections(items));
    return;
  }
  if (!canReach(inference)) return;
  const [first, rest] = [items.filter((i) => i.kind === 'plan'), items.filter((i) => i.kind !== 'plan')];
  const waiting = first.length ? rest : [];
  for (const i of waiting) setPending(key(i.lessonId, i.kind), { status: 'working', commands: [], basisRevision: course.revision });
  await Promise.all(first.map((i) => updateSection(i.lessonId, i.kind)));
  // A plan that failed to update is still out of date: the rest would be written on the plan it was meant to replace.
  const after = activeStore()?.getState();
  const planFailed = first.some((i) => {
    const lesson = after?.lessons[i.lessonId];
    return !after || !lesson || staleReasons(after, lesson, 'plan').length > 0;
  });
  if (planFailed) {
    for (const i of waiting) setPending(key(i.lessonId, i.kind), null);
    return;
  }
  await Promise.all(rest.map((i) => updateSection(i.lessonId, i.kind)));
}

export function acceptProposal(lessonId: string, kind: GeneratedKind): void {
  const p = useProposals.getState().pending[key(lessonId, kind)];
  if (!p || p.status !== 'ready') return;
  setPending(key(lessonId, kind), null);
  applyUpdate(lessonId, kind, p.commands);
}

export function rejectProposal(lessonId: string, kind: GeneratedKind): void {
  setPending(key(lessonId, kind), null);
}

export function keepMine(lessonId: string, kind: GeneratedKind): void {
  const store = activeStore();
  if (!store) return;
  setPending(key(lessonId, kind), null);
  const n = lessonNumber(store.getState(), lessonId);
  store.apply([cmd('review.keep', { lessonId, kind })], { label: { key: 'kept', values: { kind, n } }, source: 'teacher' });
}

export function pendingFor(lessonId: string, kind: GeneratedKind): Pending | undefined {
  return useProposals.getState().pending[key(lessonId, kind)];
}

/** Keep several sections of one lesson as they are, as one change. */
export function keepAll(items: { lessonId: string; kind: GeneratedKind }[]): void {
  const store = activeStore();
  const first = items[0];
  if (!store || !first) return;
  if (items.length === 1) return keepMine(first.lessonId, first.kind);
  for (const i of items) setPending(key(i.lessonId, i.kind), null);
  const n = lessonNumber(store.getState(), first.lessonId);
  store.apply(
    items.map((i) => cmd('review.keep', { lessonId: i.lessonId, kind: i.kind })),
    { label: { key: 'keptAll', values: { n, count: items.length } }, source: 'teacher' },
  );
}
