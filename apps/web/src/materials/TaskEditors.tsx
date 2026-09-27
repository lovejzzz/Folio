import { cmd, isBlankDiscussion, isBlankFaq, isBlankPoint, lessonAssignments, lessonDiscussions, lessonFaq, lessonQuestions, newId, type Course, type Discussion, type Lesson, type Question } from '@folio/core';
import { IconButton } from '@folio/ui';
import { EyeOff, Trash2 } from 'lucide-react';
import { EditableText } from '../components/editing/EditableText';
import { useT } from '../i18n';
import { AddButton, EditableList } from './EditableList';
import { FlagNote } from './FlagNote';
import { addItem, leaveBlank } from './newItems';
import { QuestionCard } from './QuestionCard';
import { RubricTable } from './RubricTable';
import { sectionLabel, useSectionEdit } from './useSectionEdit';
import { Sep } from '../components/Sep';

export function QuizEditor({ course, lesson, startAt = 1 }: { course: Course; lesson: Lesson; startAt?: number }) {
  const t = useT();
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
      flags: [],
      format: 'choice',
      prompt: '',
      choices: ['A', 'B', 'C', 'D'].map(() => ({ id: newId('x'), text: '' })),
      correct: null,
      answer: '',
      explanation: '',
      difficulty: 2,
    };
    addItem(q.id, [cmd('task.add', { task: q, afterId: questions.at(-1)?.id ?? null })], sectionLabel(course, lesson.id, 'quiz'));
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
  const label = sectionLabel(course, lesson.id, 'study');
  const pointsNow = (c: Course) => c.lessons[lesson.id]?.study.points ?? [];
  const add = () => {
    const id = newId('x');
    addItem(id, [cmd('study.update', { lessonId: lesson.id, points: [...points, { id, heading: '', explanation: '' }] })], label);
  };
  return (
    <div className="space-y-6" lang={course.language}>
      <EditableText as="p" multiline value={lesson.study.overview} label={t.lesson.overview} context={lesson.title} className="block text-18 leading-8 text-ink-2" onCommit={(overview) => save([cmd('study.update', { lessonId: lesson.id, overview })])} />
      {points.map((p, i) => (
        <section
          key={p.id}
          data-item={p.id}
          className="group/pt relative"
          onBlur={leaveBlank(
            p.id,
            (c) => pointsNow(c).some((x) => x.id === p.id && isBlankPoint(x)),
            (c) => [cmd('study.update', { lessonId: lesson.id, points: pointsNow(c).filter((x) => x.id !== p.id) })],
            label,
          )}
        >
          <EditableText as="h4" value={p.heading} label={t.lesson.pointHeading(i + 1)} className="block text-18 font-semibold text-ink" onCommit={(heading) => setPoints(points.map((x) => (x.id === p.id ? { ...x, heading } : x)))} />
          <EditableText as="p" multiline value={p.explanation} label={p.heading || `${t.lesson.pointExplanation} ${i + 1}`} placeholder={t.lesson.pointExplanation} context={p.heading} className="mt-1 block" onCommit={(explanation) => setPoints(points.map((x) => (x.id === p.id ? { ...x, explanation } : x)))} />
          <span className="no-print absolute -right-9 top-0 hidden opacity-0 group-focus-within/pt:opacity-100 group-hover/pt:opacity-100 md:block">
            <IconButton size="sm" label={t.common.labelled(t.common.remove, p.heading || t.lesson.pointHeading(i + 1))} onPress={() => setPoints(points.filter((x) => x.id !== p.id))}>
              <Trash2 size={14} strokeWidth={1.5} />
            </IconButton>
          </span>
        </section>
      ))}
      <AddButton label={t.lesson.addPoint} onPress={add} />
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
            {a.flags.length > 0 && <FlagNote flags={a.flags} lessonId={lesson.id} kind="assignments" itemId={a.id} />}
            <EditableText as="h4" value={a.title} label={t.tasks.assignmentTitle} required className="block text-22 font-semibold leading-8 text-ink" onCommit={(title) => update({ title })} />
            <EditableText as="p" multiline value={a.prompt} label={a.title} context={a.title} className="block" onCommit={(prompt) => update({ prompt })} />
            <div>
              <h5 className="mb-2 font-ui text-13 font-semibold text-ink">{t.tasks.steps}</h5>
              <EditableList ordered items={a.steps} label={t.tasks.steps} addLabel={t.tasks.addStep} placeholder={t.tasks.step} lang={course.language} context={a.title} onChange={(steps) => update({ steps })} />
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
  const label = sectionLabel(course, lesson.id, 'discussions');
  const items = lessonDiscussions(course, lesson);
  const add = () => {
    const task: Discussion = { id: newId('t'), kind: 'discussion', lessonId: lesson.id, objectiveIds: [], sourceRefs: [], origin: 'teacher', edited: true, flags: [], prompt: '', followUps: [] };
    addItem(task.id, [cmd('task.add', { task, afterId: items.at(-1)?.id ?? null })], label);
  };
  const blank = (id: string) => (c: Course) => {
    const task = c.tasks[id];
    return task?.kind === 'discussion' && isBlankDiscussion(task);
  };
  return (
    <div lang={course.language}>
      <ol className="space-y-6">
        {items.map((d, i) => (
          <li key={d.id} data-item={d.id} className="group/d relative flex gap-4" onBlur={leaveBlank(d.id, blank(d.id), () => [cmd('task.remove', { taskId: d.id })], label)}>
            <span className="font-display text-28 leading-8 text-ink-3">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <EditableText as="p" multiline value={d.prompt} label={t.tasks.discussionPrompt(i + 1)} context={lesson.title} className="block text-18 leading-8 text-ink" onCommit={(prompt) => save([cmd('task.update', { taskId: d.id, fields: { prompt } })])} />
              <div className="mt-3 rounded-control bg-well px-4 py-3 font-ui text-14 leading-6">
                {/* Each label stays whole; on a phone the second one wraps under the first. */}
                <p className="mb-1 flex flex-wrap items-center text-12 text-ink-2">
                  <span className="flex items-center gap-1.5 whitespace-nowrap">
                    <EyeOff size={12} strokeWidth={1.75} aria-hidden />
                    {t.tasks.followUps}
                  </span>
                  <Sep />
                  <span className="whitespace-nowrap">{t.quiz.teacherOnly}</span>
                </p>
                <EditableList items={d.followUps} label={t.tasks.followUps} addLabel={t.tasks.addFollowUp} placeholder={t.tasks.followUp} lang={course.language} onChange={(followUps) => save([cmd('task.update', { taskId: d.id, fields: { followUps } })])} />
              </div>
            </div>
            <IconButton size="sm" label={t.tasks.removeDiscussion} className="no-print opacity-0 group-focus-within/d:opacity-100 group-hover/d:opacity-100" onPress={() => save([cmd('task.remove', { taskId: d.id })])}>
              <Trash2 size={14} strokeWidth={1.5} />
            </IconButton>
          </li>
        ))}
      </ol>
      <AddButton label={t.tasks.addDiscussion} onPress={add} />
    </div>
  );
}

