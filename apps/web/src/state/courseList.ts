import { useEffect, useState } from 'react';
import { listCourses, onCourseWrite, type CourseSummary } from './db';

/**
 * The courses in this browser, kept current: a save or delete here, a save in another tab, or a course
 * arriving from or leaving with the teacher's account all show at once. Null until first read.
 */
export function useCourseList(): CourseSummary[] | null {
  const [courses, setCourses] = useState<CourseSummary[] | null>(null);
  useEffect(() => {
    let live = true;
    const read = () =>
      void listCourses()
        .then((all) => live && setCourses(all))
        .catch(() => live && setCourses([]));
    read();
    const off = onCourseWrite(read);
    const others = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('folio.courses');
    others?.addEventListener('message', read);
    return () => {
      live = false;
      off();
      others?.close();
    };
  }, []);
  return courses;
}
