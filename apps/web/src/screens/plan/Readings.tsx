import { cmd, type Course, type Lesson } from '@folio/core';
import { IconButton, cx } from '@folio/ui';
import { X } from 'lucide-react';
import { useState } from 'react';
import { EditableText } from '../../components/editing/EditableText';
import { useT } from '../../i18n';
import { AddButton } from '../../materials/EditableList';
import { edit } from '../../state/edit';

/**
 * What students read before a lesson, one reading per line. "Add a reading"
 * opens an empty line with the caret in it; the reading joins the lesson only
 * once something is typed, and a reading cleared of its text goes.
 */
export function useReadings(lesson: Lesson, n: number) {
  const [drafting, setDrafting] = useState(false);
  const save = (readings: string[]) => edit([cmd('lesson.update', { lessonId: lesson.id, readings })], { key: 'editedReadings', values: { n } });
  return {
    drafting,
    /** Whether the block shows at all: only once there is a reading, or one is being written. */
    shown: lesson.readings.length > 0 || drafting,
    start: () => setDrafting(true),
    close: () => setDrafting(false),
    update: (i: number, text: string) => save(text.trim() ? lesson.readings.map((r, j) => (j === i ? text : r)) : lesson.readings.filter((_, j) => j !== i)),
    remove: (i: number) => save(lesson.readings.filter((_, j) => j !== i)),
    add: (text: string) => {
      if (text.trim()) save([...lesson.readings, text]);
    },
    /** A suggestion the teacher has checked joins the readings; either way it leaves the suggestions. */
    accept: (i: number) =>
      edit(
        [cmd('lesson.update', { lessonId: lesson.id, readings: [...lesson.readings, lesson.suggestedReadings[i]!], suggestedReadings: lesson.suggestedReadings.filter((_, j) => j !== i) })],
        { key: 'editedReadings', values: { n } },
      ),
    dismiss: (i: number) =>
      edit([cmd('lesson.update', { lessonId: lesson.id, suggestedReadings: lesson.suggestedReadings.filter((_, j) => j !== i) })], { key: 'editedReadings', values: { n } }),
  };
}

type Readings = ReturnType<typeof useReadings>;

interface ReadingsProps {
  course: Course;
  lesson: Lesson;
  n: number;
  readings: Readings;
}

/** The plan screen's compact form: a small label over quiet lines, under the objectives. */
export function PlanReadings({ course, lesson, n, readings }: ReadingsProps) {
  const t = useT();
  if (!readings.shown) return null;
  const line = 'flex items-start gap-2 font-ui text-13 leading-5 text-ink-2';
  return (
    <section className="mt-3" aria-label={t.plan.readingsOf(n)}>
      <h4 className="pl-5 font-ui text-12 text-ink-2">{t.plan.readings}</h4>
      <ul className="mt-1 space-y-1">
        {lesson.readings.map((r, i) => (
          <li key={i} className={cx('group/rd', line)}>
            <span aria-hidden className="mt-2.5 h-px w-3 shrink-0 bg-rule-strong" />
            <EditableText value={r} label={t.plan.readingOf(i + 1, n)} placeholder={t.plan.readingHint} lang={course.language} className="min-w-0 flex-1" onCommit={(text) => readings.update(i, text)} />
            <IconButton
              size="sm"
              label={t.plan.removeReading(i + 1, n)}
              tooltip={false}
              className="-my-0.5 size-6 opacity-0 group-focus-within/rd:opacity-100 group-hover/rd:opacity-100"
              onPress={() => readings.remove(i)}
            >
              <X size={14} strokeWidth={1.5} />
            </IconButton>
          </li>
        ))}
        {readings.drafting && (
          <li className={line} onBlur={readings.close}>
            <span aria-hidden className="mt-2.5 h-px w-3 shrink-0 bg-rule-strong" />
            <EditableText autoFocus value="" label={t.plan.readingOf(lesson.readings.length + 1, n)} placeholder={t.plan.readingHint} lang={course.language} className="min-w-0 flex-1" onCommit={readings.add} />
          </li>
        )}
      </ul>
    </section>
  );
}

