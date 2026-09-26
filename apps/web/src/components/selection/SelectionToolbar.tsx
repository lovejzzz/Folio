import { runTextAction, type TextAction } from '@folio/ai';
import { Button } from '@folio/ui';
import { Sparkles, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useT } from '../../i18n';
import { currentInference, errorMessage } from '../../state/model';
import { useCourse } from '../../state/session';
import { toast } from '../../state/toasts';
import { useUi } from '../../state/ui';
import { editableFor, selectionOffsets, type EditableHandle } from '../editing/registry';

interface Target {
  handle: EditableHandle;
  start: number;
  end: number;
  text: string;
  rect: DOMRect;
}

type Phase = { kind: 'idle' } | { kind: 'working' } | { kind: 'suggesting'; next: string } | { kind: 'explaining'; text: string };

const ACTIONS: TextAction[] = ['rewrite', 'simplify', 'harder', 'easier', 'translate', 'explain'];

function useSelectionTarget(frozen: boolean): [Target | null, (t: Target | null) => void] {
  const [target, setTarget] = useState<Target | null>(null);
  useEffect(() => {
    if (frozen) return;
    const onChange = () => {
      const sel = document.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return setTarget(null);
      const range = sel.getRangeAt(0);
      const found = editableFor(range.commonAncestorContainer);
      const text = range.toString();
      if (!found || text.trim().length < 2) return setTarget(null);
      const { start, end } = selectionOffsets(found.el, range);
      setTarget({ handle: found.handle, start, end, text, rect: range.getBoundingClientRect() });
    };
    document.addEventListener('selectionchange', onChange);
    return () => document.removeEventListener('selectionchange', onChange);
  }, [frozen]);
  return [target, setTarget];
}

function IdleBar({ onAct }: { onAct: (a: TextAction) => void }) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center gap-0.5 rounded-sheet bg-ink p-1 shadow-overlay">
      <Sparkles size={14} strokeWidth={1.75} className="mx-1.5 text-paper/70" aria-hidden />
      {ACTIONS.map((a) => (
        <button key={a} type="button" onClick={() => onAct(a)} className="rounded-control px-2.5 py-1.5 font-ui text-13 text-paper outline-none hover:bg-ink-2 focus-visible:ring-2 focus-visible:ring-paper">
          {t.selection[a]}
        </button>
      ))}
    </div>
  );
}

function PhaseView({ phase, onAct, onAccept, onClose }: { phase: Phase; onAct: (a: TextAction) => void; onAccept: (next: string) => void; onClose: () => void }) {
  const t = useT();
  switch (phase.kind) {
    case 'idle':
      return <IdleBar onAct={onAct} />;
    case 'working':
      return <p className="rounded-sheet bg-ink px-4 py-2 font-ui text-13 text-paper shadow-overlay" aria-live="polite">{t.selection.working}</p>;
    case 'suggesting':
      return (
        <div className="flex items-center gap-2 rounded-sheet border border-rule bg-paper p-1.5 pl-3 shadow-overlay" aria-live="polite">
          <span className="font-ui text-13 text-ink-2">{t.selection.suggestion}</span>
          <Button size="sm" variant="quiet" onPress={onClose}>
            {t.common.reject}
          </Button>
          <Button size="sm" variant="primary" onPress={() => onAccept(phase.next)}>
            {t.common.accept}
          </Button>
        </div>
      );
    case 'explaining':
      return (
        <div className="w-80 rounded-sheet border border-rule bg-paper p-4 shadow-overlay sm:w-96" aria-live="polite">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-ui text-12 font-semibold text-ink-2">{t.selection.explanation}</span>
            <button type="button" aria-label={t.common.close} onClick={onClose} className="rounded-control p-1 text-ink-2 outline-none hover:bg-well focus-visible:ring-2 focus-visible:ring-accent">
              <X size={14} strokeWidth={1.5} />
            </button>
          </div>
          <p className="font-reading text-16 leading-7 text-ink">{phase.text}</p>
        </div>
      );
  }
}

/** Select text on a sheet, then act on it. Results appear inline, highlighted, to accept or reject. */
export function SelectionToolbar() {
  const t = useT();
  const course = useCourse();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [target, setTarget] = useSelectionTarget(phase.kind !== 'idle');
  if (!target) return null;
  const finish = () => {
    target.handle.suggest(null);
    setPhase({ kind: 'idle' });
    setTarget(null);
  };
  const act = async (action: TextAction): Promise<void> => {
    const inference = currentInference();
    if (!inference) return useUi.getState().requireModel(() => void act(action));
    setPhase({ kind: 'working' });
    try {
      const { value, context, lang } = target.handle.get();
      const language = lang === 'zh-CN' ? 'zh-CN' : course.language;
      const result = await runTextAction(inference, { action, selection: target.text, context: `${course.title}. ${context || value}`, language });
      if (action === 'explain') return setPhase({ kind: 'explaining', text: result });
      target.handle.suggest({ start: target.start, end: target.end, text: result });
      setPhase({ kind: 'suggesting', next: value.slice(0, target.start) + result + value.slice(target.end) });
    } catch (error) {
      toast({ message: errorMessage(error), tone: 'critical' });
      finish();
    }
  };
  const below = phase.kind === 'suggesting' || phase.kind === 'explaining';
  const left = Math.min(window.innerWidth - 16, Math.max(16, target.rect.left + target.rect.width / 2));
  return (
    <div
      role="toolbar"
      aria-label={t.selection.toolbar}
      className="no-print fixed z-40 -translate-x-1/2 animate-pop-in"
      style={{ top: below ? target.rect.bottom + 12 : Math.max(64, target.rect.top - 48), left }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <PhaseView phase={phase} onAct={(a) => void act(a)} onAccept={(next) => { target.handle.commit(next); finish(); }} onClose={finish} />
    </div>
  );
}
