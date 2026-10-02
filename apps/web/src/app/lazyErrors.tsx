import type { ErrorComponentProps, NotFoundRouteProps } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';

/**
 * The router's error and not-found pages, loaded only when one is shown: nearly every visit never needs them,
 * so they stay out of the first page's JavaScript.
 */
const load = () => import('./errors');
const LazyRouteError = lazy(() => load().then((m) => ({ default: m.RouteError })));
const LazyPageNotFound = lazy(() => load().then((m) => ({ default: m.PageNotFound })));
const LazyCourseRouteNotFound = lazy(() => load().then((m) => ({ default: m.CourseRouteNotFound })));
const LazyMaterialNotFound = lazy(() => load().then((m) => ({ default: m.MaterialNotFound })));

/** Thrown by a course loader when the course isn't in this browser; anything else under /c/ is an unknown page. */
export const COURSE_MISSING = { reason: 'course' } as const;

export const RouteError = (props: ErrorComponentProps) => (
  <Suspense fallback={null}>
    <LazyRouteError {...props} />
  </Suspense>
);
export const PageNotFound = () => (
  <Suspense fallback={null}>
    <LazyPageNotFound />
  </Suspense>
);
export const CourseRouteNotFound = (props: NotFoundRouteProps) => (
  <Suspense fallback={null}>
    <LazyCourseRouteNotFound {...props} />
  </Suspense>
);
export const MaterialNotFound = () => (
  <Suspense fallback={null}>
    <LazyMaterialNotFound />
  </Suspense>
);
