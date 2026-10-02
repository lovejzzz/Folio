import { project, type Course } from '@folio/core';
import { Button } from '@folio/ui';
import { useEffect } from 'react';
import { DocView } from '../../components/DocView';
import { useT } from '../../i18n';
import { activeStore } from '../../state/session';
import { checkOwnSyllabus, checkStateOf, useSyllabusCheck } from '../../state/syllabusCheck';

/**
 * The syllabus the teacher brought: Folio's check of it first, then the syllabus as they wrote it. A check cut
 * short (the teacher left before it was done) runs again here; one that keeps failing waits for the teacher.
 */
export function OwnSyllabus({ course }: { course: Course }) {
  const t = useT();
  const unchecked = Boolean(course.syllabus && !course.syllabus.check);
  const state = useSyllabusCheck((s) => s[course.id]) ?? checkStateOf(course.id);
  const failed = unchecked && !state.running && state.failures >= 2;
  useEffect(() => {
    const store = activeStore();
    if (unchecked && store) checkOwnSyllabus(store);
    // Again after a first failure; after the second, checkOwnSyllabus waits for the teacher to ask.
  }, [course.id, unchecked, state.failures]);
  const again = () => {
    const store = activeStore();
    if (store) checkOwnSyllabus(store, true);
  };
  return (
    <>
      {failed ? (
        <div role="note" className="mb-6 flex max-w-prose flex-wrap items-center gap-3 font-ui text-14 leading-6 text-ink-2">
          <p>{t.ownSyllabus.failed}</p>
          <Button onPress={again}>{t.ownSyllabus.checkAgain}</Button>
        </div>
      ) : (
        <p className="mb-6 max-w-prose font-ui text-14 leading-6 text-ink-2">{unchecked ? t.ownSyllabus.introChecking : t.ownSyllabus.intro}</p>
      )}
      {/* A check that failed has nothing to show: only the syllabus, not a "checking" line that isn't so. */}
      <DocView doc={project(course, 'syllabus', { audience: failed ? 'student' : 'teacher' })} showTitle={false} />
    </>
  );
}
