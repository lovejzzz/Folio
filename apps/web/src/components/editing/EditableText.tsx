import { hasMarks, storedOffset } from '@folio/core';
import { Highlight, cx } from '@folio/ui';
import { createElement, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { drawInlineText } from '../InlineText';
import { normalisePaste } from './pasteText';
import { registerEditable, type Suggestion } from './registry';

type Tag = 'h1' | 'h2' | 'h3' | 'h4' | 'p' | 'span' | 'div' | 'li' | 'td';

export interface EditableTextProps {
  value: string;
  onCommit: (next: string) => void;
  /** Accessible name, e.g. "Title of lesson 2". */
  label: string;
  as?: Tag;
  multiline?: boolean;
  placeholder?: string;
  className?: string;
  lang?: string;
  /** A sentence of surrounding context for AI actions on a selection. */
  context?: string;
  readOnly?: boolean;
  /** Titles and the like can't be emptied: clearing one puts the old text back. */
  required?: boolean;
  /** Put the caret here when the field appears: the first field of something just added. */
  autoFocus?: boolean;
}

function readText(el: HTMLElement): string {
  return (el.innerText ?? el.textContent ?? '').replace(/\u00a0/g, ' ').replace(/\n$/, '');
}

/**
 * Type pasted text in as the browser's own edits, so ⌘Z inside the field still
 * works. Line breaks go in as line breaks: inserting "\n" as text makes
 * Chrome wrap lines in blocks, and reading those back adds a newline.
 */
function insertPlainText(text: string): void {
  text.split('\n').forEach((line, i) => {
    if (i > 0) document.execCommand('insertLineBreak');
    if (line) document.execCommand('insertText', false, line);
  });
}

/** How far into the field's text, as shown, a point or the selection falls. */
function shownOffset(el: HTMLElement, node: Node, offset: number): number {
  const before = document.createRange();
  before.selectNodeContents(el);
  before.setEnd(node, offset);
  return before.toString().length;
}

/**
 * At rest a field shows its code as code; while it is edited the backticks show,
 * so what is typed is what is stored. The caret keeps its letter across the swap.
 */
function revealMarks(el: HTMLElement, value: string, shown: number | null): void {
  if (!hasMarks(value) || readText(el) === value) return;
  el.textContent = value;
  const text = el.firstChild;
  const sel = window.getSelection();
  if (shown === null || !text || !sel) return;
  sel.collapse(text, Math.min(storedOffset(value, shown), text.textContent?.length ?? 0));
}

/** A click places the caret against the text as shown, so it is read before the marks appear and move the letters. */
function caretAtPoint(el: HTMLElement, x: number, y: number): number | null {
  const doc = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
  const pos = doc.caretPositionFromPoint?.(x, y);
  if (pos && el.contains(pos.offsetNode)) return shownOffset(el, pos.offsetNode, pos.offset);
  const range = document.caretRangeFromPoint?.(x, y);
  if (range && el.contains(range.startContainer)) return shownOffset(el, range.startContainer, range.startOffset);
  return null;
}

const isHeading = (tag: Tag): boolean => tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4';

/** The original passage struck through, the proposal marker-highlighted beside it. */
function SuggestionView({ value, suggestion }: { value: string; suggestion: Suggestion }): ReactNode {
  return (
    <span aria-live="polite">
      {value.slice(0, suggestion.start)}
      <del className="text-ink-2 decoration-critical/60">{value.slice(suggestion.start, suggestion.end)}</del>{' '}
      <Highlight>{suggestion.text}</Highlight>
      {value.slice(suggestion.end)}
    </span>
  );
}

/** Keeps the DOM text in step with the course and registers the field for the selection toolbar. */
function useEditable(props: EditableTextProps) {
  const ref = useRef<HTMLElement>(null);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const latest = useRef({ value: props.value, onCommit: props.onCommit, context: props.context ?? '', lang: props.lang });
  useLayoutEffect(() => {
    latest.current = { value: props.value, onCommit: props.onCommit, context: props.context ?? '', lang: props.lang };
  });
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && document.activeElement !== el && (hasMarks(props.value) || readText(el) !== props.value)) drawInlineText(el, props.value);
  }, [props.value, suggestion]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return registerEditable(el, { get: () => latest.current, commit: (next) => latest.current.onCommit(next), suggest: setSuggestion });
  }, []);
  const autoFocus = useRef(props.autoFocus);
  useEffect(() => {
    if (autoFocus.current) ref.current?.focus();
  }, []);
  return { ref, suggestion };
}

function onKeyDown(e: KeyboardEvent<HTMLElement>, value: string, multiline: boolean): void {
  const el = e.currentTarget;
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    el.textContent = value;
    el.blur();
  } else if (e.key === 'Enter' && (!multiline || e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    el.blur();
  }
}

/**
 * The text is the control: it looks exactly like the document and becomes
 * editable in place. Changes commit as one command when focus leaves.
 */
export function EditableText(props: EditableTextProps) {
  const { value, onCommit, label, as = 'span', multiline = false, placeholder, className, lang, readOnly } = props;
  const { ref, suggestion } = useEditable(props);
  const heading = isHeading(as);
  const editable = createElement(heading ? 'span' : as, {
    ref,
    className: cx('folio-editable', !heading && className, suggestion && 'hidden'),
    contentEditable: readOnly ? undefined : 'plaintext-only',
    suppressContentEditableWarning: true,
    role: readOnly ? undefined : 'textbox',
    'aria-label': label,
    'aria-multiline': readOnly ? undefined : multiline,
    // Empty fields show their name, so they keep a shape to click on.
    'data-placeholder': placeholder ?? label,
    spellCheck: true,
    lang: heading ? undefined : lang,
    tabIndex: readOnly ? undefined : 0,
    onMouseDown: (e: React.MouseEvent<HTMLElement>) => {
      const el = e.currentTarget;
      if (readOnly || e.button !== 0 || document.activeElement === el || !hasMarks(value)) return;
      const at = caretAtPoint(el, e.clientX, e.clientY);
      e.preventDefault();
      // Marks first, so focusing finds them shown; then the caret, which focusing would move.
      el.textContent = value;
      el.focus();
      const text = el.firstChild;
      if (at !== null && text) window.getSelection()?.collapse(text, Math.min(storedOffset(value, at), value.length));
    },
    onFocus: (e: React.FocusEvent<HTMLElement>) => {
      const el = e.currentTarget;
      const sel = window.getSelection();
      revealMarks(el, value, sel?.rangeCount && el.contains(sel.focusNode) ? shownOffset(el, sel.focusNode!, sel.focusOffset) : null);
    },
    onBlur: (e: React.FocusEvent<HTMLElement>) => {
      const el = e.currentTarget;
      const text = readText(el);
      const next = multiline ? text : text.replace(/\s*\n\s*/g, ' ');
      if (props.required && !next.trim()) drawInlineText(el, value);
      else {
        if (next !== value) onCommit(next);
        if (hasMarks(next)) drawInlineText(el, next);
      }
    },
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => onKeyDown(e, value, multiline),
    onPaste: (e: React.ClipboardEvent) => {
      e.preventDefault();
      insertPlainText(normalisePaste(e.clipboardData.getData('text/plain'), multiline));
    },
  });
  const proposal = suggestion ? <SuggestionView value={value} suggestion={suggestion} /> : null;
  /* Headings keep their semantics: the heading wraps an editable span. */
  if (heading) return createElement(as, { className, lang }, editable, proposal);
  if (!proposal) return editable;
  return (
    <>
      {editable}
      {createElement(as, { className, lang }, proposal)}
    </>
  );
}
