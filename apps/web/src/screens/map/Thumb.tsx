import { lessonQuestions, lessonAssignments, type Course, type Lesson, type MaterialKind } from '@folio/core';

/**
 * A miniature of the cell's real content: segment bars sized by minutes,
 * one rectangle per slide, one tick per question. Decorative only.
 */
export function Thumb({ course, lesson, kind }: { course: Course; lesson: Lesson; kind: MaterialKind }) {
  switch (kind) {
    case 'plan': {
      const total = Math.max(1, lesson.segments.reduce((a, s) => a + s.minutes, 0));
      return (
        <span aria-hidden className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full">
          {lesson.segments.map((s) => (
            <span key={s.id} className="h-full rounded-full bg-rule-strong" style={{ flexGrow: s.minutes / total, flexBasis: 0 }} />
          ))}
        </span>
      );
    }
    case 'slides':
      return (
        <span aria-hidden className="flex flex-wrap gap-1">
          {lesson.slides.slice(0, 8).map((s) => (
            <span key={s.id} className="h-3.5 w-6 border border-rule-strong bg-well" />
          ))}
        </span>
      );
    case 'quiz':
      return (
        <span aria-hidden className="flex flex-wrap gap-1">
          {lessonQuestions(course, lesson).map((q) => (
            <span key={q.id} className={q.flags.length > 0 ? 'size-2 rotate-45 bg-attention' : 'size-2 rounded-full bg-rule-strong'} />
          ))}
        </span>
      );
    case 'rubrics': {
      const a = lessonAssignments(course, lesson)[0];
      const r = a?.rubricId ? course.rubrics[a.rubricId] : undefined;
      if (!r) return null;
      return (
        <span aria-hidden className="grid w-16 gap-0.5" style={{ gridTemplateColumns: `repeat(${r.levels.length}, 1fr)` }}>
          {r.criteria.flatMap((c) => r.levels.map((lv) => <span key={c.id + lv.id} className="h-1.5 rounded-full bg-rule-strong" />))}
        </span>
      );
    }
    default:
      return (
        <span aria-hidden className="flex w-full flex-col gap-1">
          <span className="h-1.5 w-full rounded-full bg-rule-strong" />
          <span className="h-1.5 w-4/5 rounded-full bg-rule-strong" />
          <span className="h-1.5 w-3/5 rounded-full bg-rule" />
        </span>
      );
  }
}
