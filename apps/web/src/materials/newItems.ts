import type { Command, Course, Label } from '@folio/core';
import type { FocusEvent } from 'react';
import { flushSync } from 'react-dom';
import { edit } from '../state/edit';
import { activeStore } from '../state/session';

/**
 * Add buttons add an empty item and put the caret in it; nothing is written
 * as placeholder content. An added item that is still completely blank when
 * focus leaves it is taken out again. If adding it is still the latest
 * change, it goes without a trace in history.
 */

/** Items added in this session and not yet written in, with the history entry that added each. */
const fresh = new Map<string, string | null>();

/** The course as it is now, after any commit made by the blur that is being handled. */
export function latestCourse(): Course | null {
  return activeStore()?.getState() ?? null;
}

/**
 * Add an item, then put the caret in the first field of the element marked `data-item={itemId}`. The item is
 * rendered before this returns, so the caret is in it before the next key press: waiting a frame for it lost the
 * first letters a quick typist entered straight after pressing Add.
 */
export function addItem(itemId: string, commands: Command[], label: Label): void {
  const entry = flushSync(() => edit(commands, label));
  fresh.set(itemId, entry?.id ?? null);
  if (!focusField(itemId)) focusItem(itemId);
}

function focusField(itemId: string): boolean {
  const field = document.querySelector<HTMLElement>(`[data-item="${CSS.escape(itemId)}"] [contenteditable]`);
  field?.focus();
  return Boolean(field);
}

/** Put the caret in an item's first field once it is on the page. */
export function focusItem(itemId: string, tries = 20): void {
  requestAnimationFrame(() => {
    if (!focusField(itemId) && tries > 0) focusItem(itemId, tries - 1);
  });
}

/** Whether focus has really left `container` (not just moved inside it, or to another window). */
function leftFor(e: FocusEvent<HTMLElement>): boolean {
  if (e.currentTarget.contains(e.relatedTarget as Node | null)) return false;
  return document.hasFocus();
}

/**
 * onBlur for the element that holds one added item. `isBlank` and `remove`
 * read the latest course: the field that just lost focus has committed by then.
 */
export function leaveBlank(itemId: string, isBlank: (course: Course) => boolean, remove: (course: Course) => Command[], label: Label) {
  return (e: FocusEvent<HTMLElement>) => {
    if (!fresh.has(itemId) || !leftFor(e)) return;
    const course = latestCourse();
    const entryId = fresh.get(itemId);
    fresh.delete(itemId);
    if (!course || !isBlank(course)) return;
    if (entryId && activeStore()?.discard(entryId)) return;
    edit(remove(course), label);
  };
}