/** The lesson screen's form, in the well beside the objectives. */
export function WellReadings({ course, lesson, n, readings }: ReadingsProps) {
  const t = useT();
  if (!readings.shown) return null;
  return (
    <section className="mt-5" aria-label={t.plan.readingsOf(n)}>
      <h2 className="mb-2 font-ui text-13 font-semibold text-ink">{t.lesson.beforeClass}</h2>
      <ul className="list-disc space-y-1 pl-5 marker:text-ink-3">
        {lesson.readings.map((r, i) => (
          <li key={i} className="group/rd relative pr-8">
            <EditableText value={r} label={t.plan.readingOf(i + 1, n)} placeholder={t.plan.readingHint} lang={course.language} onCommit={(text) => readings.update(i, text)} />
            {/* Out of the flow, so a reading's line is exactly an objective's. */}
            <IconButton
              size="sm"
              label={t.plan.removeReading(i + 1, n)}
              tooltip={false}
              className="no-print absolute right-0 top-0.5 size-6 opacity-0 group-focus-within/rd:opacity-100 group-hover/rd:opacity-100"
              onPress={() => readings.remove(i)}
            >
              <X size={13} strokeWidth={1.5} />
            </IconButton>
          </li>
        ))}
        {readings.drafting && (
          <li className="no-print" onBlur={readings.close}>
            <EditableText autoFocus value="" label={t.plan.readingOf(lesson.readings.length + 1, n)} placeholder={t.plan.readingHint} lang={course.language} onCommit={readings.add} />
          </li>
        )}
      </ul>
      <AddButton label={t.plan.addReading} onPress={readings.start} />
    </section>
  );
}

/**
 * Further reading the model proposed, set apart from what is assigned: a
 * dashed rule, a note to check it, and nothing printed or exported. "Add"
 * moves one into the readings once the teacher has checked it.
 */
export function SuggestedReadings({ course, lesson, n, readings, compact = false }: ReadingsProps & { compact?: boolean }) {
  const t = useT();
  if (!lesson.suggestedReadings.length) return null;
  // On the plan the note to check them is said once, at the first lesson with suggestions, not under every lesson.
  const hint = !compact || course.lessonOrder.find((id) => course.lessons[id]?.suggestedReadings.length) === lesson.id;
  return (
    <section className={cx('no-print', compact ? 'mt-3' : 'mt-5')} aria-label={t.plan.suggested}>
      <h4 className={cx('font-ui text-12 text-ink-2', compact && 'pl-5')}>
        {t.plan.suggested}
        {hint && <span className="text-ink-3"> · {t.plan.suggestedHint}</span>}
      </h4>
      <ul className="mt-1 space-y-1">
        {lesson.suggestedReadings.map((s, i) => (
          <li key={s} className="group/sg flex items-start gap-2 font-ui text-13 leading-5 text-ink-2">
            <span aria-hidden className="mt-2.5 w-3 shrink-0 border-t border-dashed border-rule-strong" />
            <span lang={course.language} className="min-w-0 flex-1">
              {s}
            </span>
            <button
              type="button"
              aria-label={t.plan.addSuggestedLabel(s, n)}
              onClick={() => readings.accept(i)}
              className="shrink-0 rounded-control px-1 font-ui text-12 leading-5 font-medium text-accent outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent"
            >
              {t.plan.addSuggested}
            </button>
            <IconButton
              size="sm"
              label={t.plan.dismissSuggested(s)}
              tooltip={false}
              className="-my-0.5 size-6 opacity-0 group-focus-within/sg:opacity-100 group-hover/sg:opacity-100"
              onPress={() => readings.dismiss(i)}
            >
              <X size={13} strokeWidth={1.5} />
            </IconButton>
          </li>
        ))}
      </ul>
    </section>
  );
}
