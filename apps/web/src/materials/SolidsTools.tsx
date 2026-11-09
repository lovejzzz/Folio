import { LayerTintSchema, type LayerTint, type Slide, type SlideVisual } from '@folio/core';
import { solidsSvg, svgToPng } from '@folio/figures';
import { Button } from '@folio/ui';
import { slidesText } from '../i18n/slidesText';
import { download } from '../lib/exporter';
import { svgAddress } from './figures/FigureView';

type Solids = Extract<SlideVisual, { kind: 'solids' }>;

const field = 'h-8 rounded-control border border-field bg-paper px-2 text-13 text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent';

/** The drawing on the slide: the same picture a download and an export hold. */
export function SolidsView({ v }: { v: Solids }) {
  const pic = solidsSvg(v);
  return <img className="folio-figure-art" style={{ aspectRatio: `${pic.width} / ${pic.height}` }} src={svgAddress(pic.svg)} alt={slidesText.solidsOf(v.parts.map((p) => p.name))} />;
}

const fileName = (title: string, ext: string) => `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'parts'}.${ext}`;

/**
 * Under a slide with a thing taken apart: apart or together, names on or off, each part's name, colour and whether it
 * is clear, and the picture as an SVG or a PNG. Its shapes and places are the drawing's own and stay as written.
 */
export function SolidsTools({ v, slide, onChange, row }: { v: Solids; slide: Slide; onChange: (visual: Slide['visual']) => void; row: string }) {
  const part = (i: number, change: Partial<Solids['parts'][number]>) => onChange({ ...v, parts: v.parts.map((p, k) => (k === i ? { ...p, ...change } : p)) });
  const save = (kind: 'svg' | 'png') => {
    const pic = solidsSvg(v);
    download(kind === 'svg' ? { name: fileName(slide.title, 'svg'), mime: 'image/svg+xml', bytes: new TextEncoder().encode(pic.svg) } : { name: fileName(slide.title, 'png'), mime: 'image/png', bytes: svgToPng(pic.svg, 4) });
  };
  return (
    <div className="no-print mt-2 space-y-2" role="group" aria-label={slidesText.layouts}>
      <div className={row}>
        <Button size="sm" variant="secondary" onPress={() => onChange({ ...v, open: !v.open })}>
          {v.open ? slidesText.layersClose : slidesText.layersOpen}
        </Button>
        <Button size="sm" variant="secondary" onPress={() => onChange({ ...v, labels: !v.labels })}>
          {v.labels ? slidesText.layersNoNames : slidesText.layersNames}
        </Button>
        <Button size="sm" variant="secondary" onPress={() => save('svg')}>
          {slidesText.saveSvg}
        </Button>
        <Button size="sm" variant="secondary" onPress={() => save('png')}>
          {slidesText.savePng}
        </Button>
        <Button size="sm" variant="quiet" onPress={() => onChange(undefined)}>
          {slidesText.removeLayout}
        </Button>
      </div>
      <ol className="space-y-1 font-ui text-12 text-ink-2">
        {v.parts.map((p, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2">
            <span className="w-5 text-right tabular-nums">{i + 1}</span>
            <input className={`${field} min-w-0 flex-1`} value={p.name} aria-label={slidesText.partName(i + 1)} onChange={(e) => part(i, { name: e.target.value })} />
            <select className={field} value={p.tint} aria-label={slidesText.partTint(i + 1)} onChange={(e) => part(i, { tint: e.target.value as LayerTint })}>
              {LayerTintSchema.options.map((tint) => (
                <option key={tint} value={tint}>
                  {slidesText.tints[tint]}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={p.clear} onChange={(e) => part(i, { clear: e.target.checked })} />
              {slidesText.partClear}
            </label>
          </li>
        ))}
      </ol>
    </div>
  );
}
