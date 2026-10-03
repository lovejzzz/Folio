import { cmd, courseLabels, docLabels, lessonQuestions, orderedLessons, project, type Course, type MaterialKind } from '@folio/core';
import { BinderTab, Sheet } from '@folio/ui';
import { useNavigate } from '@tanstack/react-router';
import { materialRoute } from '../../app/router';
import { usePageTitle } from '../../app/usePageTitle';
import { DocView } from '../../components/DocView';
import { EditableText } from '../../components/editing/EditableText';
import { useT } from '../../i18n';
import { SectionFrame } from '../../materials/SectionFrame';
import { SlidesEditor } from '../../materials/SlidesEditor';
import { lessonEditors } from '../../materials/editors';
import { edit } from '../../state/edit';
import { useCourse } from '../../state/session';
import { AddGradeItem, GradingTable } from './GradingTable';
import { OwnSyllabus } from './OwnSyllabus';

function Outline({ course }: { course: Course }) {
  const t = useT();
  return (
    <nav aria-label={t.lesson.rail} className="no-print sticky top-20 hidden w-52 shrink-0 lg:block">
      <ol className="space-y-0.5">
        {orderedLessons(course).map((lesson, i) => (
          <li key={lesson.id}>
            <a href={`#l-${lesson.id}`} className="flex gap-2 rounded-control px-2 py-1.5 font-ui text-13 leading-5 text-ink-2 outline-none hover:bg-well hover:text-ink focus-visible:ring-2 focus-visible:ring-accent">
              <span className="font-mono text-12 text-ink-2 tabular">{String(i + 1).padStart(2, '0')}</span>
              <span className="line-clamp-2" lang={course.language}>{lesson.title}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function PerLesson({ course, kind }: { course: Course; kind: MaterialKind }) {
  const t = useT();
  const Editor = lessonEditors[kind]!;
  const lessons = orderedLessons(course);
  /* Questions are numbered continuously across the whole bank. */
  const starts = lessons.map((_, i) => 1 + lessons.slice(0, i).reduce((n, l) => n + lessonQuestions(course, l).length, 0));
  return (
    <div className="space-y-14">
      {lessons.map((lesson, i) => {
        const startAt = starts[i]!;
        return (
          <section key={lesson.id} id={`l-${lesson.id}`} className="scroll-mt-24" aria-labelledby={`lh-${lesson.id}`}>
            <h2 id={`lh-${lesson.id}`} className="mb-6 flex items-baseline gap-3 border-b border-rule pb-3">
              <span className="font-mono text-14 text-ink-2 tabular">{String(i + 1).padStart(2, '0')}</span>
              <span className="font-display text-28 leading-tight text-ink">{lesson.title}</span>
            </h2>
            <SectionFrame course={course} lesson={lesson} kind={kind} hideHeading>
              <Editor course={course} lesson={lesson} startAt={startAt} />
            </SectionFrame>
          </section>
        );
      })}
      {course.lessonOrder.length === 0 && <p className="font-ui text-14 text-ink-2">{t.map.empty}</p>}
    </div>
  );
}

/**
 * The syllabus as a document, with the parts the teacher writes edited in
 * place: the description, the grading scheme and the class policies. The
 * rest is projected, exactly as it prints.
 */
function Syllabus({ course }: { course: Course }) {
  const t = useT();
  const l = docLabels(course.language);
  const doc = project(course, 'syllabus', { audience: 'teacher' });
  const blocks = doc.blocks.filter((b, i) => !(i === 0 && b.t === 'para'));
  // Assessment and policies are drawn here instead, so they can be edited.
  const cut = blocks.findIndex((b) => b.t === 'heading' && (b.text === l.assessment || b.text === l.policies));
  const lines = cut < 0 ? undefined : blocks.slice(cut).find((b) => b.t === 'list');
  const assessed = lines ? <DocView doc={{ ...doc, blocks: [lines] }} showTitle={false} /> : null;
  return (
    <>
      <EditableText as="p" multiline value={course.summary} label={t.plan.summary} className="mb-2 block text-18 leading-8 text-ink-2" onCommit={(summary) => edit([cmd('course.update', { summary })], { key: 'editedCourse' })} />
      <DocView doc={{ ...doc, blocks: cut < 0 ? blocks : blocks.slice(0, cut) }} showTitle={false} />
      <section className="mt-10">
        <h2 className="mb-3 text-22 font-semibold leading-8">{l.assessment}</h2>
        {course.grading.length > 0 && <GradingTable course={course} />}
        {course.grading.length > 0 && <AddGradeItem course={course} />}
        {assessed}
        {course.grading.length === 0 && <AddGradeItem course={course} />}
      </section>
      <section className="mt-10">
        <h2 className="mb-3 text-22 font-semibold">{t.tasks.policies}</h2>
        <EditableText as="div" multiline value={course.policies} label={t.tasks.policies} placeholder={t.tasks.policiesPlaceholder} className="block min-h-12" onCommit={(policies) => edit([cmd('course.update', { policies })], { key: 'editedCourse' })} />
      </section>
    </>
  );
}

function CourseWide({ course, kind }: { course: Course; kind: 'map' | 'syllabus' }) {
  if (kind === 'syllabus') return course.syllabus ? <OwnSyllabus course={course} /> : <Syllabus course={course} />;
  return <DocView doc={project(course, kind, { audience: 'teacher' })} showTitle={false} />;
}

/** One material across every lesson, as a continuous document ready to print. */
export function MaterialScreen() {
  const t = useT();
  const course = useCourse();
  const { kind } = materialRoute.useParams();
  const { lesson, slide } = materialRoute.useSearch();
  usePageTitle(t.materials[kind], course.title || t.common.untitled);
  const navigate = useNavigate({ from: materialRoute.fullPath });
  if (kind === 'slides') {
    return (
      <div className="px-4 pb-24 pt-8 md:px-8">
        <h1 className="mb-6">
          <BinderTab kind="slides" label={t.materials.slides} />
        </h1>
        <SlidesEditor
          course={course}
          lessonId={lesson}
          slide={slide}
          onGo={(p) => void navigate({ search: { lesson: p.lessonId, slide: p.index + 1 }, replace: true, resetScroll: false })}
        />
      </div>
    );
  }
  return (
    <div className="flex items-start gap-8 px-3 pb-24 pt-8 md:px-8 md:pt-10">
      {kind !== 'map' && kind !== 'syllabus' && <Outline course={course} />}
      <div className="min-w-0 flex-1">
        <Sheet lang={course.language} className="folio-doc" orientation={kind === 'rubrics' ? 'landscape' : 'portrait'} running={<><span className="truncate">{course.title}</span><BinderTab kind={kind} size="sm" label={t.materials[kind]} /></>}>
          <h1 className="mb-8 font-display text-48 leading-none text-ink">{courseLabels(course).materials[kind]}</h1>
          {kind === 'map' || kind === 'syllabus' ? <CourseWide course={course} kind={kind} /> : <PerLesson course={course} kind={kind} />}
        </Sheet>
      </div>
    </div>
  );
}
