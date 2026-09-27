import { cmd, isBlankLesson, lessonObjectives, type Course, type Lesson } from '@folio/core';
import { IconButton, cx } from '@folio/ui';
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2, X } from 'lucide-react';
import { useState, type DragEvent } from 'react';
import { EditableText } from '../../components/editing/EditableText';
import { useT } from '../../i18n';
import { edit } from '../../state/edit';
import { leaveBlank } from '../../materials/newItems';
import { useObjectiveDraft } from './useObjectiveDraft';

interface RowProps {
  course: Course;
  lesson: Lesson;
  index: number;
  dragging: string | null;
  onDragStart: (id: string) => void;
  onDrop: (toIndex: number) => void;
}

function Objectives({ course, lesson, n }: { course: Course; lesson: Lesson; n: number }) {
  const t = useT();
  const objectives = lessonObjectives(course, lesson);
  const draft = useObjectiveDraft(lesson.id);
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
            className="size-6 opacity-0 group-focus-within/obj:opacity-100 group-hover/obj:opacity-100"
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
      <li>
        <button
          type="button"
          onClick={draft.start}
          className="flex items-center gap-1.5 rounded-control py-0.5 pl-5 font-ui text-13 text-ink-2 outline-none hover:text-accent focus-visible:ring-2 focus-visible:ring-accent"
        >
          <Plus size={13} strokeWidth={1.75} aria-hidden />
          {t.plan.addObjective}
        </button>
      </li>
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

/** One lesson in the outline: drag to reorder, rename in place, edit objectives. */
export function LessonRow({ course, lesson, index, dragging, onDragStart, onDrop }: RowProps) {
  const t = useT();
  const n = index + 1;
  const [over, setOver] = useState(false);
  return (
    <li
      onDragOver={(e: DragEvent) => {
        if (!dragging || dragging === lesson.id) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onDrop(index);
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
        dragging === lesson.id && 'opacity-40',
        over && 'before:absolute before:inset-x-0 before:-top-px before:h-0.5 before:bg-accent',
      )}
    >
      <Handle lesson={lesson} n={n} onDragStart={onDragStart} />
      <div className="min-w-0 flex-1" lang={course.language}>
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
        <Objectives course={course} lesson={lesson} n={n} />
      </div>
      <RowActions lesson={lesson} index={index} last={course.lessonOrder.length} />
    </li>
  );
}
