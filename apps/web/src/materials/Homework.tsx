import { cmd, lessonNumber, type Course, type HomeworkKind, type Lesson } from '@folio/core';
import { cx } from '@folio/ui';
import { useT } from '../i18n';
import { edit } from '../state/edit';

const KINDS: HomeworkKind[] = ['assignment', 'step', 'test', 'inclass', 'none'];

/**
 * What students hand in from this lesson, and what it counts toward. The
 * outline sets it from how the brief says the course is marked; the teacher
 * changes it here, and the assignment follows.
 */
export function HomeworkPicker({ course, lesson, className = 'mb-5', underHeading = true }: { course: Course; lesson: Lesson; className?: string; underHeading?: boolean }) {
  const t = useT();
  const n = lessonNumber(course, lesson.id);
  const { kind, toward } = lesson.homework;
  const set = (next: HomeworkKind) => edit([cmd('lesson.homework', { lessonId: lesson.id, homework: { ...lesson.homework, kind: next } })], { key: 'setHomework', values: { n } });
  const due = lesson.homework.due && (kind === 'assignment' || kind === 'step') ? lessonNumber(course, lesson.homework.due) : 0;
  return (
    <div className={cx('no-print flex flex-wrap items-center gap-x-3 gap-y-1 font-ui text-13 text-ink-2', className)}>
      <label className="flex items-center gap-2">
        <span className="font-medium text-ink">{underHeading ? t.homework.thisLesson : t.homework.label}</span>
        <select
          value={kind}
          onChange={(e) => set(e.target.value as HomeworkKind)}
          className="h-8 rounded-control border border-field bg-paper px-2 text-13 text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {t.homework.kinds[k]}
            </option>
          ))}
        </select>
      </label>
      {kind !== 'none' && toward && <span>{kind === 'step' ? t.homework.stepToward('') : t.homework.countsToward('')}<span lang={course.language}>{toward}</span></span>}
      {due > 0 && <span>{t.homework.due(due)}</span>}
    </div>
  );
}

/** In place of an assignment or rubric the lesson doesn't set: says why, so the gap doesn't read as missing. */
export function NoWork({ lesson, kind }: { lesson: Lesson; kind: 'assignments' | 'rubrics' }) {
  const t = useT();
  const text = lesson.homework.kind === 'none' ? t.homework.none : lesson.homework.kind === 'test' ? t.homework.testNoRubric : t.homework.noRubric;
  return <p className="rounded-control bg-well px-4 py-3 font-ui text-14 text-ink-2">{kind === 'assignments' ? t.homework.none : text}</p>;
}
