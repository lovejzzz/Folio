import type { FigureId, SlideVisual } from '@folio/core';
import { stillFigure } from '@folio/figures';
import { lazy, Suspense, type ComponentType, type LazyExoticComponent, type ReactNode } from 'react';
import { useT } from '../../i18n';
import { useFigureRun, type FigureRun } from './figureRun';

type Figure = Extract<SlideVisual, { kind: 'figure' }>;

/**
 * The demonstrations a slide can hold, each loaded when a slide first shows one. A course file names one of these and
 * gives it numbers; it cannot bring a drawing or a program of its own.
 */
const LIVE: Record<FigureId, LazyExoticComponent<ComponentType<{ run: FigureRun }>>> = {
  binarySearch: lazy(() => import('./BinarySearchFigure')),
  selectionSort: lazy(() => import('./BinarySearchFigure')),
};

/** A picture's own file as an address: an image is its own document, so the styles inside it are its own. */
export const svgAddress = (svg: string): string => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** Why there is no picture, in the interface's words: the demonstration cannot be shown, or the cabinet cannot draw it. */
function useReason(visual: Figure): string {
  const t = useT();
  const still = stillFigure(visual);
  return still.problem ? t.figures.problem[still.problem] : still.limit ? t.figures.limit[still.limit] : '';
}

/** The figure standing still at its first picture: in a thumbnail, a preview and on paper. */
export function FigureStill({ visual }: { visual: Figure }) {
  const reason = useReason(visual);
  const still = stillFigure(visual);
  const first = still.frames[0];
  if (reason || !first?.svg) return <p className="folio-figure-problem font-ui text-ink-2">{reason}</p>;
  return <img className="folio-figure-art" style={{ aspectRatio: `${still.width} / ${still.height}` }} src={svgAddress(first.svg)} alt={first.caption} />;
}

/** A slide's demonstration: worked where a run of it is held above the slide (the stage), still everywhere else. */
export function FigureView({ visual, live }: { visual: Figure; live: boolean }) {
  const run = useFigureRun();
  const reason = useReason(visual);
  const Live = LIVE[visual.figure];
  if (!live || !run || reason) return <FigureStill visual={visual} />;
  return (
    <Suspense fallback={<FigureStill visual={visual} />}>
      <Live run={run} />
    </Suspense>
  );
}

/**
 * Every picture of a demonstration, one under another, each with its sentence, and the steps as a table: what a page
 * that cannot move shows of it, on screen before printing and in the PDF. The same a Word file and a deck get.
 */
export function FigureFrames({ visual, table }: { visual: Figure; table: (head: string[], rows: string[][]) => ReactNode }) {
  const t = useT();
  const still = stillFigure(visual);
  // Unfinished or not searchable: the slide above says why, and there are no steps to give.
  if (still.problem) return null;
  return (
    <section className="px-4 py-3" aria-label={t.figures.frames}>
      <h4 className="mb-2 font-ui text-13 font-semibold text-ink">{t.figures.frames}</h4>
      {still.frames.map((frame, i) => (
        <figure key={i} className="avoid-break folio-figure-frame">
          {frame.svg && <img className="folio-figure-print" style={{ aspectRatio: `${still.width} / ${still.height}` }} src={svgAddress(frame.svg)} alt={frame.caption} />}
          <figcaption className="font-ui text-13 text-ink-2">{frame.caption}</figcaption>
        </figure>
      ))}
      {still.table.rows.length > 0 && table(still.table.columns, still.table.rows)}
    </section>
  );
}
