import type { FigureId, SlideVisual } from '@folio/core';
import { binarySearch, binarySearchProblem } from '@folio/core';
import { keyframes, renderFrame, stillFigure } from '@folio/figures';
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
};

/** A picture's own file as an address: an image is its own document, so the styles inside it are its own. */
export const svgAddress = (svg: string): string => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** The figure standing still at its first picture: in a thumbnail, a preview and on paper. */
export function FigureStill({ visual }: { visual: Figure }) {
  const t = useT();
  const problem = binarySearchProblem(visual);
  if (problem) return <p className="folio-figure-problem font-ui text-ink-2">{t.figures.problem[problem]}</p>;
  const model = binarySearch(visual);
  const first = keyframes(model)[0]!;
  return <img className="folio-figure-art" src={svgAddress(renderFrame(model, first))} alt={first.caption} />;
}

/** A slide's demonstration: worked where a run of it is held above the slide (the stage), still everywhere else. */
export function FigureView({ visual, live }: { visual: Figure; live: boolean }) {
  const run = useFigureRun();
  const Live = LIVE[visual.figure];
  if (!live || !run) return <FigureStill visual={visual} />;
  return (
    <Suspense fallback={<FigureStill visual={visual} />}>
      <Live run={run} />
    </Suspense>
  );
}

/**
 * Every picture of a demonstration, one under another, each with its sentence, and the steps as a table: what a page
 * that cannot move shows of it, on screen before printing and in the PDF. The same pictures a Word file and a deck get.
 */
export function FigureFrames({ visual, table }: { visual: Figure; table: (head: string[], rows: string[][]) => ReactNode }) {
  const t = useT();
  const still = stillFigure(visual);
  if (still.problem) return null;
  return (
    <section className="px-4 py-3" aria-label={t.figures.frames}>
      <h4 className="mb-2 font-ui text-13 font-semibold text-ink">{t.figures.frames}</h4>
      {still.frames.map((frame, i) => (
        <figure key={i} className="avoid-break folio-figure-frame">
          <img className="folio-figure-print" src={svgAddress(frame.svg)} alt={frame.caption} />
          <figcaption className="font-ui text-13 text-ink-2">{frame.caption}</figcaption>
        </figure>
      ))}
      {still.table.rows.length > 0 && table(still.table.columns, still.table.rows)}
    </section>
  );
}
