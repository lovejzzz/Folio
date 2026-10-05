import { cmd, type Course, type Handout, type Lesson } from '@folio/core';
import { EditableText } from '../components/editing/EditableText';
import { useT } from '../i18n';
import { Piece } from './Exhibit';
import { useSectionEdit } from './useSectionEdit';

/** One sheet as it will be printed, every word editable, and under it the answers a student never sees. */
function Sheet({ handout, change }: { handout: Handout; change: (next: Handout) => void }) {
  const t = useT();
  return (
    <li className="mod-handout avoid-break">
      <div className="mod-exhibit-head">
        <span>{t.handouts.kinds[handout.kind]}</span>
        <span>{[handout.copies, handout.usedIn && t.handouts.usedIn(handout.usedIn)].filter(Boolean).join(' · ')}</span>
      </div>
      <div className="mod-exhibit-body">
        <EditableText as="h4" className="mod-exhibit-title" value={handout.title} label={t.handouts.title} required onCommit={(title) => change({ ...handout, title })} />
        {handout.blocks.map((b, i) => (
          <Piece key={i} block={b} change={(next) => change({ ...handout, blocks: handout.blocks.map((x, n) => (n === i ? next : x)) })} />
        ))}
      </div>
      {handout.key.trim() && (
        <div className="mod-handout-key no-print">
          <p className="mod-kicker">{t.handouts.key}</p>
          <EditableText as="div" multiline className="mod-callout-body" value={handout.key} label={t.handouts.key} onCommit={(key) => change({ ...handout, key })} />
        </div>
      )}
    </li>
  );
}

/** The sheets a lesson hands out, written in full under its plan. */
export function Handouts({ course, lesson }: { course: Course; lesson: Lesson }) {
  const t = useT();
  const save = useSectionEdit(course, lesson.id, 'plan');
  if (!lesson.handouts.length) return null;
  const change = (next: Handout) => save([cmd('plan.update', { lessonId: lesson.id, handouts: lesson.handouts.map((h) => (h.id === next.id ? next : h)) })]);
  return (
    <section className="mod" aria-labelledby={`handouts-${lesson.id}`}>
      <h3 id={`handouts-${lesson.id}`} className="mb-1 font-ui text-13 font-semibold text-ink">
        {t.handouts.heading}
      </h3>
      <p className="mb-3 font-ui text-13 text-ink-2">{t.handouts.note}</p>
      <ul className="grid gap-6">
        {lesson.handouts.map((h) => (
          <Sheet key={h.id} handout={h} change={change} />
        ))}
      </ul>
    </section>
  );
}
