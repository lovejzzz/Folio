import { figureText } from '../../i18n/figureText';
import { useCallback, useEffect, useRef, useState } from 'react';
import { adoptFigureStyles } from './figureStyles';
import type { FigureRun } from './figureRun';

/** How long a part takes to reach its place. */
const MOVE_MS = 700;
const ease = (t: number) => t * t * (3 - 2 * t);

/**
 * The picture, drawn into the SVG by hand and not through React: while a drawer slides the whole drawing is made again
 * some sixty times a second from the pose, and nothing else on the page need hear of it.
 */
function useDrawn({ visual, kind, frames, at, still }: FigureRun, onRest: () => void) {
  const host = useRef<SVGSVGElement>(null);
  const shown = useRef<{ pose: unknown; of: FigureRun['frames'] } | null>(null);
  useEffect(() => {
    const to = frames[at]!.pose;
    // A pose is its own demonstration's: one left by other numbers is not a place to start from.
    const from = shown.current?.of === frames ? shown.current.pose : null;
    const draw = (pose: unknown) => {
      if (host.current) host.current.innerHTML = kind.body(visual, pose);
      shown.current = { pose, of: frames };
    };
    // Come to rest: said, so that what waits for the parts to stand still does not go by a clock.
    const rest = (pose: unknown) => (draw(pose), onRest());
    if (still || from === null) return rest(to);
    const start = performance.now();
    let raf = 0;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      rest(to);
    };
    raf = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - start) / MOVE_MS);
      if (t >= 1) return finish();
      draw(kind.between(from, to, ease(t)));
      raf = requestAnimationFrame(tick);
    });
    // A page that is not being painted (a tab behind another, a busy machine) is given few frames or none: the step
    // still ends where it should, a moment after its time, whether or not a frame came to end it.
    const late = setTimeout(finish, MOVE_MS + 80);
    return () => {
      done = true;
      cancelAnimationFrame(raf);
      clearTimeout(late);
    };
  }, [visual, kind, frames, at, still, onRest]);
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
  // Counts each time the picture comes to rest at a step.
  const [rested, setRested] = useState(0);
  const onRest = useCallback(() => setRested((n) => n + 1), []);
  const host = useDrawn(run, onRest);
  const frame = useRef<HTMLDivElement>(null);
  useEffect(adoptFigureStyles, []);
  // The row of numbers is as tall as its rows; the cabinet has one measure.
  const view = run.kind.view(run.visual);
  const cabinet = run.visual.figure === 'binarySearch' && run.visual.look === 'cabinet';
  // The larger cabinet leaves out the empty paper over and under it: the room goes to the labels.
  const top = large && cabinet ? CABINET_BAND.top : 0;
  const tall = large && cabinet ? CABINET_BAND.height : view.height;
  const width = run.kind.readWidth(run.visual);
  useEffect(() => {
    if (!large) return;
    // The parts have come to rest: bring the number compared (or found) to the middle of the frame. Timed by a clock, a
    // busy page was asked while the drawer was still on its way, and the frame went to the wrong place or back to the start.
    const box = frame.current;
    // In the combined picture: the number in the row, which is what is read.
    const held = box?.querySelector('[data-layer="reading"] [data-state="look"], [data-layer="reading"] [data-state="found"], [data-layer="reading"] [data-state="min"]') ?? box?.querySelector('[data-state="look"], [data-state="found"], [data-state="min"]');
    // Its numeral and not its whole drawing: a drawer's drawing takes in the clips over it.
    const cell = held?.querySelector('[data-part="value"], .fig-numeral') ?? held;
    if (!box || !cell) return void box?.scrollTo({ left: 0 });
    const at = cell.getBoundingClientRect();
    const own = box.getBoundingClientRect();
    box.scrollTo({ left: box.scrollLeft + at.left + at.width / 2 - own.left - own.width / 2, behavior: run.still ? 'auto' : 'smooth' });
  }, [large, rested, run.still]);
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
      <div className="folio-figure iso" data-theme="light" data-owns-arrows role="group" aria-label={figureText.names[run.visual.figure]} tabIndex={0} onKeyDown={run.onKey}>
        {art}
      </div>
    );
  }
  return (
    <>
      <div ref={frame} className="folio-figure-large iso" data-theme="light" data-owns-arrows role="group" aria-label={figureText.large} tabIndex={0} onKeyDown={run.onKey}>
        {art}
      </div>
      {wide && <p className="text-center font-ui text-12 text-ink-2">{figureText.sideways}</p>}
    </>
  );
}
