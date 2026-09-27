import { generateSection } from '@folio/ai';
import { cmd, lessonNumber, type Command, type GeneratedKind } from '@folio/core';
import { create } from 'zustand';
import { canReach, currentInference, errorMessage } from './model';
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
    const result = await generateSection(inference, course, lessonId, kind);
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
