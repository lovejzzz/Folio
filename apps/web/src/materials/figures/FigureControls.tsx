import { IconButton } from '@folio/ui';
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from 'lucide-react';
import { useT } from '../../i18n';
import { useFigureRun } from './figureRun';

/** Under the slide: the sentence for the picture the demonstration is at, and the buttons that work it. */
export function FigureControls() {
  const t = useT();
  const run = useFigureRun();
  if (!run) return null;
  const { at, last } = run;
  return (
    <div className="no-print mt-3 grid gap-2" data-owns-arrows role="group" aria-label={t.figures.controls} onKeyDown={run.onKey}>
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
      </div>
    </div>
  );
}
