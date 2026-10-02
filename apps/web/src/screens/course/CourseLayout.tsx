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
  useCourseKeys();
  useEffect(() => () => useUi.getState().openDrawer(null), []);
  // The Chinese face is a hundred font files' worth of CSS: fetched for a course written in Chinese, not for every page.
  const chinese = useCourse().language === 'zh-CN';
  useEffect(() => {
    if (chinese) void import('@fontsource/noto-serif-sc/400.css');
  }, [chinese]);
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
