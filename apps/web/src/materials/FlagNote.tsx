import { cmd, type Flag, type GeneratedKind } from '@folio/core';
import { Button as AriaButton } from 'react-aria-components';
import { flagText, useT } from '../i18n';
import { edit } from '../state/edit';

/** "Needs a look": what is wrong, in plain sentences, and one way to clear it. */
export function FlagNote({ flags, lessonId, kind, itemId }: { flags: Flag[]; lessonId: string; kind: GeneratedKind; itemId: string | null }) {
  const t = useT();
  return (
    <div role="note" className="no-print mb-3 flex items-start gap-2.5 rounded-control bg-attention-tint px-3 py-2 font-ui text-13 leading-5 text-attention">
      <span aria-hidden className="mt-1.5 size-2 shrink-0 rotate-45 bg-attention" />
      <p className="flex-1">
        <span className="font-semibold">
          {t.changes.attention}
          {t.common.period}
        </span>
        {flagText(flags, t)}
      </p>
      <AriaButton
        onPress={() => edit([cmd('review.resolve', { lessonId, kind, itemId })], { key: 'resolved' })}
        className="shrink-0 rounded-control px-1.5 font-medium underline underline-offset-2 outline-none data-hovered:no-underline data-focus-visible:ring-2 data-focus-visible:ring-accent"
      >
        {t.changes.resolve}
      </AriaButton>
    </div>
  );
}
