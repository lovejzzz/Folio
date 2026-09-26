import { cmd, lessonAssignments, lessonDiscussions, lessonFaq, lessonQuestions, newId, type Course, type Lesson, type Question } from '@folio/core';
import { IconButton } from '@folio/ui';
import { EyeOff, Trash2 } from 'lucide-react';
import { EditableText } from '../components/editing/EditableText';
import { useT } from '../i18n';
import { AddButton, EditableList } from './EditableList';
import { FlagNote } from './FlagNote';
import { QuestionCard } from './QuestionCard';
import { RubricTable } from './RubricTable';
import { useSectionEdit } from './useSectionEdit';

export function QuizEditor({ course, lesson, startAt = 1 }: { course: Course; lesson: Lesson; startAt?: number }) {
  const t = useT();
  const save = useSectionEdit(course, lesson.id, 'quiz');
  const questions = lessonQuestions(course, lesson);
  const add = () => {
    const q: Question = {
      id: newId('t'),
      kind: 'question',
      lessonId: lesson.id,
      objectiveIds: [...lesson.objectiveIds.slice(0, 1)],
      sourceRefs: [],
      origin: 'teacher',
      edited: true,
      flag: null,
      format: 'choice',
      prompt: t.quiz.newQuestion,
      choices: ['A', 'B', 'C', 'D'].map(() => ({ id: newId('x'), text: t.quiz.newChoice })),
      correct: null,
      answer: '',
      explanation: '',
      difficulty: 2,
    };
    save([cmd('task.add', { task: q, afterId: questions.at(-1)?.id ?? null })]);
  };
  return (
    <div>
      {questions.map((q, i) => (
        <QuestionCard key={q.id} course={course} q={q} n={startAt + i} />
      ))}
      <AddButton label={t.quiz.addQuestion} onPress={add} />
    </div>
  );
}

export function StudyEditor({ course, lesson }: { course: Course; lesson: Lesson }) {
  const t = useT();
  const save = useSectionEdit(course, lesson.id, 'study');
  const points = lesson.study.points;
  const setPoints = (next: typeof points) => save([cmd('study.update', { lessonId: lesson.id, points: next })]);
  return (
    <div className="space-y-6" lang={course.language}>
      <EditableText as="p" multiline value={lesson.study.overview} label={t.lesson.overview} context={lesson.title} className="block text-18 leading-8 text-ink-2" onCommit={(overview) => save([cmd('study.update', { lessonId: lesson.id, overview })])} />
      {points.map((p) => (
        <section key={p.id} className="group/pt relative">
          <EditableText as="h4" value={p.heading} label={t.lesson.addPoint} className="block text-18 font-semibold text-ink" onCommit={(heading) => setPoints(points.map((x) => (x.id === p.id ? { ...x, heading } : x)))} />
          <EditableText as="p" multiline value={p.explanation} label={p.heading} context={p.heading} className="mt-1 block" onCommit={(explanation) => setPoints(points.map((x) => (x.id === p.id ? { ...x, explanation } : x)))} />
          <IconButton size="sm" label={`${t.common.remove}: ${p.heading}`} className="no-print absolute -right-9 top-0 opacity-0 group-focus-within/pt:opacity-100 group-hover/pt:opacity-100" onPress={() => setPoints(points.filter((x) => x.id !== p.id))}>
            <Trash2 size={14} strokeWidth={1.5} />
          </IconButton>
        </section>
      ))}
      <AddButton label={t.lesson.addPoint} onPress={() => setPoints([...points, { id: newId('x'), heading: t.lesson.addPoint, explanation: '' }])} />
    </div>
  );
}

