import { lessonChecklist, type CheckItem, type Course, type Lesson } from '@folio/core';
import { useT } from '../../i18n';

/**
 * What Folio worked out on this lesson and what is the teacher's to look at before class: five lines at most, facts only.
 * With few notes left on a lesson, no note had come to look like no problem.
 */
export function LessonChecks({ course, lesson }: { course: Course; lesson: Lesson }) {
  const t = useT();
  const list = lessonChecklist(course, lesson);
  if (!list.checked.length && !list.look.length) return null;
  const say = (item: CheckItem) => t.lesson.checks[item.kind](item as never);
  return (
    <section aria-label={t.lesson.checks.title} className="no-print mt-4 rounded-control bg-well px-5 py-4 font-ui text-13 text-ink-2">
      <h2 className="mb-2 font-semibold text-ink">{t.lesson.checks.title}</h2>
      {list.look.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 marker:text-ink-3">
          {list.look.map((item) => (
            <li key={item.kind}>{say(item)}</li>
          ))}
        </ul>
      )}
      {list.checked.length > 0 && (
        <details className={list.look.length ? 'mt-2' : ''}>
          <summary className="cursor-pointer text-ink-2">{t.lesson.checks.worked}</summary>
          <ul className="mt-1 list-disc space-y-1 pl-5 marker:text-ink-3">
            {list.checked.map((item) => (
              <li key={item.kind}>{say(item)}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
