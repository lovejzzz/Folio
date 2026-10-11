import { binarySearch, binarySearchProblem, type SlideVisual } from '@folio/core';
import { keyframes, type Keyframe } from '@folio/figures';
import { useMediaQuery } from '@folio/ui';
import { createContext, useContext, useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';

type Figure = Extract<SlideVisual, { kind: 'figure' }>;

/** How long a step is held when the search plays by itself. */
const HOLD_MS = 2400;

/**
 * A demonstration being worked: which picture it is at, and whether it is playing. Held above the slide, because the
 * picture is on the slide and the sentence and the buttons are under it: on a phone a slide is two hundred pixels
 * high, and all three inside it covered one another.
 */
export interface FigureRun {
  values: number[];
  target: number;
  frames: Keyframe[];
  at: number;
  last: number;
  running: boolean;
  /** Nothing slides: the reader has asked for less motion. */
  still: boolean;
  go: (to: number) => void;
  toggle: () => void;
  onKey: (e: KeyboardEvent<HTMLElement>) => void;
}

const Run = createContext<FigureRun | null>(null);
export const useFigureRun = (): FigureRun | null => useContext(Run);

function Running({ visual, children }: { visual: Figure; children: ReactNode }) {
  const frames = useMemo(() => keyframes(binarySearch(visual)), [visual]);
  const [at, setAt] = useState(0);
  const [playing, setPlaying] = useState(false);
  const still = useMediaQuery('(prefers-reduced-motion: reduce)');
  const last = frames.length - 1;
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
  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    const moves: Record<string, () => void> = { ArrowRight: () => go(at + 1), ArrowLeft: () => go(at - 1), Home: () => go(0), End: () => go(last) };
    // The space bar plays or pauses from the figure itself; on one of its buttons it presses that button.
    const act = moves[e.key] ?? (e.key === ' ' && e.target === e.currentTarget ? toggle : undefined);
    if (!act || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    act();
  };
  return <Run.Provider value={{ values: visual.values, target: visual.target, frames, at, last, running, still, go, toggle, onKey }}>{children}</Run.Provider>;
}

/** Everything inside can work the demonstration; a list that cannot be searched has nothing to work. */
export function FigureRunProvider({ visual, children }: { visual: Figure; children: ReactNode }) {
  if (binarySearchProblem(visual)) return <>{children}</>;
  // A new list or target starts the search again from its first picture.
  return (
    <Running key={`${visual.values.join(',')}|${visual.target}`} visual={visual}>
      {children}
    </Running>
  );
}
