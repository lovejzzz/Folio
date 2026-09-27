import { Highlight, cx } from '@folio/ui';
import { createElement, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
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
}

function readText(el: HTMLElement): string {
  return (el.innerText ?? el.textContent ?? '').replace(/\u00a0/g, ' ').replace(/\n$/, '');
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
    if (el && document.activeElement !== el && readText(el) !== props.value) el.textContent = props.value;
  }, [props.value, suggestion]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return registerEditable(el, { get: () => latest.current, commit: (next) => latest.current.onCommit(next), suggest: setSuggestion });
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
    onBlur: (e: React.FocusEvent<HTMLElement>) => {
      const text = readText(e.currentTarget);
      const next = multiline ? text : text.replace(/\s*\n\s*/g, ' ');
      if (props.required && !next.trim()) e.currentTarget.textContent = value;
      else if (next !== value) onCommit(next);
    },
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => onKeyDown(e, value, multiline),
    onPaste: (e: React.ClipboardEvent) => {
      e.preventDefault();
      document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
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
