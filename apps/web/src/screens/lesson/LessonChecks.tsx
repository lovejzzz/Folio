import { cmd, gradingWithOwn, lessonChecklist, ownNeeds, type CheckItem, type Course, type Lesson } from '@folio/core';
import { Button } from '@folio/ui';
import { edit } from '../../state/edit';
import { useT } from '../../i18n';

/**
 * What Folio worked out on this lesson and what is the teacher's to look at before class: five lines at most, facts only.
 * With few notes left on a lesson, no note had come to look like no problem.
 */
/**
 * Graded work this lesson leans on that Folio did not write: the teacher says when they have it, and until then the
 * lesson's materials are marked on the map as needing a look. Said once it is in hand; taken back the same way.
 */
function OwnWork({ course, lesson }: { course: Course; lesson: Lesson }) {
  const t = useT();
  const needs = ownNeeds(course, [lesson.id]);
  if (!needs.length) return null;
  const open = needs.filter((n) => !n.confirmed);
  const set = (own: boolean) => edit([cmd('course.update', { grading: gradingWithOwn(course, needs.map((n) => n.piece), own) })], { key: 'editedGrading' });
  return (
    <p className="mb-3 flex flex-wrap items-center gap-2">
      <span>{open.length ? t.lesson.checks.ownOpen : t.lesson.checks.ownHave}</span>
      <Button size="sm" variant="secondary" onPress={() => set(open.length > 0)}>
        {open.length ? t.lesson.checks.ownConfirm : t.lesson.checks.ownUndo}
      </Button>
    </p>
  );
}

export function LessonChecks({ course, lesson }: { course: Course; lesson: Lesson }) {
  const t = useT();
  const list = lessonChecklist(course, lesson);
  if (!list.checked.length && !list.look.length && !list.ready.length) return null;
  const say = (item: CheckItem) => t.lesson.checks[item.kind](item as never);
  return (
    <section aria-label={t.lesson.checks.title} className="no-print mt-4 rounded-control bg-well px-5 py-4 font-ui text-13 text-ink-2">
      {list.ready.length > 0 && (
        <>
          <h2 className="mb-2 font-semibold text-ink">{t.lesson.checks.ready}</h2>
          <ul className="mb-3 list-disc space-y-1 pl-5 marker:text-ink-3">
            {list.ready.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <OwnWork course={course} lesson={lesson} />
        </>
      )}
      {(list.look.length > 0 || list.checked.length > 0) && <h2 className="mb-2 font-semibold text-ink">{t.lesson.checks.title}</h2>}
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
