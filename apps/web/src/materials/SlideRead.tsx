import type { Slide, SlideVisual } from '@folio/core';
import { SlideVisualView } from './SlideVisual';

const LABEL = 'This slide’s words, at reading size';

/**
 * A slide's chain of steps, things side by side or table again under the slide, at the page's own size, on a screen in
 * the hand. A slide is drawn to scale, so on a phone 390 pixels wide its columns were set in type six pixels high: right
 * as a picture of the slide, and not to be read or changed. Here the same words stand one under another, and a change
 * made here is a change to the slide. Wider screens show the slide large enough and do not have this.
 */
export function SlideRead({ slide, onChange }: { slide: Slide; onChange: (visual: SlideVisual) => void }) {
  const visual = slide.visual;
  if (!visual || (visual.kind !== 'steps' && visual.kind !== 'compare' && visual.kind !== 'table')) return null;
  return (
    <section aria-label={LABEL} className="folio-slide-read mt-3 rounded-sheet bg-paper p-4 font-reading text-16 leading-6 text-ink shadow-sheet sm:hidden">
      <h3 className="mb-2 font-ui text-13 font-semibold text-ink-2">{LABEL}</h3>
      <SlideVisualView visual={visual} onChange={onChange} />
    </section>
  );
}
