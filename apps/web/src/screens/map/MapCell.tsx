import { sectionFor, type Course, type Lesson, type MaterialKind } from '@folio/core';
import { StatusMark, cx } from '@folio/ui';
import { useT } from '../../i18n';
import { InlineText } from '../../components/InlineText';
import { useSmoothText } from '../../lib/useSmoothText';
import { useLive } from '../../state/live';
import { cellMetric, cellPreview, cellReason, livePreview, type CellView } from './cellInfo';

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

/**
 * A section being written: its opening words appear as they are written, in the place and type they keep
 * once it is done, with its count going up beneath. Until the first words arrive, the placeholder.
 */
function LiveBody({ liveKey, kind, lang, compact }: { liveKey: string; kind: MaterialKind; lang: string; compact: boolean }) {
  const t = useT();
  const partial = useLive((s) => s.partial[liveKey]);
  const running = useLive((s) => s.rows[liveKey]?.stage === 'running');
  const checking = useLive((s) => s.rows[liveKey]?.stage === 'checking') || running;
  const preview = partial === undefined ? null : livePreview(kind, partial, t);
  const shown = useSmoothText(preview?.text ?? '');
  if (!preview || (!preview.text && !preview.metric)) return <Placeholder view="building" compact={compact} />;
  return (
    <>
      {!compact && (
        <span lang={lang} className="line-clamp-3 w-0 min-w-full font-reading text-13 leading-snug text-ink-2">
          {shown}
          {!checking && <span aria-hidden className="ml-0.5 inline-block h-3 w-0.5 translate-y-0.5 animate-caret rounded-full bg-accent" />}
        </span>
      )}
      <span className="flex w-full items-center gap-1.5 text-12 text-ink-2">
        <StatusMark kind="building" label="" />
        <span key={running ? 'running' : checking ? 'checking' : 'writing'} className={cx('truncate tabular', checking ? 'animate-shimmer' : 'animate-fade-in')}>
          {running ? t.map.running : checking ? t.map.checking : preview.metric || t.map.building}
        </span>
      </span>
    </>
  );
}

/** A lesson that sets no homework, or a step with no rubric: nothing is missing, so the cell is quiet, not dashed. */
function NoWork({ kind }: { kind: MaterialKind }) {
  const t = useT();
  return <span className="text-12 text-ink-2">{kind === 'rubrics' ? t.homework.noRubricShort : t.homework.kinds.none}</span>;
}

/** A count, or in its place what needs doing: a cell out of date says so in words, not only with a mark. */
function CellCaption({ view, metric, reason }: { view: CellView; metric: string; reason: string }) {
  const t = useT();
  if (view === 'ready') return <span className="w-full truncate text-12 text-ink-2 tabular">{metric}</span>;
  const stale = view === 'stale';
  return (
    <span className={cx('flex w-full items-center gap-1.5 text-12 font-medium', stale ? 'text-ink' : 'text-attention')}>
      <StatusMark kind={stale ? 'stale' : 'attention'} label={reason} />
      <span aria-hidden className="truncate">{stale ? t.map.stale : t.map.attention}</span>
    </span>
  );
}

/** A cell's frame: a sheet once written (or while it is written before your eyes), dashed while it waits. */
function cellClass(view: CellView, built: boolean, live: boolean, settled: boolean, compact: boolean): string {
  return cx(
    'group flex w-full justify-between gap-2 rounded-control border p-3 text-left font-ui outline-none transition duration-200 ease-ink',
    compact ? 'h-full min-h-12 flex-row items-center' : 'h-full min-h-28 flex-col items-start',
    (built || live) && 'border-transparent bg-paper shadow-sheet',
    built && 'hover:shadow-overlay',
    view === 'none' && 'border-transparent bg-well/60 hover:bg-well',
    !built && !live && view !== 'none' && 'border-dashed border-rule-strong hover:border-accent',
    view === 'error' && 'border-critical/50',
    'focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-desk',
    built && !settled && 'animate-reveal',
  );
}

/** One lesson × material cell: the opening words of what it holds, a count, and what needs doing. */
export function MapCell({ course, lesson, kind, view, error, compact, focused, onOpen, onBuild, onFocus }: MapCellProps) {
  const t = useT();
  const built = view === 'ready' || view === 'attention' || view === 'stale';
  const section = sectionFor(kind);
  const liveKey = section ? `${lesson.id}:${section}` : '';
  // Written before your eyes: shown as a sheet already, and settling in place when done rather than fading in.
  const live = useLive((s) => view === 'building' && liveKey in s.partial);
  const settled = useLive((s) => Boolean(s.streamed[liveKey]));
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
        className={cellClass(view, built, live, settled, compact)}
      >
        {built ? (
          <>
            {/* Zero intrinsic width: the preview wraps to its column and never widens it, so the map keeps its columns once built. */}
            {!compact && (
              <span lang={course.language} className={cx('line-clamp-3 w-0 min-w-full font-reading text-13 leading-snug', view === 'stale' ? 'text-ink-2' : 'text-ink', settled && 'animate-settle')}>
                <InlineText text={cellPreview(course, lesson, kind)} />
              </span>
            )}
            <CellCaption view={view} metric={cellMetric(course, lesson, kind, t)} reason={reason} />
          </>
        ) : live ? (
          <LiveBody liveKey={liveKey} kind={kind} lang={course.language} compact={compact} />
        ) : view === 'none' ? (
          <NoWork kind={kind} />
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
