import { enabledKinds, lessonObjectives, orderedLessons, sectionFor, type Course, type Lesson, type MaterialKind } from '@folio/core';
import { MaterialIcon, cx, tabBg } from '@folio/ui';
import { Link, useNavigate } from '@tanstack/react-router';
import { useRef, useState, type KeyboardEvent } from 'react';
import { useT } from '../../i18n';
import { retryCell, useBuild } from '../../state/build';
import { usePrefs } from '../../state/prefs';
import { useCourse } from '../../state/session';
import { cellView } from './cellInfo';
import { MapCell } from './MapCell';

function ColumnHeader({ kind, courseId }: { kind: MaterialKind; courseId: string }) {
  const t = useT();
  return (
    <div role="columnheader" className="flex items-end px-1">
      <Link
        to="/c/$courseId/m/$kind"
        params={{ courseId, kind }}
        aria-label={t.map.openMaterial(t.materials[kind])}
        className="group relative flex h-11 w-full items-center gap-2 overflow-hidden rounded-t-sheet bg-paper px-3 font-ui text-13 font-medium text-ink shadow-sheet outline-none transition-transform duration-200 ease-ink hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-accent"
      >
        <span aria-hidden className={cx('absolute inset-x-0 top-0 h-1', tabBg[kind])} />
        <MaterialIcon kind={kind} size={16} className="shrink-0 text-ink-2" />
        <span className="truncate">{t.materials[kind]}</span>
      </Link>
    </div>
  );
}

function HeaderRow({ kinds, courseId }: { kinds: MaterialKind[]; courseId: string }) {
  const t = useT();
  return (
    <div role="row" className="contents">
      <div role="columnheader" className="sticky left-0 z-10 flex items-end bg-desk px-2 pb-2 font-ui text-12 font-medium text-ink-2">
        {t.map.lessonColumn}
      </div>
      {kinds.map((kind) => (
        <ColumnHeader key={kind} kind={kind} courseId={courseId} />
      ))}
    </div>
  );
}

function RowHeader({ course, lesson, n, compact }: { course: Course; lesson: Lesson; n: number; compact: boolean }) {
  const t = useT();
  return (
    <div role="rowheader" className="sticky left-0 z-10 border-t border-rule bg-desk p-1 pr-4">
      <Link
        to="/c/$courseId/lesson/$lessonId"
        params={{ courseId: course.id, lessonId: lesson.id }}
        className={cx('group flex h-full gap-3 rounded-control p-2 outline-none hover:bg-well focus-visible:ring-2 focus-visible:ring-accent', compact ? 'items-center' : 'items-start')}
      >
        <span className="font-mono text-13 text-ink-3 tabular">{String(n).padStart(2, '0')}</span>
        <span className="min-w-0" lang={course.language}>
          <span className={cx('block font-reading text-16 font-semibold leading-snug text-ink group-hover:text-accent', compact ? 'truncate' : 'line-clamp-2')}>{lesson.title}</span>
          {!compact && (
            <span className="mt-1 block font-ui text-12 text-ink-2">
              {t.lesson.objectives} · {lessonObjectives(course, lesson).length}
            </span>
          )}
        </span>
      </Link>
    </div>
  );
}

/** Roving focus over the grid: arrow keys move between cells, Home and End jump along a row. */
function useGridFocus(rows: number, cols: number, grid: React.RefObject<HTMLDivElement | null>) {
  const [focus, setFocus] = useState({ row: 0, col: 0 });
  const move = (row: number, col: number) => {
    const r = Math.max(0, Math.min(rows - 1, row));
    const c = Math.max(0, Math.min(cols - 1, col));
    setFocus({ row: r, col: c });
    grid.current?.querySelectorAll<HTMLElement>('[data-cell]')[r * cols + c]?.focus();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const moves: Record<string, [number, number]> = { ArrowDown: [1, 0], ArrowUp: [-1, 0], ArrowRight: [0, 1], ArrowLeft: [0, -1] };
    const d = moves[e.key];
    if (d) {
      e.preventDefault();
      move(focus.row + d[0], focus.col + d[1]);
    } else if (e.key === 'Home') move(focus.row, 0);
    else if (e.key === 'End') move(focus.row, cols - 1);
  };
  return { focus, setFocus, onKeyDown };
}

/** The course as a grid: rows are lessons, columns are materials. Arrow keys move, Enter opens. */
export function MapGrid() {
  const t = useT();
  const course = useCourse();
  const navigate = useNavigate();
  const compact = usePrefs((s) => s.density) === 'compact';
  const { cells, errors, courseId } = useBuild();
  const lessons = orderedLessons(course);
  const kinds = enabledKinds(course);
  const gridRef = useRef<HTMLDivElement>(null);
  const { focus, setFocus, onKeyDown } = useGridFocus(lessons.length, kinds.length, gridRef);
  const runOf = (lessonId: string, kind: MaterialKind) => {
    const section = sectionFor(kind);
    return section && courseId === course.id ? cells[`${lessonId}:${section}`] : undefined;
  };
  return (
    <div className="overflow-x-auto pb-4" tabIndex={-1}>
      <div
        ref={gridRef}
        role="grid"
        aria-label={t.map.grid}
        aria-rowcount={lessons.length + 1}
        aria-colcount={kinds.length + 1}
        onKeyDown={onKeyDown}
        className="grid min-w-max"
        style={{ gridTemplateColumns: `minmax(14rem, 17rem) repeat(${kinds.length}, minmax(8.75rem, 1fr))` }}
      >
        <HeaderRow kinds={kinds} courseId={course.id} />
        {lessons.map((lesson, row) => (
          <div role="row" key={lesson.id} className="contents">
            <RowHeader course={course} lesson={lesson} n={row + 1} compact={compact} />
            {kinds.map((kind, col) => {
              const section = sectionFor(kind);
              return (
                <MapCell
                  key={kind}
                  course={course}
                  lesson={lesson}
                  kind={kind}
                  view={cellView(course, lesson, kind, runOf(lesson.id, kind))}
                  error={section ? errors[`${lesson.id}:${section}`] : undefined}
                  compact={compact}
                  focused={focus.row === row && focus.col === col}
                  onFocus={() => setFocus({ row, col })}
                  onOpen={() => void navigate({ to: '/c/$courseId/lesson/$lessonId', params: { courseId: course.id, lessonId: lesson.id }, search: { m: kind } })}
                  onBuild={() => section && retryCell(lesson.id, section)}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
