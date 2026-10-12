import type { SlideVisual } from '@folio/core';
import { Fragment } from 'react';
import { EditableText } from '../components/editing/EditableText';
import { useT } from '../i18n';

type Steps = Extract<SlideVisual, { kind: 'steps' }>;
type Compare = Extract<SlideVisual, { kind: 'compare' }>;

/** Text a teacher changes where it stands, or plain text on a page nobody edits. */
function Words({ value, label, onCommit, className }: { value: string; label: string; onCommit?: (text: string) => void; className?: string }) {
  if (!onCommit) return value ? <div className={className}>{value}</div> : null;
  return <EditableText as="div" className={className} value={value} label={label} placeholder=" " onCommit={onCommit} />;
}

/**
 * A sequence as a chain: each step in a frame with its number, an arrow from one to the next, read left to right.
 * The order is the picture's, where in a list it was only the order of the lines. A cycle says so under the chain.
 */
export function StepsView({ v, onChange }: { v: Steps; onChange?: (next: Steps) => void }) {
  const t = useT();
  const set = (i: number, part: 'title' | 'detail') => onChange && ((text: string) => onChange({ ...v, steps: v.steps.map((s, k) => (k === i ? { ...s, [part]: text } : s)) }));
  return (
    <div role="group" aria-label={t.slides.stepsOf(v.steps.length)}>
      <ol className="folio-slide-steps" data-count={v.steps.length}>
        {v.steps.map((s, i) => (
          <Fragment key={i}>
            {i > 0 && (
              <li aria-hidden className="folio-slide-step-arrow">
                →
              </li>
            )}
            <li className="folio-slide-step">
              <span className="folio-slide-step-number" aria-hidden>
                {i + 1}
              </span>
              <Words className="folio-slide-step-title" value={s.title} label={t.slides.stepTitle(i + 1)} onCommit={set(i, 'title')} />
              <Words className="folio-slide-step-detail" value={s.detail} label={t.slides.stepDetail(i + 1)} onCommit={set(i, 'detail')} />
            </li>
          </Fragment>
        ))}
      </ol>
      {v.cycle && <p className="folio-slide-steps-cycle">{t.slides.cycle(v.steps[0]?.title ?? '')}</p>}
    </div>
  );
}

/** Two or three things side by side, each under its name with its own points, and the question asked of them under all. */
export function CompareView({ v, onChange }: { v: Compare; onChange?: (next: Compare) => void }) {
  const t = useT();
  const side = (i: number, next: Partial<Compare['sides'][number]>) => onChange?.({ ...v, sides: v.sides.map((s, k) => (k === i ? { ...s, ...next } : s)) });
  return (
    <div role="group" aria-label={t.slides.compareOf(v.sides.map((s) => s.title))}>
      <div className="folio-slide-compare" data-count={v.sides.length}>
        {v.sides.map((s, i) => (
          <section key={i} className="folio-slide-side">
            <Words className="folio-slide-side-title" value={s.title} label={t.slides.sideTitle(i + 1)} onCommit={onChange && ((text) => side(i, { title: text }))} />
            <ul>
              {s.points.map((p, k) => (
                <li key={k}>
                  <Words value={p} label={t.slides.sidePoint(s.title, k + 1)} onCommit={onChange && ((text) => side(i, { points: s.points.map((x, j) => (j === k ? text : x)) }))} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {(v.ask || onChange) && <Words className="folio-slide-ask" value={v.ask} label={t.slides.ask} onCommit={onChange && ((text) => onChange({ ...v, ask: text }))} />}
    </div>
  );
}
