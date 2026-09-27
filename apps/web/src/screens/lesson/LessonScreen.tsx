import { TEACHING_ORDER, cmd, lessonNumber, lessonObjectives, newId, type Course, type Lesson, type MaterialKind } from '@folio/core';
import { Sheet } from '@folio/ui';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { lessonRoute } from '../../app/router';
import { usePageTitle } from '../../app/usePageTitle';
import { EditableText } from '../../components/editing/EditableText';
import { useT } from '../../i18n';
import { AddButton } from '../../materials/EditableList';
import { SectionFrame } from '../../materials/SectionFrame';
import { lessonEditors } from '../../materials/editors';
import { edit } from '../../state/edit';
import { useCourse } from '../../state/session';
import { EdgeTabs } from './EdgeTabs';
import { LessonRail } from './LessonRail';
import { LessonNotFound } from '../../app/errors';

function LessonHead({ course, lesson }: { course: Course; lesson: Lesson }) {
  const t = useT();
  const n = lessonNumber(course, lesson.id);
  return (
    <header className="mb-10" lang={course.language}>
      <EditableText
        as="h1"
        value={lesson.title}
        label={t.plan.lessonTitle(n)}
        required
        className="block font-display text-36 leading-tight text-ink md:text-48 md:leading-none"
        onCommit={(title) => edit([cmd('lesson.update', { lessonId: lesson.id, title })], { key: 'renamedLesson', values: { n } })}
      />
      <EditableText
        as="p"
        multiline
        value={lesson.summary}
        label={t.plan.lessonSummary(n)}
        placeholder={t.plan.lessonSummary(n)}
        className="mt-4 block text-18 leading-8 text-ink-2"
        onCommit={(summary) => edit([cmd('lesson.update', { lessonId: lesson.id, summary })], { key: 'editedLesson', values: { n } })}
      />
      <div className="mt-6 rounded-control bg-well px-5 py-4">
        <h2 className="mb-2 font-ui text-13 font-semibold text-ink">{t.lesson.objectives}</h2>
        <ul className="list-disc space-y-1 pl-5 marker:text-ink-3">
          {lessonObjectives(course, lesson).map((o, i) => (
            <li key={o.id}>
              <EditableText value={o.text} label={t.plan.objectiveOf(i + 1, n)} onCommit={(text) => edit([cmd('objective.update', { objectiveId: o.id, text })], { key: 'editedObjective' })} />
            </li>
          ))}
        </ul>
        <AddButton label={t.plan.addObjective} onPress={() => edit([cmd('objective.add', { objective: { id: newId('o'), text: t.plan.objective }, lessonId: lesson.id })], { key: 'addedObjective' })} />
      </div>
    </header>
  );
}

function usePosition(kinds: MaterialKind[], initial: MaterialKind | undefined, lessonId: string): MaterialKind | null {
  const [active, setActive] = useState<MaterialKind | null>(kinds[0] ?? null);
  useEffect(() => {
    if (initial) document.getElementById(`m-${initial}`)?.scrollIntoView({ block: 'start' });
    else window.scrollTo({ top: 0 });
  }, [initial, lessonId]);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const id = visible[0]?.target.id.replace(/^m-/, '');
        if (id) setActive(id as MaterialKind);
      },
      { rootMargin: '-96px 0px -60% 0px' },
    );
    for (const k of kinds) {
      const el = document.getElementById(`m-${k}`);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [kinds, lessonId]);
  return active;
}

function Pager({ course, index }: { course: Course; index: number }) {
  const t = useT();
  const prev = course.lessonOrder[index - 1];
  const next = course.lessonOrder[index + 1];
  const cls = 'group flex min-w-0 max-w-1/2 items-center gap-2 rounded-control px-2 py-1.5 font-ui text-14 text-ink-2 outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent';
  return (
    <nav aria-label={t.lesson.rail} className="no-print mx-auto mt-6 flex max-w-sheet justify-between gap-4">
      {prev ? (
        <Link to="/c/$courseId/lesson/$lessonId" params={{ courseId: course.id, lessonId: prev }} className={cls}>
          <ArrowLeft size={16} strokeWidth={1.5} aria-hidden />
          <span className="truncate">{t.common.lesson(index)} · {course.lessons[prev]?.title}</span>
        </Link>
      ) : (
        <span />
      )}
      {next && (
        <Link to="/c/$courseId/lesson/$lessonId" params={{ courseId: course.id, lessonId: next }} className={cls}>
          <span className="truncate">{t.common.lesson(index + 2)} · {course.lessons[next]?.title}</span>
          <ArrowRight size={16} strokeWidth={1.5} aria-hidden />
        </Link>
      )}
    </nav>
  );
}

/** Everything for one lesson, stacked in teaching order on one sheet. */
export function LessonScreen() {
  const t = useT();
  const course = useCourse();
  const { lessonId } = lessonRoute.useParams();
  const { m } = lessonRoute.useSearch();
  const lesson = course.lessons[lessonId];
  const kinds = TEACHING_ORDER.filter((k) => course.materials[k].enabled && lessonEditors[k]);
  const active = usePosition(kinds, m, lessonId);
  const index = course.lessonOrder.indexOf(lessonId);
  usePageTitle(...(lesson ? [lesson.title || t.common.lesson(index + 1), course.title || t.common.untitled] : [t.errors.lessonNotFound]));
  if (!lesson) return <LessonNotFound />;
  return (
    <div className="flex items-start">
      <LessonRail currentId={lesson.id} />
      <div className="min-w-0 flex-1 px-3 pb-24 pt-6 md:px-8 md:pt-10">
        <div className="mx-auto flex items-start justify-center xl:max-w-fit">
          <Sheet
            lang={course.language}
            className="folio-doc min-w-0"
            running={
              <>
                <span className="truncate">{course.title}</span>
                <span className="shrink-0 tabular">{t.common.lesson(index + 1)} / {course.lessonOrder.length}</span>
              </>
            }
          >
            <LessonHead course={course} lesson={lesson} />
            <div className="space-y-12">
              {kinds.map((kind) => {
                const Editor = lessonEditors[kind]!;
                return (
                  <SectionFrame key={kind} course={course} lesson={lesson} kind={kind}>
                    <Editor course={course} lesson={lesson} />
                  </SectionFrame>
                );
              })}
            </div>
          </Sheet>
          <EdgeTabs kinds={kinds} active={active} />
        </div>
        <Pager course={course} index={index} />
      </div>
    </div>
  );
}
