import type { Slide } from '@folio/core';
import { cx } from '@folio/ui';
import { EditableText } from '../components/editing/EditableText';
import { useT } from '../i18n';

interface SlideCanvasProps {
  slide: Slide;
  lang: string;
  footer?: string;
  onChange?: (slide: Slide) => void;
  className?: string;
}

const cq = (n: number) => ({ fontSize: `${n}cqw` });

function Bullets({ slide, onChange, lang }: { slide: Slide; onChange?: (s: Slide) => void; lang: string }) {
  const t = useT();
  if (!slide.bullets.length && !onChange) return null;
  const plain = slide.layout === 'title' || slide.layout === 'quote';
  const addLabel = slide.layout === 'title' ? t.lesson.addSubtitle : slide.layout === 'quote' ? t.lesson.addAttribution : t.lesson.addBullet;
  const set = (i: number, text: string) =>
    onChange?.({ ...slide, bullets: text.trim() ? slide.bullets.map((b, j) => (j === i ? text : b)) : slide.bullets.filter((_, j) => j !== i) });
  return (
    <ul className="folio-slide-bullets font-reading leading-snug text-ink-2" style={cq(slide.layout === 'question' ? 2.8 : 3.1)}>
      {slide.bullets.map((b, i) => (
        <li key={i}>
          {plain ? null : <span aria-hidden className="folio-slide-dot" />}
          {onChange ? <EditableText value={b} label={`${t.lesson.bullet} ${i + 1}`} lang={lang} className="min-w-0 flex-1" onCommit={(v) => set(i, v)} /> : <span>{b}</span>}
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
export function SlideCanvas({ slide, lang, footer, onChange, className }: SlideCanvasProps) {
  const t = useT();
  const titleSize = { title: 7.2, bullets: 5.2, question: 5.6, quote: 5 }[slide.layout];
  const title = onChange ? (
    <EditableText as="h3" value={slide.title} label={t.lesson.slideTitle} lang={lang} className="block" onCommit={(v) => onChange({ ...slide, title: v })} />
  ) : (
    <h3>{slide.title}</h3>
  );
  return (
    <div className={cx('folio-slide group/slide relative aspect-video w-full overflow-hidden bg-paper text-ink', className)} lang={lang}>
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
        <div className={cx('folio-slide-gap', slide.layout === 'question' && 'mx-auto')}>
          <Bullets slide={slide} onChange={onChange} lang={lang} />
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
