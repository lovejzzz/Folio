import { cmd, isBlankLesson, lessonObjectives, type Course, type Lesson } from '@folio/core';
import { IconButton, cx } from '@folio/ui';
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2, X } from 'lucide-react';
import { useState, type DragEvent } from 'react';
import { EditableText } from '../../components/editing/EditableText';
import { useT } from '../../i18n';
import { edit } from '../../state/edit';
import { leaveBlank } from '../../materials/newItems';
import { PlanReadings, SuggestedReadings, useReadings } from './Readings';
import { gapAt, moveIndexForGap } from './reorder';
import { HomeworkPicker } from '../../materials/Homework';
import { useObjectiveDraft, type ObjectiveDraft } from './useObjectiveDraft';

interface RowProps {
  course: Course;
  lesson: Lesson;
  index: number;
  /** Index of the lesson being dragged, or -1. */
  dragFrom: number;
  onDragStart: (id: string) => void;
  /** Drop into a gap between rows: 0 is above the first, n below the last. */
  onDrop: (gap: number) => void;
}

/** A quiet "+ Add …" under a lesson's objectives and readings. */
function AddLine({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <button
      type="button"
      onClick={onPress}
      className="flex items-center gap-1.5 rounded-control py-0.5 pl-5 font-ui text-13 text-ink-2 outline-none hover:text-accent focus-visible:ring-2 focus-visible:ring-accent"
    >
      <Plus size={13} strokeWidth={1.75} aria-hidden />
      {label}
    </button>
  );
}

function Objectives({ course, lesson, n, draft }: { course: Course; lesson: Lesson; n: number; draft: ObjectiveDraft }) {
  const t = useT();
  const objectives = lessonObjectives(course, lesson);
  return (
    <ul className="mt-3 space-y-1.5" aria-label={t.lesson.objectivesOf(n)}>
      {objectives.map((o, i) => (
        <li key={o.id} className="group/obj flex items-start gap-2 font-ui text-14 leading-6 text-ink">
          <span aria-hidden className="mt-2.5 h-px w-3 shrink-0 bg-ink-3" />
          <EditableText
            value={o.text}
            label={t.plan.objectiveOf(i + 1, n)}
            placeholder={t.plan.objectiveHint}
            lang={course.language}
            className="min-w-0 flex-1"
            onCommit={(text) => edit([cmd('objective.update', { objectiveId: o.id, text })], { key: 'editedObjective' })}
          />
          <IconButton
            size="sm"
            label={t.plan.removeObjective(i + 1, n)}
            tooltip={false}
            className="size-6 opacity-0 pointer-coarse:opacity-100 group-focus-within/obj:opacity-100 group-hover/obj:opacity-100"
            onPress={() => edit([cmd('objective.remove', { objectiveId: o.id })], { key: 'removedObjective' })}
          >
            <X size={14} strokeWidth={1.5} />
          </IconButton>
        </li>
      ))}
      {draft.open && (
        <li className="flex items-start gap-2 font-ui text-14 leading-6 text-ink" onBlur={draft.close}>
          <span aria-hidden className="mt-2.5 h-px w-3 shrink-0 bg-ink-3" />
          <EditableText autoFocus value="" label={t.plan.objectiveOf(objectives.length + 1, n)} placeholder={t.plan.objectiveHint} lang={course.language} className="min-w-0 flex-1" onCommit={draft.commit} />
        </li>
      )}
    </ul>
  );
}

function RowActions({ lesson, index, last }: { lesson: Lesson; index: number; last: number }) {
  const t = useT();
  const n = index + 1;
  const move = (toIndex: number) => edit([cmd('lesson.move', { lessonId: lesson.id, toIndex })], { key: 'movedLesson' });
  return (
    <div className="flex shrink-0 flex-col gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
      <IconButton size="sm" label={t.plan.moveUp(n)} isDisabled={index === 0} onPress={() => move(index - 1)}>
        <ArrowUp size={15} strokeWidth={1.5} />
      </IconButton>
      <IconButton size="sm" label={t.plan.moveDown(n)} isDisabled={n === last} onPress={() => move(index + 1)}>
        <ArrowDown size={15} strokeWidth={1.5} />
      </IconButton>
      <IconButton size="sm" label={t.plan.removeLesson(n)} onPress={() => edit([cmd('lesson.remove', { lessonId: lesson.id })], { key: 'removedLesson', values: { n } })}>
        <Trash2 size={15} strokeWidth={1.5} />
      </IconButton>
    </div>
  );
}

