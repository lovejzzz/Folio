import { isMaterialKind, type MaterialKind } from '@folio/core';
import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  notFound,
  redirect,
} from '@tanstack/react-router';
import { GOOGLE_RETURN_PATH, SIGN_IN_PATH } from '../lib/googlePath';
import { Home } from '../screens/home/Home';
import { COURSE_MISSING, CourseRouteNotFound, MaterialNotFound, PageNotFound, RouteError } from './lazyErrors';
import { RootLayout } from './RootLayout';

/**
 * Every place in the app has a URL, so back, forward, bookmarks and shared
 * links all work: /c/:courseId/map, /c/:courseId/lesson/:lessonId, /c/:courseId/m/:kind.
 */

const rootRoute = createRootRoute({ component: RootLayout, errorComponent: RouteError, notFoundComponent: PageNotFound });

const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: Home });

const newRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/new',
  component: lazyRouteComponent(() => import('../screens/plan/NewCourse'), 'NewCourse'),
});

const libraryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/library',
  component: lazyRouteComponent(() => import('../screens/library/Library'), 'Library'),
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: lazyRouteComponent(() => import('../screens/settings/Settings'), 'Settings'),
});

const privacyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/privacy',
  component: lazyRouteComponent(() => import('../screens/privacy/Privacy'), 'Privacy'),
});

const aboutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/about',
  component: lazyRouteComponent(() => import('../screens/about/About'), 'About'),
});

const termsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/terms',
  component: lazyRouteComponent(() => import('../screens/terms/Terms'), 'Terms'),
});

export const courseRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/c/$courseId',
  loader: async ({ params }) => {
    const { loadSession } = await import('../state/session');
    const store = await loadSession(params.courseId);
    if (!store) throw notFound({ data: COURSE_MISSING });
    return null;
  },
  notFoundComponent: CourseRouteNotFound,
  component: lazyRouteComponent(() => import('../screens/course/CourseLayout'), 'CourseLayout'),
});

const courseIndexRoute = createRoute({
  getParentRoute: () => courseRoute,
  path: '/',
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/c/$courseId/map', params });
  },
});

const planRoute = createRoute({
  getParentRoute: () => courseRoute,
  path: 'plan',
  component: lazyRouteComponent(() => import('../screens/plan/PlanScreen'), 'PlanScreen'),
});

const mapRoute = createRoute({
  getParentRoute: () => courseRoute,
  path: 'map',
  component: lazyRouteComponent(() => import('../screens/map/MapScreen'), 'MapScreen'),
});

export const lessonRoute = createRoute({
  getParentRoute: () => courseRoute,
  path: 'lesson/$lessonId',
  validateSearch: (search: Record<string, unknown>): { m?: MaterialKind } =>
    typeof search.m === 'string' && isMaterialKind(search.m) ? { m: search.m } : {},
  component: lazyRouteComponent(() => import('../screens/lesson/LessonScreen'), 'LessonScreen'),
});

/** Which lesson to open a material at and, for slides, which slide (counted from 1 within that lesson). */
export interface MaterialSearch {
  lesson?: string;
  slide?: number;
}

export const materialRoute = createRoute({
  getParentRoute: () => courseRoute,
  path: 'm/$kind',
  params: {
    parse: (raw: { kind: string }) => {
      if (!isMaterialKind(raw.kind)) throw notFound();
      return { kind: raw.kind };
    },
    stringify: (p: { kind: MaterialKind }) => ({ kind: p.kind }),
  },
  // Shown inside the course layout: the course is fine, only the material is unknown.
  notFoundComponent: MaterialNotFound,
  validateSearch: (search: Record<string, unknown>): MaterialSearch => {
    const slide = Number(search.slide);
    return {
      ...(typeof search.lesson === 'string' ? { lesson: search.lesson } : {}),
      ...(Number.isInteger(slide) && slide >= 1 ? { slide } : {}),
    };
  },
  component: lazyRouteComponent(() => import('../screens/material/MaterialScreen'), 'MaterialScreen'),
});

export interface PrintSearch {
  kinds: MaterialKind[];
  audience: 'student' | 'teacher';
  lessons?: string[];
}

/** What to put on paper, or in a Google Doc. */
const exportSearch = (search: Record<string, unknown>): PrintSearch => ({
  kinds: (Array.isArray(search.kinds) ? search.kinds : []).filter((k): k is MaterialKind => typeof k === 'string' && isMaterialKind(k)),
  audience: search.audience === 'teacher' ? 'teacher' : 'student',
  ...(Array.isArray(search.lessons) ? { lessons: search.lessons.filter((l): l is string => typeof l === 'string') } : {}),
});

export const printRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/print/$courseId',
  validateSearch: exportSearch,
  loader: async ({ params }) => {
    const { loadSession } = await import('../state/session');
    const store = await loadSession(params.courseId);
    if (!store) throw notFound({ data: COURSE_MISSING });
    return null;
  },
  notFoundComponent: CourseRouteNotFound,
  component: lazyRouteComponent(() => import('../screens/print/PrintScreen'), 'PrintScreen'),
});

/** Signing in with Google: the small window that goes to Google and comes back. */
const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: SIGN_IN_PATH,
  component: lazyRouteComponent(() => import('../screens/account/SignInScreen'), 'SignInScreen'),
});

/** The tab that makes a Google Doc. Export opens it with what to export; Google sends the teacher back to it with none. */
export const googleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: GOOGLE_RETURN_PATH,
  validateSearch: (search: Record<string, unknown>): Partial<PrintSearch> & { course?: string } =>
    typeof search.course === 'string' ? { course: search.course, ...exportSearch(search) } : {},
  component: lazyRouteComponent(() => import('../screens/google/GoogleExportScreen'), 'GoogleExportScreen'),
});

const routeTree = rootRoute.addChildren([
  homeRoute,
  newRoute,
  libraryRoute,
  settingsRoute,
  privacyRoute,
  termsRoute,
  aboutRoute,
  printRoute,
  googleRoute,
  signInRoute,
  courseRoute.addChildren([courseIndexRoute, planRoute, mapRoute, lessonRoute, materialRoute]),
]);

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  scrollRestoration: true,
  defaultPendingMinMs: 0,
  defaultNotFoundComponent: PageNotFound,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
