import { binarySearch, binarySearchProblem } from '@folio/core';
import { between, keyframes, sceneBody, VIEW, type Keyframe, type Pose } from '@folio/figures';
import { IconButton, useMediaQuery } from '@folio/ui';
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useT } from '../../i18n';
import { adoptFigureStyles } from './figureStyles';

/** How long a part takes to reach its place, and how long a step is held when the search plays by itself. */
const MOVE_MS = 700;
const HOLD_MS = 2400;
const ease = (t: number) => t * t * (3 - 2 * t);

interface Props {
  values: number[];
  target: number;
}

/**
 * The picture, drawn into the SVG by hand and not through React: while a drawer slides the whole drawing is made again
 * some sixty times a second from the pose, and nothing else on the page need hear of it.
 */
function useDrawn(values: number[], target: number, frames: Keyframe[], at: number, still: boolean) {
  const host = useRef<SVGSVGElement>(null);
  const shown = useRef<Pose | null>(null);
  useEffect(() => {
    const to = frames[at]!.pose;
    const from = shown.current;
    const draw = (pose: Pose) => {
      if (host.current) host.current.innerHTML = sceneBody({ values, target, pose });
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
  }, [values, target, frames, at, still]);
  return host;
}

function Live({ values, target }: Props) {
  const t = useT();
  const frames = useMemo(() => keyframes(binarySearch({ values, target })), [values, target]);
  const [at, setAt] = useState(0);
  const [playing, setPlaying] = useState(false);
  const still = useMediaQuery('(prefers-reduced-motion: reduce)');
  const last = frames.length - 1;
  const host = useDrawn(values, target, frames, at, still);
  useEffect(adoptFigureStyles, []);
  // Playing ends by itself at the last picture: nothing is left to wait for.
  const running = playing && at < last;
  useEffect(() => {
    if (!running) return;
    const id = setTimeout(() => setAt((a) => Math.min(last, a + 1)), HOLD_MS);
    return () => clearTimeout(id);
  }, [running, at, last]);
  const go = (to: number) => {
    setPlaying(false);
    setAt(Math.max(0, Math.min(last, to)));
  };
  const toggle = () => {
    if (at >= last) setAt(0);
    setPlaying(!running);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, () => void> = { ArrowRight: () => go(at + 1), ArrowLeft: () => go(at - 1), Home: () => go(0), End: () => go(last) };
    // The space bar plays or pauses from the figure itself; on one of its buttons it presses that button.
    const act = moves[e.key] ?? (e.key === ' ' && e.target === e.currentTarget ? toggle : undefined);
    if (!act || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    act();
  };
  return (
    <div className="folio-figure iso" data-theme="light" data-owns-arrows role="group" aria-label={t.figures.binarySearch} tabIndex={0} onKeyDown={onKey}>
      <svg ref={host} className="iso-svg folio-figure-art" viewBox={`0 0 ${VIEW.width} ${VIEW.height}`} role="img" aria-label={frames[at]!.caption} />
      <p className="folio-figure-caption font-ui text-ink" aria-live="polite">
        {frames[at]!.caption}
      </p>
      <div className="no-print folio-figure-tools flex items-center justify-center gap-1">
        <IconButton label={t.figures.reset} isDisabled={at === 0} onPress={() => go(0)}>
          <RotateCcw size={16} strokeWidth={1.5} />
        </IconButton>
        <IconButton label={t.figures.back} isDisabled={at === 0} onPress={() => go(at - 1)}>
          <ChevronLeft size={16} strokeWidth={1.5} />
        </IconButton>
        <span className="font-ui text-12 tabular-nums text-ink-2">{t.figures.stepOf(at, last)}</span>
        <IconButton label={t.figures.step} isDisabled={at >= last} onPress={() => go(at + 1)}>
          <ChevronRight size={16} strokeWidth={1.5} />
        </IconButton>
        <IconButton label={running ? t.figures.pause : t.figures.play} isDisabled={last === 0} onPress={toggle}>
          {running ? <Pause size={16} strokeWidth={1.5} /> : <Play size={16} strokeWidth={1.5} />}
        </IconButton>
      </div>
    </div>
  );
}

/** Binary search on a slide: stepped through, played, or read a step at a time with the arrow keys. */
export default function BinarySearchFigure({ values, target }: Props) {
  const t = useT();
  const problem = binarySearchProblem({ values, target });
  if (problem) return <p className="folio-figure-problem font-ui text-ink-2">{t.figures.problem[problem]}</p>;
  // A new list or target starts the search again from its first picture.
  return <Live key={`${values.join(',')}|${target}`} values={values} target={target} />;
}