function Handle({ lesson, n, onDragStart }: { lesson: Lesson; n: number; onDragStart: (id: string) => void }) {
  const t = useT();
  return (
    <div className="flex w-10 shrink-0 flex-col items-center gap-1 pt-1">
      <span
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', lesson.id);
          onDragStart(lesson.id);
        }}
        aria-hidden
        title={t.plan.drag(n)}
        className="cursor-grab text-ink-3 opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
      >
        <GripVertical size={16} strokeWidth={1.5} />
      </span>
      <span className="font-mono text-13 text-ink-2 tabular">{String(n).padStart(2, '0')}</span>
    </div>
  );
}

function LessonText({ lesson, n }: { lesson: Lesson; n: number }) {
  const t = useT();
  return (
    <>
      <EditableText
        as="h3"
        value={lesson.title}
        label={t.plan.lessonTitle(n)}
        required
        className="font-reading text-22 font-semibold leading-8 text-ink"
        onCommit={(title) => edit([cmd('lesson.update', { lessonId: lesson.id, title })], { key: 'renamedLesson', values: { n } })}
      />
      <EditableText
        as="p"
        multiline
        value={lesson.summary}
        label={t.plan.lessonSummary(n)}
        placeholder={t.plan.lessonSummary(n)}
        className="mt-1 block font-reading text-16 leading-6 text-ink-2"
        onCommit={(summary) => edit([cmd('lesson.update', { lessonId: lesson.id, summary })], { key: 'editedLesson', values: { n } })}
      />
    </>
  );
}

/** Objectives, then what students read before the lesson (only once there is some), then one line of adds. */
function LessonDetails({ course, lesson, n }: { course: Course; lesson: Lesson; n: number }) {
  const t = useT();
  const draft = useObjectiveDraft(lesson.id);
  const readings = useReadings(lesson, n);
  return (
    <>
      <Objectives course={course} lesson={lesson} n={n} draft={draft} />
      <PlanReadings course={course} lesson={lesson} n={n} readings={readings} />
      <SuggestedReadings course={course} lesson={lesson} n={n} readings={readings} compact />
      {course.materials.assignments.enabled && <HomeworkPicker course={course} lesson={lesson} className="mt-3" underHeading={false} />}
      <div className="mt-1.5 flex flex-wrap gap-x-3">
        <AddLine label={t.plan.addObjective} onPress={draft.start} />
        <AddLine label={t.plan.addReading} onPress={readings.start} />
      </div>
    </>
  );
}

/** One lesson in the outline: drag to reorder, rename in place, edit objectives and readings. */
export function LessonRow({ course, lesson, index, dragFrom, onDragStart, onDrop }: RowProps) {
  const n = index + 1;
  const [gap, setGap] = useState<number | null>(null);
  const gapFor = (e: DragEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const at = gapAt(index, e.clientY, rect.top, rect.height);
    return moveIndexForGap(dragFrom, at) === null ? null : at;
  };
  return (
    <li
      onDragOver={(e: DragEvent) => {
        const at = gapFor(e);
        setGap(at);
        // Only a gap that would change the order accepts the drop.
        if (at !== null) e.preventDefault();
      }}
      onDragLeave={() => setGap(null)}
      onDrop={(e) => {
        e.preventDefault();
        const at = gapFor(e);
        setGap(null);
        if (at !== null) onDrop(at);
      }}
      data-item={lesson.id}
      onBlur={leaveBlank(
        lesson.id,
        (c) => {
          const now = c.lessons[lesson.id];
          return Boolean(now && isBlankLesson(c, now));
        },
        () => [cmd('lesson.remove', { lessonId: lesson.id })],
        { key: 'removedLesson', values: { n } },
      )}
      className={cx(
        'group relative flex gap-3 border-t border-rule py-5 transition-opacity duration-120 first:border-t-0 md:gap-4',
        index === dragFrom && 'opacity-40',
        gap !== null && 'before:absolute before:inset-x-0 before:h-0.5 before:bg-accent',
        gap === index && 'before:-top-px',
        gap === index + 1 && 'before:-bottom-px',
      )}
    >
      <Handle lesson={lesson} n={n} onDragStart={onDragStart} />
      <div className="min-w-0 flex-1" lang={course.language}>
        <LessonText lesson={lesson} n={n} />
        <LessonDetails course={course} lesson={lesson} n={n} />
      </div>
      <RowActions lesson={lesson} index={index} last={course.lessonOrder.length} />
    </li>
  );
}
