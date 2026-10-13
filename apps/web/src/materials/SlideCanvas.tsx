import type { Slide } from '@folio/core';
import { useLayoutEffect, useRef } from 'react';
import { cx } from '@folio/ui';
import { EditableText } from '../components/editing/EditableText';
import { InlineText } from '../components/InlineText';
import { useT } from '../i18n';
import { SlideVisualView } from './SlideVisual';

interface SlideCanvasProps {
  slide: Slide;
  lang: string;
  footer?: string;
  onChange?: (slide: Slide) => void;
  /** A demonstration on the slide can be worked: on the stage, not in a thumbnail or on paper. Where the slide is edited, unless said. */
  live?: boolean;
  className?: string;
}

/** A size in the slide's own units, times the fit of the slide's body (1 unless its content is taller than the slide). */
const cq = (n: number) => ({ fontSize: `calc(var(--fit, 1) * ${n}cqw)` });

/**
 * What a slide holds under its title, made smaller where it is taller than the room the slide has for it: a table of six
 * rows over two lines of text ran down through the slide's foot. Its type is brought down a step at a time until it
 * fits, and no lower than a little over half: past that the slide holds too much, and shows it.
 */
function useFit(key: string) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const slide = el?.closest<HTMLElement>('.folio-slide');
    if (!el || !slide) return;
    const fit = () => {
      const foot = slide.querySelector<HTMLElement>('.folio-slide-footer');
      const frame = slide.getBoundingClientRect();
      const room = (foot ? foot.getBoundingClientRect().top : frame.bottom - frame.height * 0.06) - frame.height * 0.015 - el.getBoundingClientRect().top;
      let k = 1;
      for (let i = 0; i < 6; i++) {
        el.style.setProperty('--fit', String(k));
        const tall = el.offsetHeight;
        if (tall <= room || k <= 0.56) break;
        k = Math.max(0.56, k * (room / tall) * 0.985);
      }
    };
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(slide);
    return () => watch.disconnect();
  }, [key]);
  return ref;
}
/** A bullet that is one whole line of code: a single pair of backticks around all of it. */
const isCodeLine = (text: string) => /^`[^`]+`$/.test(text.trim());

function Bullets({ slide, onChange, lang }: { slide: Slide; onChange?: (s: Slide) => void; lang: string }) {
  const t = useT();
  if (!slide.bullets.length && !onChange) return null;
  const plain = slide.layout === 'title' || slide.layout === 'quote';
  const addLabel = slide.layout === 'title' ? t.lesson.addSubtitle : slide.layout === 'quote' ? t.lesson.addAttribution : t.lesson.addBullet;
  const set = (i: number, text: string) =>
    onChange?.({ ...slide, bullets: text.trim() ? slide.bullets.map((b, j) => (j === i ? text : b)) : slide.bullets.filter((_, j) => j !== i) });
  // Lines of code one after another are one block of code: set close, without dots, at a size all of them fit the slide
  // at. As bullets of the slide's own size a function of twelve lines could not stand on one slide, and was cut over three.
  const code = slide.bullets.map(isCodeLine);
  const inBlock = (i: number) => code[i] && (code[i - 1] || code[i + 1]);
  const lines = code.filter((_, i) => inBlock(i)).length;
  return (
    <ul className="folio-slide-bullets font-reading leading-snug text-ink-2" style={cq(slide.layout === 'question' ? 2.8 : 3.1)}>
      {slide.bullets.map((b, i) => (
        <li key={i} className={inBlock(i) ? 'folio-slide-code' : undefined} style={inBlock(i) ? cq(Math.min(2.6, 22 / lines)) : undefined}>
          {plain || inBlock(i) ? null : <span aria-hidden className="folio-slide-dot" />}
          {onChange ? <EditableText value={b} label={`${t.lesson.bullet} ${i + 1}`} lang={lang} className="min-w-0 flex-1" onCommit={(v) => set(i, v)} /> : <span><InlineText text={b} /></span>}
        </li>
      ))}
      {onChange && (!plain || slide.bullets.length === 0) && (
        <li className="no-print">
          <button
            type="button"
            className={cx(
              'font-ui text-ink-2 outline-none hover:text-accent focus-visible:ring-2 focus-visible:ring-accent',
              slide.layout !== 'bullets' && 'opacity-0 transition-opacity duration-120 group-hover/slide:opacity-100 focus-visible:opacity-100',
            )}
            style={cq(2)}
            onClick={() => onChange({ ...slide, bullets: [...slide.bullets, plain ? addLabel : t.lesson.bullet] })}
          >
            + {addLabel}
          </button>
        </li>
      )}
    </ul>
  );
}

/**
 * A 16:9 slide in the paper-and-ink style. Sizes are in container units, so
 * the same component is a thumbnail in the filmstrip and the full stage.
 */
export function SlideCanvas({ slide, lang, footer, onChange, live = Boolean(onChange), className }: SlideCanvasProps) {
  const t = useT();
  const titleSize = { title: 7.2, bullets: 5.2, question: 5.6, quote: 5 }[slide.layout];
  const fit = useFit(JSON.stringify([slide.title, slide.bullets, slide.visual, slide.layout]));
  // The slide being edited heads the page under the deck's title; a thumbnail is a link or button that already has
  // its name, so its title is not a heading too.
  const title = onChange ? (
    <EditableText as="h2" value={slide.title} label={t.lesson.slideTitle} required lang={lang} className="block" onCommit={(v) => onChange({ ...slide, title: v })} />
  ) : (
    <p>
      <InlineText text={slide.title} />
    </p>
  );
  return (
    <div data-item={slide.id} className={cx('folio-slide group/slide relative aspect-video w-full overflow-hidden bg-paper text-ink', className)} lang={lang}>
      <span aria-hidden className="folio-slide-tab" />
      <div
        className={cx(
          'folio-slide-body flex h-full flex-col',
          slide.layout === 'title' && 'justify-center',
          slide.layout === 'question' && 'justify-center text-center',
          slide.layout === 'quote' && 'justify-center',
        )}
      >
        {slide.layout === 'quote' && (
          <span aria-hidden className="font-display leading-none text-tab-slides" style={cq(9)}>
            “
          </span>
        )}
        <div className={cx('folio-slide-title font-display text-ink', slide.layout === 'quote' && 'italic')} style={cq(titleSize)}>
          {title}
        </div>
        {slide.visual?.kind === 'figure' && (
          <div className="folio-slide-gap folio-slide-figure-slot" style={cq(2.2)}>
            <SlideVisualView visual={slide.visual} live={live} onChange={onChange && ((visual) => onChange({ ...slide, visual }))} />
          </div>
        )}
        <div ref={fit}>
          {slide.visual && slide.visual.kind !== 'figure' && (
            <div className="folio-slide-gap" style={cq(2.2)}>
              <SlideVisualView visual={slide.visual} live={live} onChange={onChange && ((visual) => onChange({ ...slide, visual }))} />
            </div>
          )}
          {/* A question's points stand as one block in the middle, each beside its dot: centred line by line in the editor, the
              text drifted to the middle of the slide and left its dot at the edge. */}
          <div className={cx('folio-slide-gap', slide.layout === 'question' && 'mx-auto w-fit max-w-full text-left')}>
            <Bullets slide={slide} onChange={onChange} lang={lang} />
          </div>
        </div>
      </div>
      {footer && (
        <p className="folio-slide-footer truncate font-ui text-ink-2" style={{ fontSize: 'max(1.5cqw, 10px)' }}>
          {footer}
        </p>
      )}
    </div>
  );
}
