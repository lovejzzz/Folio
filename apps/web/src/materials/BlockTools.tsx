import type { Slide, SlideVisual } from '@folio/core';
import { Button } from '@folio/ui';
import { slidesText } from '../i18n/slidesText';
import { DrawingTools, DrawSlide } from './DrawingTools';
import { LayersTools } from './LayersTools';
import { SolidsTools } from './SolidsTools';

type Steps = Extract<SlideVisual, { kind: 'steps' }>;
type Compare = Extract<SlideVisual, { kind: 'compare' }>;
type Layers = Extract<SlideVisual, { kind: 'layers' }>;

const STEPS_MAX = 6;
const SIDES_MAX = 3;
const POINTS_MAX = 4;

/**
 * Under the slide: a teacher gives a slide a chain of steps, things side by side or an exploded drawing of layers, makes it longer or shorter, or
 * takes it off. The words themselves are changed on the slide, where they stand. A slide that holds a table or a
 * chart keeps it: nothing here replaces what is there.
 */
export function BlockTools({ lessonId, slide, onChange }: { lessonId: string; slide: Slide; onChange: (visual: Slide['visual']) => void }) {
  const row = 'no-print mt-2 flex flex-wrap items-center gap-2 font-ui text-12 text-ink-2';
  const v = slide.visual;
  // A drawn picture has its own tools; any other slide, except a demonstration, can be drawn as one.
  if (v?.kind === 'drawing') return <DrawingTools v={v} lessonId={lessonId} slide={slide} onChange={onChange} row={row} />;
  return (
    <>
      <LayoutTools slide={slide} onChange={onChange} row={row} />
      {v?.kind !== 'figure' && <DrawSlide lessonId={lessonId} slide={slide} row={row} />}
    </>
  );
}

function LayoutTools({ slide, onChange, row }: { slide: Slide; onChange: (visual: Slide['visual']) => void; row: string }) {
  const v = slide.visual;
  if (!v) {
    const steps: Steps = { kind: 'steps', cycle: false, steps: [1, 2, 3].map((n) => ({ title: slidesText.newStep(n), detail: '' })) };
    const compare: Compare = { kind: 'compare', ask: '', sides: [1, 2].map((n) => ({ title: slidesText.newSide(n), points: [slidesText.newPoint] })) };
    const layers: Layers = { kind: 'layers', open: true, labels: true, parts: [1, 2, 3].map((n) => ({ name: slidesText.newLayer(n), look: 'plain', tint: 'none' })) };
    return (
      <div className={row} role="group" aria-label={slidesText.layouts}>
        <span className="font-semibold">{slidesText.layouts}</span>
        <Button size="sm" variant="secondary" onPress={() => onChange(steps)}>
          {slidesText.addSteps}
        </Button>
        <Button size="sm" variant="secondary" onPress={() => onChange(compare)}>
          {slidesText.addCompare}
        </Button>
        <Button size="sm" variant="secondary" onPress={() => onChange(layers)}>
          {slidesText.addLayers}
        </Button>
      </div>
    );
  }
  if (v.kind === 'steps') {
    return (
      <div className={row} role="group" aria-label={slidesText.layouts}>
        <Button size="sm" variant="secondary" isDisabled={v.steps.length >= STEPS_MAX} onPress={() => onChange({ ...v, steps: [...v.steps, { title: slidesText.newStep(v.steps.length + 1), detail: '' }] })}>
          {slidesText.addStep}
        </Button>
        <Button size="sm" variant="secondary" isDisabled={v.steps.length <= 2} onPress={() => onChange({ ...v, steps: v.steps.slice(0, -1) })}>
          {slidesText.removeStep}
        </Button>
        <Button size="sm" variant="secondary" onPress={() => onChange({ ...v, cycle: !v.cycle })}>
          {v.cycle ? slidesText.noCycle : slidesText.makeCycle}
        </Button>
        <Button size="sm" variant="quiet" onPress={() => onChange(undefined)}>
          {slidesText.removeLayout}
        </Button>
      </div>
    );
  }
  if (v.kind === 'compare') return <CompareTools v={v} onChange={onChange} row={row} />;
  if (v.kind === 'layers') return <LayersTools v={v} slide={slide} onChange={onChange} row={row} />;
  if (v.kind === 'solids') return <SolidsTools v={v} slide={slide} onChange={onChange} row={row} />;
  return null;
}

function CompareTools({ v, onChange, row }: { v: Compare; onChange: (visual: Slide['visual']) => void; row: string }) {
  const rows = Math.max(0, ...v.sides.map((s) => s.points.length));
  return (
    <div className={row} role="group" aria-label={slidesText.layouts}>
      <Button size="sm" variant="secondary" isDisabled={v.sides.length >= SIDES_MAX} onPress={() => onChange({ ...v, sides: [...v.sides, { title: slidesText.newSide(v.sides.length + 1), points: Array.from({ length: Math.max(1, rows) }, () => slidesText.newPoint) }] })}>
        {slidesText.addSide}
      </Button>
      <Button size="sm" variant="secondary" isDisabled={v.sides.length <= 2} onPress={() => onChange({ ...v, sides: v.sides.slice(0, -1) })}>
        {slidesText.removeSide}
      </Button>
      <Button size="sm" variant="secondary" isDisabled={rows >= POINTS_MAX} onPress={() => onChange({ ...v, sides: v.sides.map((s) => ({ ...s, points: [...s.points, slidesText.newPoint] })) })}>
        {slidesText.addPointRow}
      </Button>
      <Button size="sm" variant="secondary" isDisabled={rows <= 1} onPress={() => onChange({ ...v, sides: v.sides.map((s) => ({ ...s, points: s.points.slice(0, rows - 1) })) })}>
        {slidesText.removePointRow}
      </Button>
      <Button size="sm" variant="quiet" onPress={() => onChange(undefined)}>
        {slidesText.removeLayout}
      </Button>
    </div>
  );
}
