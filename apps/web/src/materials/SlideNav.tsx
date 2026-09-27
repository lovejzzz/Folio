import type { Course, Lesson } from '@folio/core';
import { Tooltip, cx } from '@folio/ui';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from 'react-aria-components';
import { useT } from '../i18n';
import { SlideCanvas } from './SlideCanvas';

/** A place in the deck: a lesson and a slide within it, counted from 0. */
export interface SlidePos {
  lessonId: string;
  index: number;
}

/** Every slide in the course in teaching order, so stepping crosses from one lesson into the next. */
export function deckOrder(lessons: Lesson[]): SlidePos[] {
  return lessons.flatMap((l) => l.slides.map((_, index) => ({ lessonId: l.id, index })));
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Keeps the current thumbnail in view inside the filmstrip's own scroll, without moving the page. */
function useKeepInView(nav: React.RefObject<HTMLElement | null>, activeId: string | undefined) {
  const first = useRef(true);
  useEffect(() => {
    const box = nav.current;
    const el = box?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!box || !el) return;
    const b = box.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const behavior = first.current || reducedMotion() ? 'auto' : 'smooth';
    first.current = false;
    if (r.top < b.top) box.scrollBy({ top: r.top - b.top - 32, behavior });
    else if (r.bottom > b.bottom) box.scrollBy({ top: r.bottom - b.bottom + 32, behavior });
  }, [nav, activeId]);
}

/** Large screens: every lesson's slides in a column that scrolls on its own beside the stage. */
export function Filmstrip({ course, lessons, activeId, onSelect }: { course: Course; lessons: Lesson[]; activeId: string | undefined; onSelect: (p: SlidePos) => void }) {
  const t = useT();
  const nav = useRef<HTMLElement>(null);
  useKeepInView(nav, activeId);
  return (
    <nav ref={nav} aria-label={t.lesson.filmstrip} className="no-print scrollbar-quiet sticky top-20 hidden max-h-filmstrip w-48 shrink-0 space-y-6 overflow-y-auto overscroll-contain p-1 pr-3 lg:block">
      {lessons.map((lesson) => (
        <div key={lesson.id}>
          <p className="mb-2 flex gap-1.5 pl-6 font-ui text-12 font-medium text-ink-2">
            <span className="shrink-0">{t.common.lesson(course.lessonOrder.indexOf(lesson.id) + 1)}</span>
            <span aria-hidden>·</span>
            <span className="truncate" lang={course.language}>{lesson.title}</span>
          </p>
          <ol className="space-y-2.5">
            {lesson.slides.map((s, i) => {
              const active = activeId === s.id;
              return (
                <li key={s.id} className="flex items-start gap-2">
                  <span className={cx('w-4 pt-0.5 text-right font-mono text-12 tabular', active ? 'text-accent' : 'text-ink-2')}>{i + 1}</span>
                  <button
                    type="button"
                    aria-current={active || undefined}
                    aria-label={`${t.lesson.slideOf(i + 1, lesson.slides.length)}: ${s.title}`}
                    onClick={() => onSelect({ lessonId: lesson.id, index: i })}
                    className={cx('block flex-1 overflow-hidden rounded-control shadow-sheet outline-none transition-shadow duration-200 hover:shadow-overlay focus-visible:ring-2 focus-visible:ring-accent', active && 'ring-2 ring-accent')}
                  >
                    <SlideCanvas slide={s} lang={course.language} />
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </nav>
  );
}

function Step({ label, onPress, children }: { label: string; onPress: (() => void) | undefined; children: ReactNode }) {
  return (
    <Tooltip content={label}>
      <Button
        aria-label={label}
        isDisabled={!onPress}
        onPress={onPress}
        className={cx(
          'inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-rule bg-paper text-ink-2 shadow-sheet outline-none transition-colors duration-120 ease-ink',
          'lg:size-8 lg:rounded-control lg:border-transparent lg:bg-transparent lg:shadow-none',
          'data-hovered:bg-well data-hovered:text-ink data-pressed:bg-rule data-disabled:opacity-45 data-disabled:shadow-none',
          'data-focus-visible:ring-2 data-focus-visible:ring-accent data-focus-visible:ring-offset-2 data-focus-visible:ring-offset-desk',
        )}
      >
        {children}
      </Button>
    </Tooltip>
  );
}

/**
 * Under the stage: where you are and a step either way. Large screens show a
 * quiet "Slide 2 of 5"; small ones, which have no filmstrip, name the lesson
 * too and get buttons big enough for a thumb.
 */
export function SlidePager({ course, lesson, index, onPrev, onNext }: { course: Course; lesson: Lesson; index: number; onPrev?: () => void; onNext?: () => void }) {
  const t = useT();
  const where = t.lesson.slideOf(index + 1, lesson.slides.length);
  return (
    <div className="no-print mt-4 flex items-center gap-3 lg:mt-3">
      <div className="min-w-0 flex-1 lg:hidden">
        <p aria-live="polite" className="flex gap-1.5 font-ui text-12 text-ink-2 tabular">
          <span>{t.common.lesson(course.lessonOrder.indexOf(lesson.id) + 1)}</span>
          <span aria-hidden>·</span>
          <span>{where}</span>
        </p>
        <p className="truncate font-ui text-14 font-medium text-ink" lang={course.language}>
          {lesson.title}
        </p>
      </div>
      <p aria-live="polite" className="ml-auto hidden font-ui text-12 text-ink-2 tabular lg:block">
        {where}
      </p>
      <div className="flex shrink-0 items-center gap-2 lg:-mr-1 lg:gap-0">
        <Step label={t.lesson.previousSlide} onPress={onPrev}>
          <ChevronLeft size={18} strokeWidth={1.5} />
        </Step>
        <Step label={t.lesson.nextSlide} onPress={onNext}>
          <ChevronRight size={18} strokeWidth={1.5} />
        </Step>
      </div>
    </div>
  );
}

/** Widgets that already use the arrow keys for themselves. */
const OWNS_ARROWS = 'input, textarea, select, [role="radiogroup"], [role="menu"], [role="listbox"], [role="grid"], [role="tablist"], [role="slider"], [role="dialog"]';

/** ← and → step through the deck, unless focus is in a text field or a widget that owns the arrows. */
export function useArrowKeys(onPrev: (() => void) | undefined, onNext: (() => void) | undefined) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const go = e.key === 'ArrowLeft' ? onPrev : e.key === 'ArrowRight' ? onNext : undefined;
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (!go || (target && (target.isContentEditable || target.closest(OWNS_ARROWS)))) return;
      e.preventDefault();
      go();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onPrev, onNext]);
}
