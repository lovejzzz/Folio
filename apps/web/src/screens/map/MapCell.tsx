import { sectionFor, type Course, type Lesson, type MaterialKind } from '@folio/core';
import { StatusMark, cx } from '@folio/ui';
import { useT } from '../../i18n';
import { cellMetric, cellReason, type CellView } from './cellInfo';
import { Thumb } from './Thumb';

interface MapCellProps {
  course: Course;
  lesson: Lesson;
  kind: MaterialKind;
  view: CellView;
  error?: string;
  compact: boolean;
  focused: boolean;
  onOpen: () => void;
  onBuild: () => void;
  onFocus: () => void;
}

function Placeholder({ view, compact }: { view: CellView; compact: boolean }) {
  const t = useT();
  if (view === 'building' || view === 'queued') {
    return (
      <span className="flex w-full flex-col gap-2">
        {!compact && (
          <span aria-hidden className="flex w-full flex-col gap-1">
            <span className={cx('h-1.5 w-full rounded-full bg-rule', view === 'building' && 'animate-shimmer')} />
            <span className={cx('h-1.5 w-3/4 rounded-full bg-rule', view === 'building' && 'animate-shimmer')} />
          </span>
        )}
        <span className="flex items-center gap-1.5 text-12 text-ink-2">
          {view === 'building' && <StatusMark kind="building" label="" />}
          {view === 'building' ? t.map.building : t.map.queued}
        </span>
      </span>
    );
  }
  return <span className="text-12 text-ink-2">{view === 'error' ? t.map.failed : t.map.notBuilt}</span>;
}

/** One lesson × material cell: a miniature, a count, and at most one status mark. */
export function MapCell({ course, lesson, kind, view, error, compact, focused, onOpen, onBuild, onFocus }: MapCellProps) {
  const t = useT();
  const built = view === 'ready' || view === 'attention' || view === 'stale';
  const canBuild = (view === 'empty' || view === 'error') && sectionFor(kind) !== null;
  const reason = cellReason(course, lesson, kind, view, t, error);
  const metric = built ? cellMetric(course, lesson, kind, t) : '';
  const detail = metric ? `${metric}${t.common.period}${reason}` : reason;
  const label = t.map.cellLabel(t.common.lesson(course.lessonOrder.indexOf(lesson.id) + 1), t.materials[kind], detail);
  return (
    <div role="gridcell" className="relative p-1">
      <button
        type="button"
        data-cell
        tabIndex={focused ? 0 : -1}
        aria-label={label}
        title={view === 'ready' ? undefined : reason}
        onFocus={onFocus}
        onClick={canBuild ? onBuild : onOpen}
        className={cx(
          'group flex w-full justify-between gap-2 rounded-control p-3 text-left font-ui outline-none transition-shadow duration-120 ease-ink',
          compact ? 'h-12 flex-row items-center' : 'h-24 flex-col items-start',
          built && 'bg-paper shadow-sheet hover:shadow-overlay',
          !built && 'border border-dashed border-rule-strong hover:border-accent',
          view === 'error' && 'border-critical/50',
          'focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-desk',
          built && 'animate-reveal',
        )}
      >
        {built ? (
          <>
            {/* Zero intrinsic width: a thumbnail wraps to its column and never widens it, so the map keeps its columns once built. */}
            {!compact && (
              <span className="block w-0 min-w-full">
                <Thumb course={course} lesson={lesson} kind={kind} />
              </span>
            )}
            <span className="flex w-full items-center justify-between gap-2 text-12 text-ink-2 tabular">
              <span className="truncate">{cellMetric(course, lesson, kind, t)}</span>
              {view !== 'ready' && <StatusMark kind={view === 'stale' ? 'stale' : 'attention'} label={reason} />}
            </span>
          </>
        ) : (
          <>
            <Placeholder view={view} compact={compact} />
            {canBuild && (
              <span className="text-12 font-medium text-accent opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                {view === 'error' ? t.common.retry : t.map.build}
              </span>
            )}
          </>
        )}
      </button>
    </div>
  );
}
