import { textRuns } from '@folio/core';
import type { ReactNode } from 'react';

/** Course text as it reads: runs marked `like this` set as code, everything else as is. */
export function InlineText({ text }: { text: string }): ReactNode {
  const runs = textRuns(text);
  if (runs.length === 1 && !runs[0]!.code) return text;
  return runs.map((r, i) =>
    r.code ? (
      <code key={i} className="folio-code">
        {r.text}
      </code>
    ) : (
      r.text
    ),
  );
}

/** The same, drawn into a DOM node that React doesn't manage (an editable field at rest). */
export function drawInlineText(el: HTMLElement, text: string): void {
  const runs = textRuns(text);
  if (runs.length === 1 && !runs[0]!.code) {
    el.textContent = text;
    return;
  }
  el.replaceChildren(
    ...runs.map((r) => {
      if (!r.code) return document.createTextNode(r.text);
      const code = document.createElement('code');
      code.className = 'folio-code';
      code.textContent = r.text;
      return code;
    }),
  );
}
