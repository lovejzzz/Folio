import { cmd, newId, type Course, type Lesson, type Segment } from '@folio/core';
import { IconButton, cx } from '@folio/ui';
import { X } from 'lucide-react';
import { EditableText } from '../components/editing/EditableText';
import { useT } from '../i18n';
import { AddButton, EditableList } from './EditableList';
import { useSectionEdit } from './useSectionEdit';

function SegmentRow({ segment, n, onChange, onRemove, lang }: { segment: Segment; n: number; onChange: (s: Segment) => void; onRemove: () => void; lang: string }) {
  const t = useT();
  return (
    <li className="group/seg avoid-break relative grid grid-cols-1 gap-x-6 border-t border-rule py-4 first:border-t-0 sm:grid-cols-12">
      <div className="flex items-baseline gap-2 font-ui text-13 text-ink-2 sm:col-span-3 sm:flex-col sm:gap-1">
        <span className="font-medium text-ink">{t.lesson.segmentKinds[segment.kind]}</span>
        <span className="tabular">
          <EditableText
            value={String(segment.minutes)}
            label={t.common.labelled(segment.title, t.common.minutes(segment.minutes))}
            onCommit={(v) => {
              const minutes = Math.round(Number(v.replace(/[^\d.]/g, '')));
              if (Number.isFinite(minutes) && minutes >= 0) onChange({ ...segment, minutes });
            }}
          />{' '}
          {t.common.minutes(segment.minutes).replace(/^\d+\s*/, '')}
        </span>
      </div>
      <div className="min-w-0 sm:col-span-9" lang={lang}>
        <EditableText as="h4" value={segment.title} label={t.lesson.segmentTitle(n)} className="block font-reading text-17 font-semibold text-ink" onCommit={(title) => onChange({ ...segment, title })} />
        <EditableText as="p" multiline value={segment.description} label={segment.title} context={segment.title} className="mt-1 block" onCommit={(description) => onChange({ ...segment, description })} />
        <div className={cx('mt-2 rounded-control bg-well px-3 py-2 font-ui text-14 leading-6 text-ink-2', !segment.teacherNotes && 'no-print hidden group-focus-within/seg:block group-hover/seg:block')}>
            <span className="mr-1.5 font-medium text-ink">
              {t.lesson.teacherNotes}
              {t.common.colon}
            </span>
            <EditableText multiline value={segment.teacherNotes} label={t.common.labelled(t.lesson.teacherNotes, segment.title)} placeholder="…" onCommit={(teacherNotes) => onChange({ ...segment, teacherNotes })} />
        </div>
      </div>
      <IconButton size="sm" label={t.common.labelled(t.common.remove, segment.title)} className="no-print absolute right-0 top-3 opacity-0 group-focus-within/seg:opacity-100 group-hover/seg:opacity-100" onPress={onRemove}>
        <X size={14} strokeWidth={1.5} />
      </IconButton>
    </li>
  );
}

/** The lesson plan: key ideas, a timed run of the lesson, and vocabulary. */
export function PlanEditor({ course, lesson }: { course: Course; lesson: Lesson }) {
  const t = useT();
  const save = useSectionEdit(course, lesson.id, 'plan');
  const total = lesson.segments.reduce((a, s) => a + s.minutes, 0);
  const setSegments = (segments: Segment[]) => save([cmd('plan.update', { lessonId: lesson.id, segments })]);
  return (
    <div className="space-y-8">
      <section>
        <h4 className="mb-2 font-ui text-13 font-semibold text-ink">{t.lesson.keyIdeas}</h4>
        <EditableList
          items={lesson.keyIdeas}
          label={t.lesson.keyIdeas}
          addLabel={t.lesson.addIdea}
          newItem={t.lesson.addIdea}
          lang={course.language}
          context={lesson.title}
          onChange={(keyIdeas) => save([cmd('plan.update', { lessonId: lesson.id, keyIdeas })])}
        />
      </section>
      <section>
        <div className="mb-1 flex items-baseline justify-between gap-4">
          <h4 className="font-ui text-13 font-semibold text-ink">{t.lesson.segments}</h4>
          <span className={cx('font-ui text-13 tabular', total === course.shape.minutesPerLesson ? 'text-ink-2' : 'text-attention')}>
            {t.lesson.minutesTotal(total, course.shape.minutesPerLesson)}
          </span>
        </div>
        <ol>
          {lesson.segments.map((s, i) => (
            <SegmentRow
              key={s.id}
              segment={s}
              n={i + 1}
              lang={course.language}
              onChange={(next) => setSegments(lesson.segments.map((x) => (x.id === s.id ? next : x)))}
              onRemove={() => setSegments(lesson.segments.filter((x) => x.id !== s.id))}
            />
          ))}
        </ol>
        <AddButton
          label={t.lesson.addSegment}
          onPress={() => setSegments([...lesson.segments, { id: newId('x'), kind: 'practice', title: t.lesson.addSegment, minutes: 5, description: '', teacherNotes: '' }])}
        />
      </section>
      <Vocabulary course={course} lesson={lesson} />
    </div>
  );
}

function Vocabulary({ course, lesson }: { course: Course; lesson: Lesson }) {
  const t = useT();
  const save = useSectionEdit(course, lesson.id, 'plan');
  const set = (vocabulary: Lesson['vocabulary']) => save([cmd('plan.update', { lessonId: lesson.id, vocabulary })]);
  return (
    <section>
      <h4 className="mb-2 font-ui text-13 font-semibold text-ink">{t.lesson.vocabulary}</h4>
      <dl className="divide-y divide-rule">
        {lesson.vocabulary.map((v) => (
          <div key={v.id} className="group/term grid gap-x-6 py-2 sm:grid-cols-12" lang={course.language}>
            <dt className="font-semibold sm:col-span-4">
              <EditableText value={v.term} label={t.lesson.term} onCommit={(term) => set(lesson.vocabulary.map((x) => (x.id === v.id ? { ...x, term } : x)))} />
            </dt>
            <dd className="flex items-start gap-1 sm:col-span-8">
              <EditableText multiline className="min-w-0 flex-1" value={v.definition} label={t.common.labelled(t.lesson.definition, v.term)} onCommit={(definition) => set(lesson.vocabulary.map((x) => (x.id === v.id ? { ...x, definition } : x)))} />
              <IconButton size="sm" tooltip={false} label={t.common.labelled(t.common.remove, v.term)} className="no-print size-6 opacity-0 group-focus-within/term:opacity-100 group-hover/term:opacity-100" onPress={() => set(lesson.vocabulary.filter((x) => x.id !== v.id))}>
                <X size={13} strokeWidth={1.5} />
              </IconButton>
            </dd>
          </div>
        ))}
      </dl>
      <AddButton label={t.lesson.addTerm} onPress={() => set([...lesson.vocabulary, { id: newId('x'), term: t.lesson.term, definition: '' }])} />
    </section>
  );
}
