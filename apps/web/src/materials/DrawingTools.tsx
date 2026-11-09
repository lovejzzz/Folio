import { SlideVisualSchema, type Slide, type SlideVisual } from '@folio/core';
import { Button } from '@folio/ui';
import { useEffect, useState } from 'react';
import { drawText } from '../i18n/drawText';
import { drawingPng, drawingSvg, drawingAddress } from '../lib/drawing';
import { download } from '../lib/exporter';
import { drawSlideAt } from '../state/drawSlide';

type Drawing = Extract<SlideVisual, { kind: 'drawing' }>;

/** A drawing's sheet is 520 by 420, whatever it holds. */
const SHEET = { aspectRatio: '520 / 420' } as const;

/**
 * A slide drawn as a picture: its code is drawn in the page's drawing frame and shown as an image. Until it is, the
 * slide says it is being drawn; one that cannot be drawn says so, and the slide's words stand.
 */
export function DrawingView({ v }: { v: Drawing }) {
  const [shown, setShown] = useState<{ code: string; url: string | null } | null>(null);
  useEffect(() => {
    let live = true;
    void drawingAddress(v.code).then((url) => live && setShown({ code: v.code, url }));
    return () => {
      live = false;
    };
  }, [v.code]);
  const alt = drawText.alt(v.of, v.parts);
  if (!shown || shown.code !== v.code) return <p className="folio-figure-art grid place-items-center font-ui text-13 text-ink-2" style={SHEET} role="status">{drawText.drawing}</p>;
  if (!shown.url) return <p className="font-ui text-13 text-ink-2">{drawText.failed}</p>;
  return <img className="folio-figure-art" style={SHEET} src={shown.url} alt={alt} />;
}

/** The visual the picture took the place of, back as it was: nothing, where there was none or it no longer reads. */
function before(v: Drawing): Slide['visual'] {
  try {
    const found = v.from ? SlideVisualSchema.safeParse(JSON.parse(v.from)) : null;
    return found?.success && found.data.kind !== 'drawing' ? found.data : undefined;
  } catch {
    return undefined;
  }
}

const fileName = (title: string, ext: string) => `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'drawing'}.${ext}`;

/** The idea a teacher may give, and the button that draws the slide: under any slide that is not a picture already. */
export function DrawSlide({ lessonId, slide, row }: { lessonId: string; slide: Slide; row: string }) {
  const [hint, setHint] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    await drawSlideAt(lessonId, slide.id, hint).finally(() => setBusy(false));
  };
  return (
    <div className={row} role="group" aria-label={drawText.drawThis}>
      <input className="h-8 min-w-0 flex-1 rounded-control border border-field bg-paper px-2 text-13 text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent" value={hint} placeholder={drawText.drawHintExample} aria-label={drawText.drawHint} onChange={(e) => setHint(e.target.value)} />
      <Button size="sm" variant="secondary" isDisabled={busy} onPress={() => void go()}>
        {busy ? drawText.working : drawText.drawThis}
      </Button>
      <span className="w-full text-ink-2">{drawText.drawCost}</span>
    </div>
  );
}

/** Under a drawn slide: the picture as a file, drawn again (with a new idea, if given), or taken off. */
export function DrawingTools({ v, lessonId, slide, onChange, row }: { v: Drawing; lessonId: string; slide: Slide; onChange: (visual: Slide['visual']) => void; row: string }) {
  const save = async (kind: 'svg' | 'png') => {
    if (kind === 'svg') {
      const svg = await drawingSvg(v.code);
      if (svg) download({ name: fileName(slide.title, 'svg'), mime: 'image/svg+xml', bytes: new TextEncoder().encode(svg) });
      return;
    }
    const png = await drawingPng(v.code, 2080);
    if (png) download({ name: fileName(slide.title, 'png'), mime: 'image/png', bytes: png.bytes });
  };
  return (
    <div className="no-print mt-2 space-y-2">
      <div className={row} role="group" aria-label={drawText.drawThis}>
        <Button size="sm" variant="secondary" onPress={() => void save('svg')}>
          {drawText.saveSvg}
        </Button>
        <Button size="sm" variant="secondary" onPress={() => void save('png')}>
          {drawText.savePng}
        </Button>
        <Button size="sm" variant="quiet" onPress={() => onChange(before(v))}>
          {drawText.remove}
        </Button>
        <span className="text-ink-2">{drawText.credit}</span>
      </div>
      <DrawSlide lessonId={lessonId} slide={slide} row={row} />
    </div>
  );
}
