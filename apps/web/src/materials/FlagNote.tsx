import { cmd, type Flag, type GeneratedKind } from '@folio/core';
import { TextField } from '@folio/ui';
import { useState } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { flagLine, useT } from '../i18n';
import { edit } from '../state/edit';
import { fixNote, type FixOutcome } from '../state/fixNote';

const LINK = 'shrink-0 rounded-control px-1.5 font-medium underline underline-offset-2 outline-none data-hovered:no-underline data-disabled:opacity-60 data-focus-visible:ring-2 data-focus-visible:ring-accent';

/** One note: what is wrong, a way to have it put right where Folio can, and a way to say it is fine. */
function NoteRow({ flag, n, lessonId, fixable, onResolve }: { flag: Flag; n: number; lessonId: string; fixable: boolean; onResolve: () => void }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<FixOutcome | null>(null);
  const [answer, setAnswer] = useState('');
  const fix = async () => {
    setBusy(true);
    setOutcome(await fixNote(lessonId, n - 1, answer));
    setBusy(false);
  };
  const said = outcome?.status === 'asked' || outcome?.status === 'kept' ? outcome : null;
  return (
    <li className="grid gap-1.5">
      <div className="flex items-start gap-2">
        <span className="flex-1">{flagLine(flag, t)}</span>
        {fixable && (
          <AriaButton aria-label={t.changes.fixOne(n)} isDisabled={busy} onPress={() => void fix()} className={LINK}>
            {busy ? t.changes.fixing : t.changes.fix}
          </AriaButton>
        )}
        <AriaButton aria-label={t.changes.resolveOne(n)} isDisabled={busy} onPress={onResolve} className={LINK}>
          {t.changes.resolve}
        </AriaButton>
      </div>
      {said && (
        <div role="status" className="grid gap-1.5 rounded-control bg-paper px-2.5 py-2 text-ink">
          <p>
            <span className="font-semibold">{said.status === 'asked' ? t.changes.fixAsked : t.changes.fixKept}</span> {said.why}
          </p>
          {said.status === 'asked' && <TextField label={t.changes.fixAnswer} labelHidden placeholder={t.changes.fixAnswer} value={answer} onChange={setAnswer} onKeyDown={(e) => void (e.key === 'Enter' && answer.trim() && fix())} />}
        </div>
      )}
    </li>
  );
}

/**
 * "Needs a look": what is wrong, in plain sentences, each with its own way to clear it. Several notes used to
 * stand as one paragraph with one button, and settling the first took the others with it unread.
 */
export function FlagNote({ flags, lessonId, kind, itemId }: { flags: Flag[]; lessonId: string; kind: GeneratedKind; itemId: string | null }) {
  const t = useT();
  const resolve = (index?: number) => edit([cmd('review.resolve', { lessonId, kind, itemId, index })], { key: 'resolved' });
  return (
    <div role="note" className="no-print mb-3 flex items-start gap-2.5 rounded-control bg-attention-tint px-3 py-2 font-ui text-13 leading-5 text-attention">
      <span aria-hidden className="mt-1.5 size-2 shrink-0 rotate-45 bg-attention" />
      <div className="flex-1">
        <p className="font-semibold">
          {flags.length > 1 ? t.changes.attentionCount(flags.length) : t.changes.attention}
          {t.common.period}
        </p>
        <ul className="mt-1 grid gap-2">
          {flags.map((flag, i) => (
            // Keyed by its words: settling one note must not hand its answer box to the next.
            <NoteRow key={`${flagLine(flag, t)}:${i}`} flag={flag} n={i + 1} lessonId={lessonId} fixable={kind === 'plan' && itemId === null && flag.code === 'reviewNote'} onResolve={() => resolve(flags.length > 1 ? i : undefined)} />
          ))}
        </ul>
      </div>
    </div>
  );
}
