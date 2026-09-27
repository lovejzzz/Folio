import { Fragment } from 'react';
import { Sep } from '../../components/Sep';
import { cellState, enabledKinds, orderedLessons, type Lesson } from '@folio/core';
import { MaterialIcon, SegmentedControl, StatusMark, cx, useMediaQuery } from '@folio/ui';
import { Link } from '@tanstack/react-router';
import { usePageTitle } from '../../app/usePageTitle';
import { useT } from '../../i18n';
import { usePrefs } from '../../state/prefs';
import { useCourse } from '../../state/session';
import { MapGrid } from './MapGrid';

/**
 * Ten grey icons said nothing on a phone, where there is no hover. Only the
 * materials that need something are named; a lesson with nothing to do shows
 * nothing, rather than the same "all ready" line on every card.
 */
function MaterialStates({ lesson }: { lesson: Lesson }) {
  const t = useT();
  const course = useCourse();
  const kinds = enabledKinds(course);
  const pending = kinds.map((kind) => ({ kind, state: cellState(course, lesson, kind) })).filter((k) => k.state !== 'ready');
  if (pending.length === 0) return null;
  return (
    <span className="mt-3 flex flex-wrap gap-1.5">
      {pending.map(({ kind, state }) => (
        <span key={kind} className={cx('flex h-6 items-center gap-1 rounded-full bg-well px-2 font-ui text-12 text-ink-2', state === 'empty' && 'opacity-70')}>
          <MaterialIcon kind={kind} size={14} />
          {t.materialOne[kind]}
          {state === 'attention' && <StatusMark kind="attention" label={t.map.attention} />}
          {state === 'stale' && <StatusMark kind="stale" label={t.map.stale} />}
          {state === 'empty' && <span className="sr-only">{t.map.notBuilt}</span>}
        </span>
      ))}
    </span>
  );
}

/** On a phone the map is a list of lessons, naming only the materials that need something. */
function LessonList() {
  const course = useCourse();
  return (
    <ol className="space-y-3">
      {orderedLessons(course).map((lesson, i) => (
        <li key={lesson.id}>
          <Link
            to="/c/$courseId/lesson/$lessonId"
            params={{ courseId: course.id, lessonId: lesson.id }}
            className="block rounded-sheet bg-paper p-4 shadow-sheet outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <span className="font-mono text-12 text-ink-2">{String(i + 1).padStart(2, '0')}</span>
            <span lang={course.language} className="mt-0.5 block font-reading text-17 font-semibold leading-snug text-ink">
              {lesson.title}
            </span>
            <MaterialStates lesson={lesson} />
          </Link>
        </li>
      ))}
    </ol>
  );
}

export function MapScreen() {
  const t = useT();
  const course = useCourse();
  const phone = useMediaQuery('(max-width: 767px)');
  const { density, set } = usePrefs();
  usePageTitle(t.materials.map, course.title || t.common.untitled);
  const meta = [course.audience.level, t.common.lessons(course.lessonOrder.length), t.common.minutes(course.shape.minutesPerLesson)].filter(Boolean);
  return (
    <div className="px-4 pb-24 pt-8 md:px-8 md:pt-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 max-w-3xl" lang={course.language}>
          <h1 className="font-display text-36 leading-tight text-ink md:text-48 md:leading-none">{course.title}</h1>
          <p className="mt-3 font-ui text-14 text-ink-2">
            {meta.map((part, i) => (
              <Fragment key={part}>
                {i > 0 && <Sep />}
                {part}
              </Fragment>
            ))}
          </p>
        </div>
        {!phone && (
          <SegmentedControl
            label={t.map.density}
            value={density}
            onChange={(d) => set({ density: d })}
            options={[
              { id: 'comfortable', label: t.map.comfortable },
              { id: 'compact', label: t.map.compact },
            ]}
          />
        )}
      </div>
      {course.lessonOrder.length === 0 ? (
        <p className="font-ui text-14 text-ink-2">{t.map.empty}</p>
      ) : phone ? (
        <>
          <p className="mb-4 font-ui text-13 text-ink-2">{t.map.phoneHint}</p>
          <LessonList />
        </>
      ) : (
        <MapGrid />
      )}
    </div>
  );
}
