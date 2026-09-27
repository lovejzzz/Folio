import { Outlet } from '@tanstack/react-router';
import { useEffect } from 'react';
import { CommandBar } from '../../components/command/CommandBar';
import { DrawerHost } from '../../components/drawers/DrawerHost';
import { SelectionToolbar } from '../../components/selection/SelectionToolbar';
import { useCourse } from '../../state/session';
import { useUi } from '../../state/ui';
import { ConflictBanner } from './ConflictBanner';
import { CourseHeader } from './CourseHeader';
import { useCourseKeys } from './useCourseKeys';

export function CourseLayout() {
  const course = useCourse();
  useCourseKeys();
  useEffect(() => {
    document.title = `${course.title || 'Folio'} · Folio`;
    return () => {
      document.title = 'Folio';
    };
  }, [course.title]);
  useEffect(() => () => useUi.getState().openDrawer(null), []);
  return (
    <div className="min-h-dvh">
      <CourseHeader />
      <ConflictBanner />
      <div className="flex items-start">
        <main id="main" className="min-w-0 flex-1">
          <Outlet />
        </main>
        <DrawerHost />
      </div>
      <CommandBar />
      <SelectionToolbar />
    </div>
  );
}
