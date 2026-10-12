import { IconButton, useMediaQuery } from '@folio/ui';
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, Pause, Play, RotateCcw } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { useT } from '../../i18n';
import { useFigureRun } from './figureRun';

const Large = lazy(() => import('./BinarySearchFigure'));

/** Under the slide: the sentence for the picture the demonstration is at, and the buttons that work it. */
export function FigureControls() {
  const t = useT();
  const run = useFigureRun();
  // On a screen in the hand the slide is two hundred pixels high and its picture smaller still: there the larger
  // picture is open from the start. Anywhere, one button opens and closes it.
  const narrow = useMediaQuery('(max-width: 767px)');
  const [chosen, setChosen] = useState<boolean | null>(null);
  if (!run) return null;
  const { at, last } = run;
  const open = chosen ?? narrow;
  return (
    <div className="no-print mt-3 grid gap-2" data-owns-arrows role="group" aria-label={t.figures.controls} onKeyDown={run.onKey}>
      {open && (
        <Suspense fallback={null}>
          <Large run={run} large />
        </Suspense>
      )}
      <FigureStrip />
      <p className="folio-figure-caption font-ui text-14 leading-5 text-ink" aria-live="polite">
        {run.frames[at]!.caption}
      </p>
      <div className="flex items-center justify-center gap-1">
        <IconButton label={t.figures.reset} isDisabled={at === 0} onPress={() => run.go(0)}>
          <RotateCcw size={16} strokeWidth={1.5} />
        </IconButton>
        <IconButton label={t.figures.back} isDisabled={at === 0} onPress={() => run.go(at - 1)}>
          <ChevronLeft size={16} strokeWidth={1.5} />
        </IconButton>
        <span className="px-1 font-ui text-12 tabular-nums text-ink-2">{t.figures.stepOf(at, last)}</span>
        <IconButton label={t.figures.step} isDisabled={at >= last} onPress={() => run.go(at + 1)}>
          <ChevronRight size={16} strokeWidth={1.5} />
        </IconButton>
        <IconButton label={run.running ? t.figures.pause : t.figures.play} isDisabled={last === 0} onPress={run.toggle}>
          {run.running ? <Pause size={16} strokeWidth={1.5} /> : <Play size={16} strokeWidth={1.5} />}
        </IconButton>
        <IconButton label={open ? t.figures.smaller : t.figures.larger} onPress={() => setChosen(!open)}>
          {open ? <Minimize2 size={16} strokeWidth={1.5} /> : <Maximize2 size={16} strokeWidth={1.5} />}
        </IconButton>
      </div>
    </div>
  );
}

/**
 * The list at this step as a row of numbers a hand-held screen can read: each with its position, those set aside
 * dimmed and struck through, the one being compared outlined. The picture on a phone is three hundred pixels wide and
 * its labels are small; this says the same step from the same pose in type of the page's own size, and it is what
 * shows the numbers when the picture cannot hold them.
 */
function FigureStrip() {
  const t = useT();
  const run = useFigureRun();
  if (!run) return null;
  const { state } = run.frames[run.at]!.pose;
  return (
    <div className="grid justify-items-center gap-1">
      <ol className="folio-figure-strip font-ui" aria-label={t.figures.strip}>
        {run.values.map((value, i) => (
          <li key={i} data-state={state[i]} aria-label={`${t.figures.place(i + 1)}: ${value}, ${t.figures.states[state[i] ?? 'play']}`}>
            <span aria-hidden className="folio-figure-strip-place">
              {i + 1}
            </span>
            <span aria-hidden className="folio-figure-strip-value tabular-nums">
              {String(value)}
            </span>
          </li>
        ))}
      </ol>
      <p className="font-ui text-13 text-ink-2">{t.figures.looking(String(run.target))}</p>
    </div>
  );
}
