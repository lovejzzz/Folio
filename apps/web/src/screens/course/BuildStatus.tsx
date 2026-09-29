import { missingTargets } from '@folio/ai';
import { StatusMark, cx } from '@folio/ui';
import { Button as AriaButton } from 'react-aria-components';
import { useT } from '../../i18n';
import { startBuild, stopBuild, useBuild } from '../../state/build';
import { useCourse } from '../../state/session';

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
    const left = missingTargets(course).length;
    if (!left) return null;
    return (
      <p className="flex min-w-0 items-center gap-2 font-ui text-13 text-ink-2">
        <span className="truncate">{t.build.paused(left)}</span>
        <span aria-hidden>·</span>
        <AriaButton onPress={() => void startBuild()} className={linkClass}>
          {t.build.resume}
        </AriaButton>
      </p>
    );
  }
  return null;
}
