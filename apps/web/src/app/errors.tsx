import { Link, useParams, type ErrorComponentProps, type NotFoundRouteProps } from '@tanstack/react-router';
import { Button } from '@folio/ui';
import { useEffect, type ReactNode } from 'react';
import { useT } from '../i18n';
import { SimpleHeader } from '../components/AppHeader';
import { usePageTitle } from './usePageTitle';
import { COURSE_MISSING } from './lazyErrors';

export const linkClass = 'rounded-control font-ui text-14 font-medium text-accent underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent';

/** The message itself: a heading, a sentence and one way on. */
function MessageBody({ title, body, action }: { title: string; body?: string; action: ReactNode }) {
  usePageTitle(title);
  return (
    <div className="mx-auto max-w-md px-5 pt-24 pb-24 text-center">
      <h1 className="font-display text-36 leading-tight text-ink">{title}</h1>
      {body && <p className="mt-3 font-ui text-16 leading-relaxed text-ink-2">{body}</p>}
      <div className="mt-8 flex justify-center">{action}</div>
    </div>
  );
}

/** A whole page, for places outside a course. */
export function Message(props: { title: string; body?: string; action: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <SimpleHeader />
      <main id="main">
        <MessageBody {...props} />
      </main>
    </div>
  );
}


function isCourseMissing(data: unknown): boolean {
  return typeof data === 'object' && data !== null && (data as { reason?: unknown }).reason === COURSE_MISSING.reason;
}

export function CourseNotFound() {
  const t = useT();
  return (
    <Message
      title={t.errors.notFound}
      body={t.errors.notFoundHint}
      action={
        <Link to="/library" className={linkClass}>
          {t.nav.library}
        </Link>
      }
    />
  );
}

/** An address Folio doesn't have. */
export function PageNotFound() {
  const t = useT();
  return (
    <Message
      title={t.errors.pageNotFound}
      body={t.errors.pageNotFoundHint}
      action={
        <Link to="/" className={linkClass}>
          {t.errors.goHome}
        </Link>
      }
    />
  );
}

/**
 * For the course routes: a missing course gets a page of its own; an unknown
 * address inside a course that exists is shown under the course's header.
 */
export function CourseRouteNotFound({ data }: NotFoundRouteProps) {
  const t = useT();
  return isCourseMissing(data) ? <CourseNotFound /> : <InCourse title={t.errors.pageNotFound} body={t.errors.pageNotFoundHint} />;
}

/** Shown inside the course layout, under its header, with the way back to the map. */
function InCourse({ title, body }: { title: string; body: string }) {
  const t = useT();
  const { courseId } = useParams({ strict: false });
  return (
    <MessageBody
      title={title}
      body={body}
      action={
        courseId ? (
          <Link to="/c/$courseId/map" params={{ courseId }} className={linkClass}>
            {t.errors.openMap}
          </Link>
        ) : (
          <Link to="/library" className={linkClass}>
            {t.nav.library}
          </Link>
        )
      }
    />
  );
}

export function MaterialNotFound() {
  const t = useT();
  return <InCourse title={t.errors.materialNotFound} body={t.errors.materialNotFoundHint} />;
}

export function LessonNotFound() {
  const t = useT();
  return <InCourse title={t.errors.lessonNotFound} body={t.errors.lessonNotFoundHint} />;
}

export function RouteError({ error, reset }: ErrorComponentProps) {
  const t = useT();
  // The only log Folio writes: what went wrong, for whoever is helping the teacher.
  useEffect(() => console.error(error), [error]);
  return (
    <Message
      title={t.errors.generic}
      action={
        <span className="flex flex-wrap justify-center gap-2">
          <Button variant="primary" onPress={reset}>
            {t.common.retry}
          </Button>
          <Button onPress={() => window.location.assign('/library')}>{t.nav.library}</Button>
        </span>
      }
    />
  );
}
