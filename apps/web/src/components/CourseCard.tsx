import { MATERIAL_KINDS } from '@folio/core';
import { tabBg, cx } from '@folio/ui';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { relativeTime, useT } from '../i18n';
import type { CourseSummary } from '../state/db';

/** A course as a paper card, its materials peeking out as binder tabs along the top. */
export function CourseCard({ course, menu }: { course: CourseSummary; menu?: ReactNode }) {
  const t = useT();
  const status = course.status === 'planning' ? t.library.planning : course.status === 'building' ? t.library.building : null;
  const to = course.status === 'planning' ? '/c/$courseId/plan' : '/c/$courseId/map';
  return (
    <div className="group relative pt-2">
      <div aria-hidden className="absolute left-5 right-10 top-0 flex gap-1">
        {MATERIAL_KINDS.filter((k) => course.kinds.includes(k)).map((k) => (
          <span key={k} className={cx('h-2.5 flex-1 rounded-t-control opacity-80 transition-transform duration-200 ease-ink group-hover:-translate-y-0.5', tabBg[k])} />
        ))}
      </div>
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
          <span aria-hidden>·</span>
          <span>{t.common.edited(relativeTime(course.updatedAt))}</span>
          {status && (
            <span className="rounded-full bg-well px-2 py-0.5 text-12 text-ink-2">{status}</span>
          )}
        </span>
      </Link>
      {menu && <div className="absolute right-2 top-4">{menu}</div>}
    </div>
  );
}
