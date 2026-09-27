import { cmd, isBlankQuestion, isBlankText, newId, type Course, type Label, type Question } from '@folio/core';
import { IconButton, cx } from '@folio/ui';
import { Check, ChevronRight, EyeOff, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { EditableText } from '../components/editing/EditableText';
import { useT } from '../i18n';
import { FlagNote } from './FlagNote';
import { AddButton } from './EditableList';
import { addItem, leaveBlank } from './newItems';
import { SourceChip } from './SourceChip';
import { sectionLabel, useSectionEdit } from './useSectionEdit';

/** The question as it is now, after any commit made by the blur being handled. */
const questionIn = (c: Course, id: string): Question | null => {
  const task = c.tasks[id];
  return task?.kind === 'question' ? task : null;
};

/** onBlur for a choice: one added with "Add a choice" and left blank goes again. */
const leaveBlankChoice = (questionId: string, choiceId: string, label: Label) =>
  leaveBlank(
    choiceId,
    (c) => isBlankText(questionIn(c, questionId)?.choices.find((x) => x.id === choiceId)?.text ?? 'gone'),
    (c) => {
      const now = questionIn(c, questionId);
      if (!now) return [];
      const choices = now.choices.filter((x) => x.id !== choiceId);
      return [cmd('task.update', { taskId: questionId, fields: { choices, correct: now.correct === choiceId ? null : now.correct } })];
    },
    label,
  );

function Choices({ q, update, label }: { q: Question; update: (fields: Partial<Question>) => void; label: Label }) {
  const t = useT();
  const addChoice = () => {
    const id = newId('x');
    addItem(id, [cmd('task.update', { taskId: q.id, fields: { choices: [...q.choices, { id, text: '' }] } })], label);
  };
  return (
    <ol className="mt-3 space-y-1.5">
      {q.choices.map((c, i) => {
        const correct = q.correct === c.id;
        return (
          <li key={c.id} data-item={c.id} className="group/choice flex items-start gap-3" onBlur={leaveBlankChoice(q.id, c.id, label)}>
            <button
              type="button"
              aria-pressed={correct}
              aria-label={t.common.labelled(t.quiz.markCorrect, String.fromCharCode(65 + i))}
              onClick={() => update({ correct: c.id })}
              className={cx(
                'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border font-ui text-12 font-medium outline-none transition-colors duration-120 focus-visible:ring-2 focus-visible:ring-accent',
                correct ? 'border-good bg-good text-paper' : 'border-rule-strong text-ink-2 hover:border-good hover:text-good',
              )}
            >
              {correct ? <Check size={13} strokeWidth={2.5} /> : String.fromCharCode(65 + i)}
            </button>
            <EditableText
              value={c.text}
              label={t.quiz.choice(String.fromCharCode(65 + i))}
              className={cx('min-w-0 flex-1', correct && 'font-medium')}
              onCommit={(text) => update({ choices: q.choices.map((x) => (x.id === c.id ? { ...x, text } : x)) })}
            />
            {q.format === 'choice' && (
              <IconButton
                size="sm"
                tooltip={false}
                label={t.quiz.removeChoice}
                className="no-print size-6 opacity-0 group-focus-within/choice:opacity-100 group-hover/choice:opacity-100"
                onPress={() => update({ choices: q.choices.filter((x) => x.id !== c.id), correct: correct ? null : q.correct })}
              >
                <X size={13} strokeWidth={1.5} />
              </IconButton>
            )}
          </li>
        );
      })}
      {q.format === 'choice' && q.choices.length < 6 && (
        <li className="pl-9">
          <AddButton className="mt-0" label={t.quiz.addChoice} onPress={addChoice} />
        </li>
      )}
    </ol>
  );
}

function AnswerFold({ q, update }: { q: Question; update: (fields: Partial<Question>) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const graded = q.format === 'choice' || q.format === 'truefalse';
  return (
    <div className="mt-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="no-print inline-flex items-center gap-1 rounded-control font-ui text-13 font-medium text-ink-2 outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
      >
        <ChevronRight size={14} strokeWidth={1.75} className={cx('transition-transform duration-200 ease-ink', open && 'rotate-90')} aria-hidden />
        {open ? t.quiz.hideAnswer : t.quiz.showAnswer}
      </button>
      {open && (
        <div className="mt-2 space-y-2 rounded-control border-l-2 border-good bg-well px-4 py-3 text-16 leading-7 animate-fade-in">
          <p className="flex items-center gap-1.5 whitespace-nowrap font-ui text-12 text-ink-2">
            <EyeOff size={12} strokeWidth={1.75} aria-hidden />
            {t.quiz.teacherOnly}
          </p>
          {!graded && (
            <p>
              <span className="mr-1.5 font-ui text-13 font-semibold text-ink">{t.quiz.modelAnswer}</span>
              <EditableText multiline value={q.answer} label={t.quiz.modelAnswer} onCommit={(answer) => update({ answer })} />
            </p>
          )}
          <p>
            <span className="mr-1.5 font-ui text-13 font-semibold text-ink">{t.quiz.explanation}</span>
            <EditableText multiline value={q.explanation} label={t.quiz.explanation} onCommit={(explanation) => update({ explanation })} />
          </p>
        </div>
      )}
    </div>
  );
}

/** One question: stem, choices, and the answer key folded away. */
export function QuestionCard({ course, q, n }: { course: Course; q: Question; n: number }) {
  const t = useT();
  const save = useSectionEdit(course, q.lessonId, 'quiz');
  const label = sectionLabel(course, q.lessonId, 'quiz');
  const update = (fields: Partial<Question>) => save([cmd('task.update', { taskId: q.id, fields })]);
  const blank = (c: Course) => {
    const now = questionIn(c, q.id);
    return Boolean(now && isBlankQuestion(now));
  };
  return (
    <article
      data-item={q.id}
      className="group/q avoid-break relative border-t border-rule py-6 first:border-t-0"
      lang={course.language}
      aria-label={t.quiz.question(n)}
      onBlur={leaveBlank(q.id, blank, () => [cmd('task.remove', { taskId: q.id })], label)}
    >
      <header className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 font-ui text-12 text-ink-2">
        <span className="font-mono text-13 text-ink tabular">{String(n).padStart(2, '0')}</span>
        <span aria-hidden>·</span>
        <span className="whitespace-nowrap">{t.quiz.formats[q.format]}</span>
        <span aria-hidden>·</span>
        <span className="whitespace-nowrap">{t.quiz.difficulty[q.difficulty - 1]}</span>
        {q.sourceRefs.length > 0 && <SourceChip course={course} refs={q.sourceRefs} />}
        <IconButton
          size="sm"
          label={t.quiz.removeQuestion}
          className="no-print ml-auto opacity-0 group-focus-within/q:opacity-100 group-hover/q:opacity-100"
          onPress={() => save([cmd('task.remove', { taskId: q.id })])}
        >
          <Trash2 size={14} strokeWidth={1.5} />
        </IconButton>
      </header>
      {q.flags.length > 0 && <FlagNote flags={q.flags} lessonId={q.lessonId} kind="quiz" itemId={q.id} />}
      <EditableText as="p" multiline value={q.prompt} label={t.quiz.question(n)} context={q.explanation} className="block font-reading text-17 leading-7 text-ink" onCommit={(prompt) => update({ prompt })} />
      {(q.format === 'choice' || q.format === 'truefalse') && <Choices q={q} update={update} label={label} />}
      <AnswerFold q={q} update={update} />
    </article>
  );
}
