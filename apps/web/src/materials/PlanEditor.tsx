import { cmd, isBlankSegment, isBlankTerm, newId, type Course, type Lesson, type Segment } from '@folio/core';
import { IconButton, InlineNumber, cx } from '@folio/ui';
import { X } from 'lucide-react';
import { EditableText } from '../components/editing/EditableText';
import { useT } from '../i18n';
import { AddButton, EditableList } from './EditableList';
import { addItem, leaveBlank } from './newItems';
import { sectionLabel, useSectionEdit } from './useSectionEdit';

/** Minutes a single step can take. */
const MINUTES = { min: 1, max: 600 } as const;

interface SegmentRowProps {
  segment: Segment;
  n: number;
  onChange: (s: Segment) => void;
  onRemove: () => void;
  onBlur: (e: React.FocusEvent<HTMLElement>) => void;
  lang: string;
}

function SegmentRow({ segment, n, onChange, onRemove, onBlur, lang }: SegmentRowProps) {
  const t = useT();
  const name = segment.title || t.lesson.segmentTitle(n);
  return (
    <li data-item={segment.id} onBlur={onBlur} className="group/seg avoid-break relative grid grid-cols-1 gap-x-6 border-t border-rule py-4 first:border-t-0 sm:grid-cols-12">
      <div className="flex items-baseline gap-2 font-ui text-13 text-ink-2 sm:col-span-3 sm:flex-col sm:gap-1">
        <span className="font-medium text-ink">{t.lesson.segmentKinds[segment.kind]}</span>
        <InlineNumber
          label={t.lesson.segmentMinutes(n)}
          value={segment.minutes}
          minValue={MINUTES.min}
          maxValue={MINUTES.max}
          hint={t.lesson.minutesHint(MINUTES.min, MINUTES.max)}
          unit={t.lesson.minutesUnit}
          className="tabular"
          onChange={(minutes) => onChange({ ...segment, minutes })}
        />
      </div>
      <div className="min-w-0 sm:col-span-9" lang={lang}>
        <EditableText as="h4" value={segment.title} label={t.lesson.segmentTitle(n)} className="block font-reading text-17 font-semibold text-ink" onCommit={(title) => onChange({ ...segment, title })} />
        <EditableText
          as="p"
          multiline
          value={segment.description}
          label={name}
          placeholder={t.lesson.segmentDescription}
          context={segment.title}
          className="mt-1 block"
          onCommit={(description) => onChange({ ...segment, description })}
        />
        <div className={cx('mt-2 rounded-control bg-well px-3 py-2 font-ui text-14 leading-6 text-ink-2', !segment.teacherNotes && 'no-print hidden group-focus-within/seg:block group-hover/seg:block')}>
          <span className="mr-1.5 font-medium text-ink">
            {t.lesson.teacherNotes}
            {t.common.colon}
          </span>
          <EditableText multiline value={segment.teacherNotes} label={t.common.labelled(t.lesson.teacherNotes, name)} placeholder="…" onCommit={(teacherNotes) => onChange({ ...segment, teacherNotes })} />
        </div>
      </div>
      <IconButton size="sm" label={t.common.labelled(t.common.remove, name)} className="no-print absolute right-0 top-3 opacity-0 group-focus-within/seg:opacity-100 group-hover/seg:opacity-100" onPress={onRemove}>
        <X size={14} strokeWidth={1.5} />
      </IconButton>
    </li>
  );
}

