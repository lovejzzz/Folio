import { between, figureBody, FLAT_VIEW, VIEW, type Pose } from '@folio/figures';
import { useEffect, useRef } from 'react';
import { useT } from '../../i18n';
import { adoptFigureStyles } from './figureStyles';
import type { FigureRun } from './figureRun';

/** How long a part takes to reach its place. */
const MOVE_MS = 700;
const ease = (t: number) => t * t * (3 - 2 * t);

/**
 * The picture, drawn into the SVG by hand and not through React: while a drawer slides the whole drawing is made again
 * some sixty times a second from the pose, and nothing else on the page need hear of it.
 */
function useDrawn({ values, target, look, frames, at, still }: FigureRun) {
  const host = useRef<SVGSVGElement>(null);
  const shown = useRef<Pose | null>(null);
  useEffect(() => {
    const to = frames[at]!.pose;
    const from = shown.current;
    const draw = (pose: Pose) => {
      if (host.current) host.current.innerHTML = figureBody({ values, target, pose }, look);
      shown.current = pose;
    };
    if (still || !from || from.pull.length !== to.pull.length) return draw(to);
    const start = performance.now();
    let raf = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - start) / MOVE_MS);
      draw(t < 1 ? between(from, to, ease(t)) : to);
      if (t < 1) raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [values, target, look, frames, at, still]);
  return host;
}

/** Binary search on a slide, at the picture its run is at: stepped with the arrow keys when it has the focus. */
export default function BinarySearchFigure({ run }: { run: FigureRun }) {
  const t = useT();
  const host = useDrawn(run);
  useEffect(adoptFigureStyles, []);
  return (
    <div className="folio-figure iso" data-theme="light" data-owns-arrows role="group" aria-label={t.figures.binarySearch} tabIndex={0} onKeyDown={run.onKey}>
      <svg ref={host} className="iso-svg folio-figure-art" data-look={run.look} viewBox={`0 0 ${(run.look === 'flat' ? FLAT_VIEW : VIEW).width} ${(run.look === 'flat' ? FLAT_VIEW : VIEW).height}`} role="img" aria-label={run.frames[run.at]!.caption} />
    </div>
  );
}
