import { textRuns, type TextRun } from '@folio/core';
import type { ReactNode } from 'react';

const TAG = { code: 'code', sub: 'sub', sup: 'sup' } as const;
const tagOf = (r: TextRun) => (r.code ? TAG.code : r.script ? TAG[r.script] : null);
const CLASS = { code: 'folio-code', sub: 'folio-script', sup: 'folio-script' } as const;

/** Course text as it reads: runs marked `like this` set as code, β̂_educ and R^2 as sub- and superscripts. */
export function InlineText({ text }: { text: string }): ReactNode {
  const runs = textRuns(text);
  if (runs.length === 1 && !tagOf(runs[0]!)) return text;
  return runs.map((r, i) => {
    const Tag = tagOf(r);
    return Tag ? (
      <Tag key={i} className={CLASS[Tag]}>
        {r.text}
      </Tag>
    ) : (
      r.text
    );
  });
}

/** The same, drawn into a DOM node that React doesn't manage (an editable field at rest). */
export function drawInlineText(el: HTMLElement, text: string): void {
  const runs = textRuns(text);
  if (runs.length === 1 && !tagOf(runs[0]!)) {
    el.textContent = text;
    return;
  }
  el.replaceChildren(
    ...runs.map((r) => {
      const tag = tagOf(r);
      if (!tag) return document.createTextNode(r.text);
      const node = document.createElement(tag);
      node.className = CLASS[tag];
      node.textContent = r.text;
      return node;
    }),
  );
}
