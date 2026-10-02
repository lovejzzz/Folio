import { runTextAction, type TextAction } from '@folio/ai';
import { Button, cx } from '@folio/ui';
import { Sparkles, X } from 'lucide-react';
import { useRouterState } from '@tanstack/react-router';
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { useT } from '../../i18n';
import { currentInference, errorMessage } from '../../state/model';
import { useCourse } from '../../state/session';
import { toast } from '../../state/toasts';
import { useUi } from '../../state/ui';
import { editableFor, selectionOffsets, type EditableHandle } from '../editing/registry';

interface Target {
  handle: EditableHandle;
  el: HTMLElement;
  start: number;
  end: number;
  text: string;
  /** The selection's box relative to its field, so the bar can follow the field as the page scrolls. */
  offset: { top: number; bottom: number; centre: number };
}

type Phase = { kind: 'idle' } | { kind: 'working' } | { kind: 'suggesting'; base: string; next: string } | { kind: 'explaining'; text: string };

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
      const r = range.getBoundingClientRect();
      const box = found.el.getBoundingClientRect();
      setTarget({ handle: found.handle, el: found.el, start, end, text, offset: { top: r.top - box.top, bottom: r.bottom - box.top, centre: r.left + r.width / 2 - box.left } });
    };
    document.addEventListener('selectionchange', onChange);
    return () => document.removeEventListener('selectionchange', onChange);
  }, [frozen]);
  return [target, setTarget];
}

interface Position {
  top: number;
  left: number;
  hidden: boolean;
}

/** While a suggestion shows, the field is hidden and the proposal sits beside it: the bar follows the highlighted new text. */
function proposalRect(target: Target): DOMRect | null {
  if (target.el.getClientRects().length > 0) return null;
  return target.el.nextElementSibling?.querySelector('mark')?.getBoundingClientRect() ?? null;
}

function measure(target: Target, below: boolean): Position | null {
  if (!target.el.isConnected) return null;
  const proposal = proposalRect(target);
  const box = target.el.getBoundingClientRect();
  const top = proposal
    ? (below ? proposal.bottom + 12 : proposal.top - 48)
    : below ? box.top + target.offset.bottom + 12 : box.top + target.offset.top - 48;
  const centre = proposal ? proposal.left + proposal.width / 2 : box.left + target.offset.centre;
  const left = Math.min(window.innerWidth - 16, Math.max(16, centre));
  // Out of view (under the header or off screen): hide rather than float over other text.
  return { top, left, hidden: top < 56 || top > window.innerHeight - 24 };
}

/** Where the bar goes: re-measured on scroll and resize so it stays with its text. */
function usePosition(target: Target | null, below: boolean): Position | null {
  const [pos, setPos] = useState<Position | null>(null);
  useLayoutEffect(() => {
    if (!target) return;
    const update = () => setPos(measure(target, below));
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [target, below]);
  return target ? pos : null;
}

/** Leaving the page, Esc, or clicking elsewhere puts the bar away. */
function useDismiss(active: boolean, explaining: boolean, bar: RefObject<HTMLDivElement | null>, close: () => void): void {
  const href = useRouterState({ select: (s) => s.location.href });
  const latest = useRef(close);
  useEffect(() => {
    latest.current = close;
  });
  const first = useRef(true);
  useEffect(() => {
    if (first.current) first.current = false;
    else latest.current();
  }, [href]);
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && latest.current();
    const onDown = (e: PointerEvent) => explaining && !bar.current?.contains(e.target as Node) && latest.current();
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [active, explaining, bar]);
}

function IdleBar({ onAct, chinese }: { onAct: (a: TextAction) => void; chinese: boolean }) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center gap-0.5 rounded-sheet bg-ink p-1 shadow-overlay">
      <Sparkles size={14} strokeWidth={1.75} className="mx-1.5 text-paper/70" aria-hidden />
      {ACTIONS.map((a) => (
        <button key={a} type="button" onClick={() => onAct(a)} className="rounded-control px-2.5 py-1.5 font-ui text-13 text-paper outline-none hover:bg-ink-2 focus-visible:ring-2 focus-visible:ring-paper">
          {a === 'translate' && chinese ? t.selection.toEnglish : t.selection[a]}
        </button>
      ))}
    </div>
  );
}

function PhaseView({ phase, chinese, onAct, onAccept, onClose }: { phase: Phase; chinese: boolean; onAct: (a: TextAction) => void; onAccept: (next: string) => void; onClose: () => void }) {
  const t = useT();
  switch (phase.kind) {
    case 'idle':
      return <IdleBar onAct={onAct} chinese={chinese} />;
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
  const bar = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [target, setTarget] = useSelectionTarget(phase.kind !== 'idle');
  const finish = () => {
    target?.handle.suggest(null);
    setPhase({ kind: 'idle' });
    setTarget(null);
  };
  useDismiss(target !== null, phase.kind === 'explaining', bar, finish);
  const pos = usePosition(target, phase.kind === 'suggesting' || phase.kind === 'explaining');
  if (!target || !pos) return null;
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
      setPhase({ kind: 'suggesting', base: value, next: value.slice(0, target.start) + result + value.slice(target.end) });
    } catch (error) {
      toast({ message: errorMessage(error), tone: 'critical' });
      finish();
    }
  };
  const accept = (base: string, next: string) => {
    // Only into the text it was made for: if the field changed meanwhile, drop it.
    if (target.el.isConnected && target.handle.get().value === base) target.handle.commit(next);
    else toast({ message: t.selection.stale, tone: 'attention' });
    finish();
  };
  return (
    <div
      ref={bar}
      role="toolbar"
      aria-label={t.selection.toolbar}
      className={cx('no-print fixed z-40 -translate-x-1/2 animate-pop-in', pos.hidden && 'invisible')}
      style={{ top: pos.top, left: pos.left }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <PhaseView phase={phase} chinese={(target.handle.get().lang === 'zh-CN' ? 'zh-CN' : course.language) === 'zh-CN'} onAct={(a) => void act(a)} onAccept={(next) => phase.kind === 'suggesting' && accept(phase.base, next)} onClose={finish} />
    </div>
  );
}
