import { project, type Course } from '@folio/core';
import { useEffect } from 'react';
import { DocView } from '../../components/DocView';
import { useT } from '../../i18n';
import { activeStore } from '../../state/session';

/**
 * The syllabus the teacher brought: Folio's check of it first, then the syllabus as they wrote it. A check cut
 * short (the teacher left before it was done) runs again here.
 */
export function OwnSyllabus({ course }: { course: Course }) {
  const t = useT();
  const unchecked = Boolean(course.syllabus && !course.syllabus.check);
  useEffect(() => {
    const store = activeStore();
    if (unchecked && store) void import('../../state/syllabusCheck').then((m) => m.checkOwnSyllabus(store));
  }, [course.id, unchecked]);
  return (
    <>
      <p className="mb-6 max-w-prose font-ui text-14 leading-6 text-ink-2">{unchecked ? t.ownSyllabus.introChecking : t.ownSyllabus.intro}</p>
      <DocView doc={project(course, 'syllabus', { audience: 'teacher' })} showTitle={false} />
    </>
  );
}
