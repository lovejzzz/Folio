import { LayerLookSchema, LayerTintSchema, type LayerLook, type LayerTint, type Slide, type SlideVisual } from '@folio/core';
import { layersSvg, svgToPng } from '@folio/figures';
import { Button } from '@folio/ui';
import { useT } from '../i18n';
import { download } from '../lib/exporter';
import { svgAddress } from './figures/FigureView';

type Layers = Extract<SlideVisual, { kind: 'layers' }>;

const LAYERS_MAX = 10;
const field = 'h-8 rounded-control border border-field bg-paper px-2 text-13 text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent';

/** The drawing on the slide: the same picture a download and an export hold. */
export function LayersView({ v }: { v: Layers }) {
  const t = useT();
  const pic = layersSvg(v);
  return <img className="folio-figure-art" style={{ aspectRatio: `${pic.width} / ${pic.height}` }} src={svgAddress(pic.svg)} alt={t.slides.layersOf(v.parts.map((p) => p.name))} />;
}

/** A file name from the slide's title: letters, digits and dashes. */
const fileName = (title: string, ext: string) => `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'layers'}.${ext}`;

/**
 * Under a slide with an exploded drawing: drawn apart or put together, names on or off, a layer more or less, each
 * layer's name, face and colour, and the picture as an SVG or a PNG. The drawing is Folio's own from these choices.
 */
export function LayersTools({ v, slide, onChange, row }: { v: Layers; slide: Slide; onChange: (visual: Slide['visual']) => void; row: string }) {
  const t = useT();
  const part = (i: number, change: Partial<Layers['parts'][number]>) => onChange({ ...v, parts: v.parts.map((p, k) => (k === i ? { ...p, ...change } : p)) });
  const save = (kind: 'svg' | 'png') => {
    const pic = layersSvg(v);
    download(kind === 'svg' ? { name: fileName(slide.title, 'svg'), mime: 'image/svg+xml', bytes: new TextEncoder().encode(pic.svg) } : { name: fileName(slide.title, 'png'), mime: 'image/png', bytes: svgToPng(pic.svg, 4) });
  };
  return (
    <div className="no-print mt-2 space-y-2" role="group" aria-label={t.slides.layouts}>
      <div className={row}>
        <Button size="sm" variant="secondary" onPress={() => onChange({ ...v, open: !v.open })}>
          {v.open ? t.slides.layersClose : t.slides.layersOpen}
        </Button>
        <Button size="sm" variant="secondary" onPress={() => onChange({ ...v, labels: !v.labels })}>
          {v.labels ? t.slides.layersNoNames : t.slides.layersNames}
        </Button>
        <Button size="sm" variant="secondary" isDisabled={v.parts.length >= LAYERS_MAX} onPress={() => onChange({ ...v, parts: [...v.parts, { name: t.slides.newLayer(v.parts.length + 1), look: 'plain', tint: 'none' }] })}>
          {t.slides.addLayer}
        </Button>
        <Button size="sm" variant="secondary" isDisabled={v.parts.length <= 2} onPress={() => onChange({ ...v, parts: v.parts.slice(0, -1) })}>
          {t.slides.removeLayer}
        </Button>
        <Button size="sm" variant="secondary" onPress={() => save('svg')}>
          {t.slides.saveSvg}
        </Button>
        <Button size="sm" variant="secondary" onPress={() => save('png')}>
          {t.slides.savePng}
        </Button>
        <Button size="sm" variant="quiet" onPress={() => onChange(undefined)}>
          {t.slides.removeLayout}
        </Button>
      </div>
      <ol className="space-y-1 font-ui text-12 text-ink-2">
        {v.parts.map((p, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2">
            <span className="w-5 text-right tabular-nums">{i + 1}</span>
            <input className={`${field} min-w-0 flex-1`} value={p.name} aria-label={t.slides.layerName(i + 1)} onChange={(e) => part(i, { name: e.target.value })} />
            <select className={field} value={p.look} aria-label={t.slides.layerLook(i + 1)} onChange={(e) => part(i, { look: e.target.value as LayerLook })}>
              {LayerLookSchema.options.map((look) => (
                <option key={look} value={look}>
                  {t.slides.looks[look]}
                </option>
              ))}
            </select>
            <select className={field} value={p.tint} aria-label={t.slides.layerTint(i + 1)} onChange={(e) => part(i, { tint: e.target.value as LayerTint })}>
              {LayerTintSchema.options.map((tint) => (
                <option key={tint} value={tint}>
                  {t.slides.tints[tint]}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ol>
    </div>
  );
}
