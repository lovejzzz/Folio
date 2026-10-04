import { cx } from '@folio/ui';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { relativeTime, useT } from '../i18n';
import type { CourseSummary } from '../state/db';

/** How far each sheet under the card shows, deepest last; a little further while the card is hovered. */
const SHEETS = [
  'translate-x-1 translate-y-1 group-hover:translate-x-1.5 group-hover:translate-y-1.5',
  'translate-x-2 translate-y-2 group-hover:translate-x-3 group-hover:translate-y-3',
  'translate-x-3 translate-y-3 group-hover:translate-x-4.5 group-hover:translate-y-4.5',
];

/** A bigger course is a thicker stack: one sheet under a short unit, three under a year's course. */
export function sheetsFor(lessons: number): number {
  if (lessons <= 0) return 0;
  return lessons < 8 ? 1 : lessons < 20 ? 2 : 3;
}

/** A course as a stack of paper: its size shows in how many sheets lie under it, never in colour. */
export function CourseCard({ course, menu }: { course: CourseSummary; menu?: ReactNode }) {
  const t = useT();
  // A written course with notes still on it says so: without this it looked finished from here.
  const status = course.status === 'planning' ? t.library.planning : course.status === 'building' ? t.library.building : course.toCheck ? t.library.toCheck(course.toCheck) : null;
  const to = course.status === 'planning' ? '/c/$courseId/plan' : '/c/$courseId/map';
  const sheets = SHEETS.slice(0, sheetsFor(course.lessonCount)).reverse();
  return (
    <div className="group relative pb-3 pr-3">
      <div className="relative">
        {sheets.map((place) => (
          <span key={place} aria-hidden className={cx('absolute inset-0 rounded-sheet border border-rule-strong bg-paper transition-transform duration-200 ease-ink', place)} />
        ))}
        <Link
          to={to}
          params={{ courseId: course.id }}
          className="relative flex min-h-36 flex-col rounded-sheet bg-paper p-5 shadow-sheet outline-none transition-shadow duration-200 ease-ink hover:shadow-overlay focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-desk"
        >
          <span lang={course.language} className="line-clamp-2 pr-6 font-display text-22 leading-7 text-ink">
            {course.title || t.common.untitled}
          </span>
          <span className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-4 font-ui text-13 text-ink-2">
            <span>{t.common.lessons(course.lessonCount)}</span>
            {course.kinds.length > 0 && (
              <>
                <span aria-hidden>·</span>
                <span>{t.library.materialCount(course.kinds.length)}</span>
              </>
            )}
            <span aria-hidden>·</span>
            <span>{t.common.edited(relativeTime(course.updatedAt))}</span>
            {status && <span className="rounded-full bg-well px-2 py-0.5 text-12 text-ink-2">{status}</span>}
          </span>
        </Link>
      </div>
      {menu && <div className="absolute right-5 top-2">{menu}</div>}
    </div>
  );
}
