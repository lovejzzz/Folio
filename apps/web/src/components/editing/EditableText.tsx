import { Highlight, cx } from '@folio/ui';
import { createElement, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { registerEditable, type Suggestion } from './registry';

export interface EditableTextProps {
  value: string;
  onCommit: (next: string) => void;
  /** Accessible name, e.g. "Title of lesson 2". */
  label: string;
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'p' | 'span' | 'div' | 'li' | 'td';
  multiline?: boolean;
  placeholder?: string;
  className?: string;
  lang?: string;
  /** A sentence of surrounding context for AI actions on a selection. */
  context?: string;
  readOnly?: boolean;
}

function readText(el: HTMLElement): string {
  return (el.innerText ?? el.textContent ?? '').replace(/ /g, ' ').replace(/\n$/, '');
}

/**
 * The text is the control: it looks exactly like the document and becomes
 * editable in place. Changes commit as one command when focus leaves.
 */
export function EditableText({
  value,
  onCommit,
  label,
  as = 'span',
  multiline = false,
  placeholder,
  className,
  lang,
  context,
  readOnly,
}: EditableTextProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const latest = useRef({ value, onCommit, context: context ?? '', lang });
  useLayoutEffect(() => {
    latest.current = { value, onCommit, context: context ?? '', lang };
  });

  useLayoutEffect(() => {
    if (el && document.activeElement !== el && readText(el) !== value) el.textContent = value;
  }, [el, value]);

  useEffect(() => {
    if (!el) return;
    return registerEditable(el, {
      get: () => latest.current,
      commit: (next) => latest.current.onCommit(next),
      suggest: setSuggestion,
    });
  }, [el]);

  const attach = (node: HTMLElement | null) => {
    ref.current = node;
    setEl(node);
  };

  const commit = () => {
    const el = ref.current;
    if (!el) return;
    const next = multiline ? readText(el) : readText(el).replace(/\s*\n\s*/g, ' ');
    if (next !== value) onCommit(next);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (ref.current) ref.current.textContent = value;
      ref.current?.blur();
    } else if (e.key === 'Enter' && (!multiline || e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      ref.current?.blur();
    }
  };

  if (suggestion) {
    return createElement(
      as,
      { className: cx(className, 'folio-suggesting'), lang, 'aria-label': label },
      value.slice(0, suggestion.start),
      <del key="d" className="text-ink-2 decoration-critical/60">
        {value.slice(suggestion.start, suggestion.end)}
      </del>,
      ' ',
      <Highlight key="h">{suggestion.text}</Highlight>,
      value.slice(suggestion.end),
    );
  }

  return createElement(as, {
    ref: attach,
    className: cx('folio-editable', className),
    contentEditable: readOnly ? undefined : 'plaintext-only',
    suppressContentEditableWarning: true,
    role: readOnly ? undefined : 'textbox',
    'aria-label': label,
    'aria-multiline': readOnly ? undefined : multiline,
    'data-placeholder': placeholder,
    spellCheck: true,
    lang,
    tabIndex: readOnly ? undefined : 0,
    onBlur: commit,
    onKeyDown,
    onPaste: (e: React.ClipboardEvent) => {
      e.preventDefault();
      document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
    },
    children: undefined,
  });
}
