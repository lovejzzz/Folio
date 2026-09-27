import { cellState, enabledKinds, orderedLessons } from '@folio/core';
import { MaterialIcon, SegmentedControl, StatusMark, useMediaQuery } from '@folio/ui';
import { Link } from '@tanstack/react-router';
import { usePageTitle } from '../../app/usePageTitle';
import { useT } from '../../i18n';
import { usePrefs } from '../../state/prefs';
import { useCourse } from '../../state/session';
import { MapGrid } from './MapGrid';

/** On a phone the map is a list of lessons with a chip per material. */
function LessonList() {
  const t = useT();
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
            <span className="mt-3 flex flex-wrap gap-1.5">
              {enabledKinds(course).map((kind) => {
                const state = cellState(course, lesson, kind);
                return (
                  <span key={kind} className="flex h-6 items-center gap-1 rounded-full bg-well px-2 text-ink-2" title={t.materials[kind]}>
                    <MaterialIcon kind={kind} size={14} />
                    {state === 'attention' && <StatusMark kind="attention" label={t.map.attention} />}
                    {state === 'stale' && <StatusMark kind="stale" label={t.map.stale} />}
                    {state === 'empty' && <span className="sr-only">{t.map.notBuilt}</span>}
                    <span className="sr-only">{t.materials[kind]}</span>
                  </span>
                );
              })}
            </span>
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
          <p className="mt-3 font-ui text-14 text-ink-2">{meta.join(' · ')}</p>
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
