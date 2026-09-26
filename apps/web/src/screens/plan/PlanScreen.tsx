import { cmd, newId, orderedLessons } from '@folio/core';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { EditableText } from '../../components/editing/EditableText';
import { useT } from '../../i18n';
import { edit } from '../../state/edit';
import { useCourse } from '../../state/session';
import { LessonRow } from './LessonRow';
import { PlanAside } from './PlanAside';

/** Plan before you generate: the teacher agrees the outline, then builds. */
export function PlanScreen() {
  const t = useT();
  const course = useCourse();
  const lessons = orderedLessons(course);
  const [dragging, setDragging] = useState<string | null>(null);

  const addLesson = () =>
    edit(
      [cmd('lesson.insert', { lesson: { id: newId('l'), title: t.plan.newLesson, summary: '' }, afterId: course.lessonOrder.at(-1) ?? null })],
      { key: 'addedLesson' },
    );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 pb-24 pt-8 md:px-8 md:pt-12 lg:flex-row lg:items-start">
      <section className="min-w-0 flex-1 rounded-sheet bg-paper px-5 py-8 shadow-sheet md:px-12 md:py-12" aria-labelledby="plan-title">
        <p id="plan-title" className="font-ui text-13 font-medium text-ink-2">
          {t.plan.title}
        </p>
        <div lang={course.language}>
          <EditableText
            as="h1"
            value={course.title}
            label={t.plan.courseTitle}
            className="mt-2 block font-display text-36 leading-tight text-ink md:text-48 md:leading-none"
            onCommit={(title) => edit([cmd('course.update', { title })], { key: 'editedCourse' })}
          />
          <EditableText
            as="p"
            multiline
            value={course.summary}
            label={t.plan.summary}
            placeholder={t.plan.summary}
            className="mt-4 block max-w-2xl font-reading text-17 leading-7 text-ink-2"
            onCommit={(summary) => edit([cmd('course.update', { summary })], { key: 'editedCourse' })}
          />
        </div>
        <p className="mt-6 max-w-2xl font-ui text-14 leading-relaxed text-ink-2">{t.plan.lede}</p>
        <ol className="mt-8 border-t border-rule" onDragEnd={() => setDragging(null)}>
          {lessons.map((lesson, index) => (
            <LessonRow
              key={lesson.id}
              course={course}
              lesson={lesson}
              index={index}
              dragging={dragging}
              onDragStart={setDragging}
              onDrop={(toIndex) => {
                if (dragging) edit([cmd('lesson.move', { lessonId: dragging, toIndex })], { key: 'movedLesson' });
                setDragging(null);
              }}
            />
          ))}
        </ol>
        <button
          type="button"
          onClick={addLesson}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-sheet border border-dashed border-rule-strong py-3 font-ui text-14 text-ink-2 outline-none transition-colors duration-120 hover:border-accent hover:text-accent focus-visible:ring-2 focus-visible:ring-accent"
        >
          <Plus size={16} strokeWidth={1.5} aria-hidden />
          {t.plan.addLesson}
        </button>
      </section>
      <PlanAside />
    </div>
  );
}