/** The lesson plan: key ideas, a timed run of the lesson, and vocabulary. */
export function PlanEditor({ course, lesson }: { course: Course; lesson: Lesson }) {
  const t = useT();
  const save = useSectionEdit(course, lesson.id, 'plan');
  const label = sectionLabel(course, lesson.id, 'plan');
  const total = lesson.segments.reduce((a, s) => a + s.minutes, 0);
  const setSegments = (segments: Segment[]) => save([cmd('plan.update', { lessonId: lesson.id, segments })]);
  const addSegment = () => {
    const id = newId('x');
    const segment: Segment = { id, kind: 'practice', title: '', minutes: 5, description: '', teacherNotes: '' };
    addItem(id, [cmd('plan.update', { lessonId: lesson.id, segments: [...lesson.segments, segment] })], label);
  };
  const segmentsNow = (c: Course) => c.lessons[lesson.id]?.segments ?? [];
  return (
    <div className="space-y-8">
      <section>
        <h4 className="mb-2 font-ui text-13 font-semibold text-ink">{t.lesson.keyIdeas}</h4>
        <EditableList
          items={lesson.keyIdeas}
          label={t.lesson.keyIdeas}
          addLabel={t.lesson.addIdea}
          placeholder={t.lesson.keyIdea}
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
              onBlur={leaveBlank(
                s.id,
                (c) => segmentsNow(c).some((x) => x.id === s.id && isBlankSegment(x)),
                (c) => [cmd('plan.update', { lessonId: lesson.id, segments: segmentsNow(c).filter((x) => x.id !== s.id) })],
                label,
              )}
            />
          ))}
        </ol>
        <AddButton label={t.lesson.addSegment} onPress={addSegment} />
      </section>
      <Vocabulary course={course} lesson={lesson} />
    </div>
  );
}

function Vocabulary({ course, lesson }: { course: Course; lesson: Lesson }) {
  const t = useT();
  const save = useSectionEdit(course, lesson.id, 'plan');
  const label = sectionLabel(course, lesson.id, 'plan');
  const set = (vocabulary: Lesson['vocabulary']) => save([cmd('plan.update', { lessonId: lesson.id, vocabulary })]);
  const termsNow = (c: Course) => c.lessons[lesson.id]?.vocabulary ?? [];
  const add = () => {
    const id = newId('x');
    addItem(id, [cmd('plan.update', { lessonId: lesson.id, vocabulary: [...lesson.vocabulary, { id, term: '', definition: '' }] })], label);
  };
  return (
    <section>
      <h4 className="mb-2 font-ui text-13 font-semibold text-ink">{t.lesson.vocabulary}</h4>
      <dl className="divide-y divide-rule">
        {lesson.vocabulary.map((v) => (
          <div
            key={v.id}
            data-item={v.id}
            className="group/term grid gap-x-6 py-2 sm:grid-cols-12"
            lang={course.language}
            onBlur={leaveBlank(
              v.id,
              (c) => termsNow(c).some((x) => x.id === v.id && isBlankTerm(x)),
              (c) => [cmd('plan.update', { lessonId: lesson.id, vocabulary: termsNow(c).filter((x) => x.id !== v.id) })],
              label,
            )}
          >
            <dt className="font-semibold sm:col-span-4">
              <EditableText value={v.term} label={t.lesson.term} onCommit={(term) => set(lesson.vocabulary.map((x) => (x.id === v.id ? { ...x, term } : x)))} />
            </dt>
            <dd className="flex items-start gap-1 sm:col-span-8">
              <EditableText
                multiline
                className="min-w-0 flex-1"
                value={v.definition}
                label={t.common.labelled(t.lesson.definition, v.term || t.lesson.term)}
                placeholder={t.lesson.definition}
                onCommit={(definition) => set(lesson.vocabulary.map((x) => (x.id === v.id ? { ...x, definition } : x)))}
              />
              <IconButton size="sm" tooltip={false} label={t.common.labelled(t.common.remove, v.term || t.lesson.term)} className="no-print size-6 opacity-0 group-focus-within/term:opacity-100 group-hover/term:opacity-100" onPress={() => set(lesson.vocabulary.filter((x) => x.id !== v.id))}>
                <X size={13} strokeWidth={1.5} />
              </IconButton>
            </dd>
          </div>
        ))}
      </dl>
      <AddButton label={t.lesson.addTerm} onPress={add} />
    </section>
  );
}
