import type { Slide, SlideVisual } from '@folio/core';
import { Button } from '@folio/ui';
import { useT } from '../i18n';

type Steps = Extract<SlideVisual, { kind: 'steps' }>;
type Compare = Extract<SlideVisual, { kind: 'compare' }>;

const STEPS_MAX = 6;
const SIDES_MAX = 3;
const POINTS_MAX = 4;

/**
 * Under the slide: a teacher gives a slide a chain of steps or things side by side, makes it longer or shorter, or
 * takes it off. The words themselves are changed on the slide, where they stand. A slide that holds a table or a
 * chart keeps it: nothing here replaces what is there.
 */
export function BlockTools({ slide, onChange }: { slide: Slide; onChange: (visual: Slide['visual']) => void }) {
  const t = useT();
  const v = slide.visual;
  const row = 'no-print mt-2 flex flex-wrap items-center gap-2 font-ui text-12 text-ink-2';
  if (!v) {
    const steps: Steps = { kind: 'steps', cycle: false, steps: [1, 2, 3].map((n) => ({ title: t.slides.newStep(n), detail: '' })) };
    const compare: Compare = { kind: 'compare', ask: '', sides: [1, 2].map((n) => ({ title: t.slides.newSide(n), points: [t.slides.newPoint] })) };
    return (
      <div className={row} role="group" aria-label={t.slides.layouts}>
        <span className="font-semibold">{t.slides.layouts}</span>
        <Button size="sm" variant="secondary" onPress={() => onChange(steps)}>
          {t.slides.addSteps}
        </Button>
        <Button size="sm" variant="secondary" onPress={() => onChange(compare)}>
          {t.slides.addCompare}
        </Button>
      </div>
    );
  }
  if (v.kind === 'steps') {
    return (
      <div className={row} role="group" aria-label={t.slides.layouts}>
        <Button size="sm" variant="secondary" isDisabled={v.steps.length >= STEPS_MAX} onPress={() => onChange({ ...v, steps: [...v.steps, { title: t.slides.newStep(v.steps.length + 1), detail: '' }] })}>
          {t.slides.addStep}
        </Button>
        <Button size="sm" variant="secondary" isDisabled={v.steps.length <= 2} onPress={() => onChange({ ...v, steps: v.steps.slice(0, -1) })}>
          {t.slides.removeStep}
        </Button>
        <Button size="sm" variant="secondary" onPress={() => onChange({ ...v, cycle: !v.cycle })}>
          {v.cycle ? t.slides.noCycle : t.slides.makeCycle}
        </Button>
        <Button size="sm" variant="quiet" onPress={() => onChange(undefined)}>
          {t.slides.removeLayout}
        </Button>
      </div>
    );
  }
  if (v.kind === 'compare') return <CompareTools v={v} onChange={onChange} row={row} />;
  return null;
}

function CompareTools({ v, onChange, row }: { v: Compare; onChange: (visual: Slide['visual']) => void; row: string }) {
  const t = useT();
  const rows = Math.max(0, ...v.sides.map((s) => s.points.length));
  return (
    <div className={row} role="group" aria-label={t.slides.layouts}>
      <Button size="sm" variant="secondary" isDisabled={v.sides.length >= SIDES_MAX} onPress={() => onChange({ ...v, sides: [...v.sides, { title: t.slides.newSide(v.sides.length + 1), points: Array.from({ length: Math.max(1, rows) }, () => t.slides.newPoint) }] })}>
        {t.slides.addSide}
      </Button>
      <Button size="sm" variant="secondary" isDisabled={v.sides.length <= 2} onPress={() => onChange({ ...v, sides: v.sides.slice(0, -1) })}>
        {t.slides.removeSide}
      </Button>
      <Button size="sm" variant="secondary" isDisabled={rows >= POINTS_MAX} onPress={() => onChange({ ...v, sides: v.sides.map((s) => ({ ...s, points: [...s.points, t.slides.newPoint] })) })}>
        {t.slides.addPointRow}
      </Button>
      <Button size="sm" variant="secondary" isDisabled={rows <= 1} onPress={() => onChange({ ...v, sides: v.sides.map((s) => ({ ...s, points: s.points.slice(0, rows - 1) })) })}>
        {t.slides.removePointRow}
      </Button>
      <Button size="sm" variant="quiet" onPress={() => onChange(undefined)}>
        {t.slides.removeLayout}
      </Button>
    </div>
  );
}
