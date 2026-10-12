import { between, cabinetReadWidth, figureBody, flatReadWidth, flatView, VIEW, type Pose } from '@folio/figures';
import { useEffect, useRef, useState } from 'react';
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

/** The part of the cabinet's picture that has anything in it, top to bottom, at every step of a search. */
const CABINET_BAND = { top: 36, height: 290 };

/**
 * Binary search at the picture its run is at: stepped with the arrow keys when it has the focus. On a slide it is as
 * large as the slide leaves it; `large` is the same picture at a size a person reads on the screen in hand, in a frame
 * that scrolls sideways when the screen is narrower than that, and that keeps the number being compared in view.
 */
export default function BinarySearchFigure({ run, large = false }: { run: FigureRun; large?: boolean }) {
  const t = useT();
  const host = useDrawn(run);
  const frame = useRef<HTMLDivElement>(null);
  useEffect(adoptFigureStyles, []);
  // The row of numbers is as tall as its rows; the cabinet has one measure.
  const view = run.look === 'flat' ? flatView(run.values) : VIEW;
  // The larger cabinet leaves out the empty paper over and under it: the room goes to the labels.
  const top = large && run.look !== 'flat' ? CABINET_BAND.top : 0;
  const tall = large && run.look !== 'flat' ? CABINET_BAND.height : view.height;
  const width = run.look === 'flat' ? flatReadWidth(run.values) : cabinetReadWidth(run.values, run.target);
  useEffect(() => {
    if (!large) return;
    // Once the parts have come to rest: bring the number compared (or found) to the middle of the frame.
    const id = setTimeout(() => {
      const box = frame.current;
      // Its numeral and not its whole drawing: a drawer's drawing takes in the clips over it.
      const held = box?.querySelector('[data-state="look"], [data-state="found"]');
      const cell = held?.querySelector('[data-part="value"], path[class*="fig-w"]') ?? held;
      if (!box || !cell) return void box?.scrollTo({ left: 0 });
      const at = cell.getBoundingClientRect();
      const own = box.getBoundingClientRect();
      box.scrollTo({ left: box.scrollLeft + at.left + at.width / 2 - own.left - own.width / 2, behavior: run.still ? 'auto' : 'smooth' });
    }, run.still ? 0 : 760);
    return () => clearTimeout(id);
  }, [large, run.at, run.still]);
  // Wider than its frame: said, since a phone shows no scroll bar until the picture is touched.
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const box = frame.current;
    if (!box) return;
    const see = () => setWide(box.scrollWidth > box.clientWidth + 1);
    see();
    const watch = new ResizeObserver(see);
    watch.observe(box);
    return () => watch.disconnect();
  }, [large, width]);
  const art = <svg ref={host} className={large ? 'iso-svg folio-figure-wide' : 'iso-svg folio-figure-art'} style={{ ...(large && { minWidth: `${width}px` }), aspectRatio: `${view.width} / ${tall}` }} viewBox={`0 ${top} ${view.width} ${tall}`} role="img" aria-label={run.frames[run.at]!.caption} />;
  if (!large) {
    return (
      <div className="folio-figure iso" data-theme="light" data-owns-arrows role="group" aria-label={t.figures.binarySearch} tabIndex={0} onKeyDown={run.onKey}>
        {art}
      </div>
    );
  }
  return (
    <>
      <div ref={frame} className="folio-figure-large iso" data-theme="light" data-owns-arrows role="group" aria-label={t.figures.large} tabIndex={0} onKeyDown={run.onKey}>
        {art}
      </div>
      {wide && <p className="text-center font-ui text-12 text-ink-2">{t.figures.sideways}</p>}
    </>
  );
}