export function FaqEditor({ course, lesson }: { course: Course; lesson: Lesson }) {
  const t = useT();
  const save = useSectionEdit(course, lesson.id, 'faq');
  const label = sectionLabel(course, lesson.id, 'faq');
  const add = () => {
    const id = newId('f');
    addItem(id, [cmd('faq.add', { entry: { id, lessonId: lesson.id, question: '', answer: '', origin: 'teacher', edited: true, flags: [] } })], label);
  };
  const blank = (id: string) => (c: Course) => {
    const entry = c.faq[id];
    return Boolean(entry && isBlankFaq(entry));
  };
  return (
    <div lang={course.language}>
      <dl className="space-y-5">
        {lessonFaq(course, lesson).map((f, i) => (
          <div key={f.id} data-item={f.id} className="group/f relative" onBlur={leaveBlank(f.id, blank(f.id), () => [cmd('faq.remove', { faqId: f.id })], label)}>
            <dt>
              <EditableText value={f.question} label={t.tasks.faqQuestion(i + 1)} className="font-semibold text-ink" onCommit={(question) => save([cmd('faq.update', { faqId: f.id, question })])} />
            </dt>
            <dd className="mt-1 flex items-start gap-1">
              <EditableText multiline className="min-w-0 flex-1" value={f.answer} label={t.common.labelled(t.tasks.newAnswer, f.question || t.tasks.faqQuestion(i + 1))} placeholder={t.tasks.newAnswer} context={f.question} onCommit={(answer) => save([cmd('faq.update', { faqId: f.id, answer })])} />
              <IconButton size="sm" label={t.tasks.removeFaq} className="no-print opacity-0 group-focus-within/f:opacity-100 group-hover/f:opacity-100" onPress={() => save([cmd('faq.remove', { faqId: f.id })])}>
                <Trash2 size={14} strokeWidth={1.5} />
              </IconButton>
            </dd>
          </div>
        ))}
      </dl>
      <AddButton label={t.tasks.addFaq} onPress={add} />
    </div>
  );
}
