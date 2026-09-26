import type { Command, Label } from '@folio/core';
import { currentMessages } from '../i18n';
import { activeStore } from './session';
import { toast } from './toasts';

/** Apply a teacher edit to the open course, as one undoable history entry. */
export function edit(commands: Command[], label: Label): void {
  activeStore()?.apply(commands, { label, source: 'teacher' });
}

export function undo(entryId?: string): void {
  const store = activeStore();
  if (!store) return;
  const t = currentMessages();
  const result = store.undo(entryId);
  if (result.ok) toast({ message: t.toast.undone, duration: 2500 });
  else if (result.reason === 'conflict') toast({ message: t.changes.cantUndo, tone: 'attention' });
  else toast({ message: t.toast.nothingToUndo, duration: 2500 });
}

export function redo(): void {
  const store = activeStore();
  if (!store) return;
  const result = store.redo();
  const t = currentMessages();
  if (result.ok) toast({ message: t.toast.redone, duration: 2500 });
  else if (result.reason === 'conflict') toast({ message: t.changes.cantUndo, tone: 'attention' });
}
