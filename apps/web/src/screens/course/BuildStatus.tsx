import type { Course } from '@folio/core';
import { Button, StatusMark, cx } from '@folio/ui';
import { Button as AriaButton, Dialog as AriaDialog, DialogTrigger, Popover } from 'react-aria-components';
import { useT } from '../../i18n';
import { startBuild, stopBuild, useBuild } from '../../state/build';
import { estimateLines, estimateShort } from '../../state/estimate';
import { useCourse } from '../../state/session';
import { usePaying, usePlanEstimate } from '../plan/CreditsNote';

const linkClass =
  'rounded-control px-1 font-medium text-accent underline-offset-4 outline-none data-hovered:underline data-focus-visible:ring-2 data-focus-visible:ring-accent';

/** The one progress line: "Building lesson 3 of 6 · Stop". Never a log. */
export function BuildStatus() {
  const t = useT();
  const course = useCourse();
  const { running, stopping, currentLesson, courseId } = useBuild();
  const mine = courseId === course.id;
  if (running && mine) {
    return (
      <p className="flex min-w-0 items-center gap-2 font-ui text-13 text-ink-2" aria-live="polite">
        <StatusMark kind="building" label="" />
        {/* A phone has no room for the words, which came out as a lone "W"; the card below shows the progress there. */}
        <span className={cx('truncate', !stopping && 'sr-only sm:not-sr-only')}>{stopping ? t.build.stopping : t.build.progress(Math.max(1, currentLesson), course.lessonOrder.length)}</span>
        {!stopping && (
          <>
            <span aria-hidden className="hidden sm:inline">·</span>
            <AriaButton onPress={stopBuild} className={linkClass}>
              {t.common.stop}
            </AriaButton>
          </>
        )}
      </p>
    );
  }
  if (course.status === 'building') {
    return <Paused course={course} />;
  }
  return null;
}

/**
 * A build that stopped: what is left, about what it takes, and Resume. The figure is on the line on every screen, a
 * phone's too, and is a button: pressed, it opens the sentences behind it (who is paid, what else is written, how far
 * the figure can be trusted) with Resume under them. On a phone the figure was hidden and its sentences were a hover.
 */
function Paused({ course }: { course: Course }) {
  const t = useT();
  const pay = usePaying();
  const need = usePlanEstimate(course);
  if (!need.parts) return null;
  const lines = estimateLines(need, pay);
  return (
    <p className="flex min-w-0 items-center gap-x-2 whitespace-nowrap font-ui text-13 text-ink-2">
      {/* A phone's header has room for the figure and Resume, not for the words before them: those are read out, and are in what the figure opens. */}
      <span className="sr-only truncate sm:not-sr-only">{t.build.paused(need.parts)}</span>
      <span aria-hidden className="hidden sm:inline">·</span>
      <DialogTrigger>
        <AriaButton className={linkClass} data-estimate aria-label={estimateShort(need, pay)}>
          <span className="hidden sm:inline">{estimateShort(need, pay)}</span>
          <span className="sm:hidden" data-estimate-tight>
            {estimateShort(need, pay, true)}
          </span>
        </AriaButton>
        <Popover placement="bottom" offset={8} className="max-w-sm rounded-sheet bg-paper p-4 shadow-overlay">
          <AriaDialog aria-label={t.build.whatItTakes} className="grid gap-2 font-ui text-13 leading-5 text-ink outline-none">
            <p className="font-semibold">{t.build.paused(need.parts)}</p>
            {lines.map((line) => (
              <p key={line}>{line}</p>
            ))}
            <Button size="sm" variant="primary" className="justify-self-start" onPress={() => void startBuild()}>
              {t.build.resume}
            </Button>
          </AriaDialog>
        </Popover>
      </DialogTrigger>
      <span aria-hidden>·</span>
      <AriaButton onPress={() => void startBuild()} className={linkClass}>
        {t.build.resume}
      </AriaButton>
    </p>
  );
}