export function AssignmentEditor({ course, lesson, showRubric = true }: { course: Course; lesson: Lesson; showRubric?: boolean }) {
  const t = useT();
  const save = useSectionEdit(course, lesson.id, 'assignments');
  return (
    <div className="space-y-8" lang={course.language}>
      {lessonAssignments(course, lesson).map((a) => {
        const update = (fields: Partial<typeof a>) => save([cmd('task.update', { taskId: a.id, fields })]);
        const rubric = a.rubricId ? course.rubrics[a.rubricId] : undefined;
        return (
          <article key={a.id} className="space-y-4">
            {a.flag && <FlagNote flag={a.flag} lessonId={lesson.id} kind="assignments" itemId={a.id} />}
            <EditableText as="h4" value={a.title} label={t.materialOne.assignments} className="block text-22 font-semibold leading-8 text-ink" onCommit={(title) => update({ title })} />
            <EditableText as="p" multiline value={a.prompt} label={a.title} context={a.title} className="block" onCommit={(prompt) => update({ prompt })} />
            <div>
              <h5 className="mb-2 font-ui text-13 font-semibold text-ink">{t.tasks.steps}</h5>
              <EditableList ordered items={a.steps} label={t.tasks.steps} addLabel={t.tasks.addStep} newItem={t.tasks.addStep} lang={course.language} context={a.title} onChange={(steps) => update({ steps })} />
            </div>
            {showRubric && rubric && (
              <div>
                <h5 className="mb-2 font-ui text-13 font-semibold text-ink">{t.tasks.rubric}</h5>
                <RubricTable course={course} lessonId={lesson.id} rubric={rubric} />
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

export function RubricsEditor({ course, lesson }: { course: Course; lesson: Lesson }) {
  return (
    <div className="space-y-6">
      {lessonAssignments(course, lesson).map((a) => {
        const rubric = a.rubricId ? course.rubrics[a.rubricId] : undefined;
        return rubric ? (
          <div key={a.id}>
            <h4 className="mb-3 text-18 font-semibold text-ink" lang={course.language}>{rubric.title}</h4>
            <RubricTable course={course} lessonId={lesson.id} rubric={rubric} />
          </div>
        ) : null;
      })}
    </div>
  );
}

export function DiscussionEditor({ course, lesson }: { course: Course; lesson: Lesson }) {
  const t = useT();
  const save = useSectionEdit(course, lesson.id, 'discussions');
  const items = lessonDiscussions(course, lesson);
  return (
    <div lang={course.language}>
      <ol className="space-y-6">
        {items.map((d, i) => (
          <li key={d.id} className="group/d relative flex gap-4">
            <span className="font-display text-28 leading-8 text-ink-3">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <EditableText as="p" multiline value={d.prompt} label={t.materialOne.discussions} context={lesson.title} className="block text-18 leading-8 text-ink" onCommit={(prompt) => save([cmd('task.update', { taskId: d.id, fields: { prompt } })])} />
              <div className="mt-3 rounded-control bg-well px-4 py-3 font-ui text-14 leading-6">
                <p className="mb-1 flex items-center gap-1.5 text-12 text-ink-2">
                  <EyeOff size={12} strokeWidth={1.75} aria-hidden />
                  {t.tasks.followUps} · {t.quiz.teacherOnly}
                </p>
                <EditableList items={d.followUps} label={t.tasks.followUps} addLabel={t.tasks.addFollowUp} newItem={t.tasks.addFollowUp} lang={course.language} onChange={(followUps) => save([cmd('task.update', { taskId: d.id, fields: { followUps } })])} />
              </div>
            </div>
            <IconButton size="sm" label={t.tasks.removeDiscussion} className="no-print opacity-0 group-focus-within/d:opacity-100 group-hover/d:opacity-100" onPress={() => save([cmd('task.remove', { taskId: d.id })])}>
              <Trash2 size={14} strokeWidth={1.5} />
            </IconButton>
          </li>
        ))}
      </ol>
      <AddButton
        label={t.tasks.addDiscussion}
        onPress={() =>
          save([cmd('task.add', { task: { id: newId('t'), kind: 'discussion', lessonId: lesson.id, objectiveIds: [], sourceRefs: [], origin: 'teacher', edited: true, flag: null, prompt: t.tasks.newDiscussion, followUps: [] }, afterId: items.at(-1)?.id ?? null })])
        }
      />
    </div>
  );
}

export function FaqEditor({ course, lesson }: { course: Course; lesson: Lesson }) {
  const t = useT();
  const save = useSectionEdit(course, lesson.id, 'faq');
  return (
    <div lang={course.language}>
      <dl className="space-y-5">
        {lessonFaq(course, lesson).map((f) => (
          <div key={f.id} className="group/f relative">
            <dt>
              <EditableText value={f.question} label={t.tasks.addFaq} className="font-semibold text-ink" onCommit={(question) => save([cmd('faq.update', { faqId: f.id, question })])} />
            </dt>
            <dd className="mt-1 flex items-start gap-1">
              <EditableText multiline className="min-w-0 flex-1" value={f.answer} label={`${t.tasks.newAnswer}: ${f.question}`} context={f.question} onCommit={(answer) => save([cmd('faq.update', { faqId: f.id, answer })])} />
              <IconButton size="sm" label={t.tasks.removeFaq} className="no-print opacity-0 group-focus-within/f:opacity-100 group-hover/f:opacity-100" onPress={() => save([cmd('faq.remove', { faqId: f.id })])}>
                <Trash2 size={14} strokeWidth={1.5} />
              </IconButton>
            </dd>
          </div>
        ))}
      </dl>
      <AddButton
        label={t.tasks.addFaq}
        onPress={() => save([cmd('faq.add', { entry: { id: newId('f'), lessonId: lesson.id, question: t.tasks.newFaq, answer: '', origin: 'teacher', edited: true, flag: null } })])}
      />
    </div>
  );
}
