import { lessonNumber, type Course } from '@folio/core';
import { StatusMark, cx, tabBg } from '@folio/ui';
import { Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useT, type Messages } from '../../i18n';
import { useBuild } from '../../state/build';
import { finishedRows, useLive, workingRows, type LiveRow } from '../../state/live';
import { useCourse } from '../../state/session';
import { cellMetric, livePreview } from './cellInfo';

/** Two finished parts are enough to see the work land without the card becoming a log; a phone shows one. */
const FINISHED = 2;

function RowName({ row, course }: { row: LiveRow; course: Course }) {
  const t = useT();
  return (
    <>
      <span aria-hidden className={cx('h-3.5 w-1 shrink-0 rounded-full', tabBg[row.kind])} />
      <span className="shrink-0 font-ui text-13 text-ink">{t.build.live.row(lessonNumber(course, row.lessonId), t.materialOne[row.kind])}</span>
    </>
  );
}

/** A part being written: its count goes up as it is written, then the plan's check. */
function WorkingRow({ row, index }: { row: LiveRow; index: number }) {
  const t = useT();
  const course = useCourse();
  const partial = useLive((s) => s.partial[row.key]);
  const checking = row.stage === 'checking' && !row.checked;
  const metric = partial === undefined ? '' : livePreview(row.kind, partial, t).metric;
  const detail = checking ? t.build.live.checking : metric || t.build.live.writing;
  return (
    <li className={cx('flex animate-pop-in items-center gap-2.5', index >= 2 && 'hidden sm:flex')}>
      <RowName row={row} course={course} />
      <span key={checking ? 'checking' : 'writing'} className={cx('ml-auto min-w-0 truncate font-ui text-12 text-ink-2 tabular', checking || !metric ? 'animate-shimmer' : 'animate-fade-in')}>
        {detail}
      </span>
    </li>
  );
}

/** What a finished part holds, and for a plan what the check did. */
function finishedDetail(row: LiveRow, course: Course, t: Messages): string {
  if (row.stage === 'failed') return t.build.live.failed;
  const lesson = course.lessons[row.lessonId];
  const metric = lesson ? cellMetric(course, lesson, row.kind, t) : '';
  const review = !row.checked ? '' : row.fixes.length ? t.build.live.fixed(row.fixes.length) : row.notes ? t.build.live.notes(row.notes) : t.build.live.checked;
  return [metric, review].filter(Boolean).join(' · ');
}

function FinishedRow({ row, index }: { row: LiveRow; index: number }) {
  const t = useT();
  const course = useCourse();
  const failed = row.stage === 'failed';
  const fix = row.fixes[0];
  return (
    <li className={cx('animate-pop-in', index >= 1 && 'hidden sm:block', index === FINISHED - 1 && 'opacity-60')}>
      <span className="flex items-center gap-2.5">
        <RowName row={row} course={course} />
        {failed ? <StatusMark kind="error" label="" className="ml-auto" /> : <Check aria-hidden size={14} strokeWidth={2.5} className="ml-auto shrink-0 text-good" />}
      </span>
      <span className={cx('mt-0.5 block truncate pl-3.5 font-ui text-12 tabular', failed ? 'text-critical' : 'text-ink-2')}>{finishedDetail(row, course, t)}</span>
      {fix && (
        <span lang={course.language} className="mt-1 line-clamp-2 pl-3.5 font-reading text-12 italic leading-snug text-ink-2">
          {fix}
        </span>
      )}
    </li>
  );
}

/** Stays a moment after the run ends, so it leaves rather than vanishes. */
function useLingering(on: boolean, ms: number): { shown: boolean; leaving: boolean } {
  const [was, setWas] = useState(on);
  const [gone, setGone] = useState(!on);
  if (on !== was) {
    setWas(on);
    if (on) setGone(false);
  }
  useEffect(() => {
    if (on) return;
    const timer = setTimeout(() => setGone(true), ms);
    return () => clearTimeout(timer);
  }, [on, ms]);
  return { shown: on || !gone, leaving: !on && !gone };
}

/**
 * The course being written, as it happens: how far along it is, what is being written now, and what was just
 * finished, the plan's check among them. The rows change in place; it is never a log.
 */
export function LiveFeed() {
  const t = useT();
  const course = useCourse();
  const { running, courseId, done, total } = useBuild();
  const rows = useLive((s) => s.rows);
  const { shown, leaving } = useLingering(running && courseId === course.id, 400);
  if (!shown) return null;
  const working = workingRows(rows);
  const finished = finishedRows(rows, FINISHED);
  return (
    <>
      {/* Room at the end of the page, so the card can be scrolled clear of the last lesson. */}
      <div aria-hidden className="h-40 sm:h-72" />
      <section
        aria-label={t.build.live.label}
        className={cx(
          'no-print fixed inset-x-4 bottom-4 z-40 rounded-sheet bg-paper shadow-overlay sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-80',
          leaving ? 'animate-fade-out' : 'animate-sheet-up',
        )}
      >
        <div className="flex items-center gap-2 px-4 pb-2.5 pt-3.5">
          <StatusMark kind="building" label="" />
          <span className="font-ui text-13 font-medium text-ink">{t.build.live.title}</span>
          <span className="ml-auto font-ui text-12 text-ink-2 tabular">{t.build.live.parts(done, total)}</span>
        </div>
        <div aria-hidden className="mx-4 h-0.5 overflow-hidden rounded-full bg-rule">
          <div className="h-full origin-left rounded-full bg-accent transition-transform duration-500 ease-ink" style={{ transform: `scaleX(${total ? done / total : 0})` }} />
        </div>
        {working.length > 0 && (
          <ol className="space-y-2 px-4 pt-3.5">
            {working.map((row, i) => (
              <WorkingRow key={row.key} row={row} index={i} />
            ))}
          </ol>
        )}
        {finished.length > 0 && (
          <ol className="mx-4 mt-3.5 space-y-3 border-t border-rule pt-3.5">
            {finished.map((row, i) => (
              <FinishedRow key={row.key} row={row} index={i} />
            ))}
          </ol>
        )}
        <div className="h-4" />
      </section>
    </>
  );
}
