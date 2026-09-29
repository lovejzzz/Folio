import { useEffect, useRef, useState } from 'react';

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** How much of `target` to show next, from what is shown now: a sixth of the way each frame, at least a letter. */
export function nextShown(shown: string, target: string): string {
  let common = 0;
  while (common < shown.length && shown[common] === target[common]) common++;
  // Revised text (a repair, a fix) keeps what the two share and goes on from there.
  const kept = target.slice(0, common);
  const behind = target.length - kept.length;
  return behind > 0 ? target.slice(0, kept.length + Math.max(1, Math.ceil(behind / 6))) : kept;
}

/**
 * Text that arrives a few words at a time, shown as though typed: each frame it closes part of the gap to what
 * has arrived, faster the further behind it is, so it reads smoothly and never lags. With reduced motion, it
 * is simply the text.
 */
export function useSmoothText(target: string): string {
  const [still] = useState(reducedMotion);
  const [shown, setShown] = useState(target);
  const current = useRef(target);
  useEffect(() => {
    if (still) return;
    let frame = 0;
    const tick = () => {
      const next = nextShown(current.current, target);
      if (next !== current.current) {
        current.current = next;
        setShown(next);
      }
      if (next !== target) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, still]);
  return still ? target : shown;
}
