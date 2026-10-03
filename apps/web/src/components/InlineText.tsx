import { textRuns, type TextRun } from '@folio/core';
import { cx } from '@folio/ui';
import type { ReactNode } from 'react';

/** Combining marks and the spacing forms drawn over a Greek letter. */
const SPACING: Record<string, string> = { '\u0302': 'ˆ', '\u0303': '˜', '\u0304': '¯', '\u0307': '˙', '\u0308': '¨' };

interface Shape {
  tag: 'code' | 'strong' | 'sub' | 'sup' | 'span';
  className: string;
  accent?: string;
}

/** The element a run is drawn in, and its class; a plain run is bare text. */
function shapeOf(r: TextRun): Shape | null {
  if (r.code) return { tag: 'code', className: 'folio-code' };
  if (r.bold) return { tag: 'strong', className: 'folio-label' };
  if (r.script) return { tag: r.script, className: cx('folio-script', r.math && 'folio-math') };
  if (r.accent) return { tag: 'span', className: cx('folio-math folio-accent', r.tall && 'folio-accent-tall'), accent: SPACING[r.accent] ?? '' };
  if (r.math) return { tag: 'span', className: 'folio-math' };
  return null;
}

/** Course text as it reads: code as code, β̂_educ and R² as sub- and superscripts, maths words in the reading face. */
export function InlineText({ text }: { text: string }): ReactNode {
  const runs = textRuns(text);
  if (runs.length === 1 && !shapeOf(runs[0]!)) return text;
  return runs.map((r, i) => {
    const shape = shapeOf(r);
    if (!shape) return r.text;
    const Tag = shape.tag;
    return (
      <Tag key={i} className={shape.className} data-accent={shape.accent}>
        {r.text}
      </Tag>
    );
  });
}

/** The same, drawn into a DOM node that React doesn't manage (an editable field at rest). */
export function drawInlineText(el: HTMLElement, text: string): void {
  const runs = textRuns(text);
  if (runs.length === 1 && !shapeOf(runs[0]!)) {
    el.textContent = text;
    return;
  }
  el.replaceChildren(
    ...runs.map((r) => {
      const shape = shapeOf(r);
      if (!shape) return document.createTextNode(r.text);
      const node = document.createElement(shape.tag);
      node.className = shape.className;
      if (shape.accent) node.dataset.accent = shape.accent;
      node.textContent = r.text;
      return node;
    }),
  );
}
