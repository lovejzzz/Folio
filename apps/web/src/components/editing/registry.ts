/**
 * Editable fields register themselves so the selection toolbar can act on
 * whatever text the teacher selects, without knowing where it lives.
 */

export interface Suggestion {
  start: number;
  end: number;
  text: string;
}

export interface EditableHandle {
  get: () => { value: string; context: string; lang?: string };
  commit: (next: string) => void;
  suggest: (s: Suggestion | null) => void;
}

const handles = new WeakMap<HTMLElement, EditableHandle>();

export function registerEditable(el: HTMLElement, handle: EditableHandle): () => void {
  handles.set(el, handle);
  return () => handles.delete(el);
}

/** The editable field containing a DOM node, if any. */
export function editableFor(node: Node | null): { el: HTMLElement; handle: EditableHandle } | null {
  let cur: Node | null = node;
  while (cur) {
    if (cur instanceof HTMLElement) {
      const handle = handles.get(cur);
      if (handle) return { el: cur, handle };
    }
    cur = cur.parentNode;
  }
  return null;
}

/** Character offsets of the current selection inside an element's text. */
export function selectionOffsets(el: HTMLElement, range: Range): { start: number; end: number } {
  const pre = document.createRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.startContainer, range.startOffset);
  const start = pre.toString().length;
  return { start, end: start + range.toString().length };
}
