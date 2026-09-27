import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useT } from '../../i18n';

interface Overflow {
  /** Width of the sticky lesson column, which covers columns scrolled to the left. */
  sticky: number;
  /** Material columns not fully shown on each side (the fades cover what is left of them). */
  left: number;
  right: number;
}

const NONE: Overflow = { sticky: 0, left: 0, right: 0 };

/** The material column headers (not the sticky lesson one), with the part of the scroller they can show in. */
function columns(scroller: HTMLElement) {
  const [lessonHead, ...heads] = Array.from(scroller.querySelectorAll<HTMLElement>('[role="columnheader"]'));
  const box = scroller.getBoundingClientRect();
  const sticky = lessonHead?.offsetWidth ?? 0;
  return { heads: heads.map((h) => h.getBoundingClientRect()), from: box.left + sticky, to: box.right, sticky };
}

function measure(scroller: HTMLElement | null): Overflow {
  if (!scroller || scroller.scrollWidth <= scroller.clientWidth + 1) return NONE;
  const { heads, from, to, sticky } = columns(scroller);
  return { sticky, left: heads.filter((r) => r.left < from - 1).length, right: heads.filter((r) => r.right > to + 1).length };
}

/** Scroll so the next column that is not fully shown lines up with the edge it was hidden behind. */
function step(scroller: HTMLElement, dir: 1 | -1) {
  const { heads, from, to } = columns(scroller);
  const target = dir > 0 ? heads.find((r) => r.right > to + 1) : heads.findLast((r) => r.left < from - 1);
  const left = target ? (dir > 0 ? target.left - from : target.right - to) : dir * (to - from);
  const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  scroller.scrollBy({ left, behavior: smooth ? 'smooth' : 'auto' });
}

function useOverflow(scroller: React.RefObject<HTMLDivElement | null>): Overflow {
  const [overflow, setOverflow] = useState(NONE);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const update = () =>
      setOverflow((prev) => {
        const next = measure(el);
        return next.left === prev.left && next.right === prev.right && next.sticky === prev.sticky ? prev : next;
      });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    el.addEventListener('scroll', update, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener('scroll', update);
    };
  }, [scroller]);
  return overflow;
}

const pill =
  'pointer-events-auto flex h-7 items-center gap-0.5 rounded-full bg-paper font-ui text-12 font-medium text-ink-2 shadow-sheet outline-none transition-colors duration-120 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent';

/**
 * When the map is wider than the window: a fade at each edge that hides
 * columns, and a small button on it that brings the next columns into view
 * ("3 more"). Arrow keys inside the grid scroll it as well.
 */
export function ScrollCue({ scroller }: { scroller: React.RefObject<HTMLDivElement | null> }) {
  const t = useT();
  const { sticky, left, right } = useOverflow(scroller);
  const leftButton = useRef<HTMLButtonElement>(null);
  const rightButton = useRef<HTMLButtonElement>(null);
  const pressed = useRef<1 | -1 | null>(null);
  // A button disappears once its side is fully shown; hand focus to the other one instead of dropping it.
  useEffect(() => {
    const lost = !document.activeElement || document.activeElement === document.body;
    if (lost && pressed.current === 1 && !right) leftButton.current?.focus();
    if (lost && pressed.current === -1 && !left) rightButton.current?.focus();
  }, [left, right]);
  const go = (dir: 1 | -1) => {
    pressed.current = dir;
    if (scroller.current) step(scroller.current, dir);
  };
  return (
    <>
      {left > 0 && (
        <div className="pointer-events-none absolute inset-y-0 z-10 flex w-24 items-start bg-gradient-to-r from-desk from-35% to-transparent pt-2 pl-2" style={{ left: sticky }}>
          <button ref={leftButton} type="button" aria-label={t.map.showEarlier} title={t.map.showEarlier} onClick={() => go(-1)} className={`${pill} w-7 justify-center`}>
            <ChevronLeft size={14} strokeWidth={1.75} aria-hidden />
          </button>
        </div>
      )}
      {right > 0 && (
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 flex w-32 items-start justify-end bg-gradient-to-l from-desk from-55% to-transparent pt-2">
          <button ref={rightButton} type="button" aria-label={t.map.showMore(right)} onClick={() => go(1)} className={`${pill} pl-3 pr-2`}>
            {t.map.moreColumns(right)}
            <ChevronRight size={14} strokeWidth={1.75} aria-hidden />
          </button>
        </div>
      )}
    </>
  );
}
