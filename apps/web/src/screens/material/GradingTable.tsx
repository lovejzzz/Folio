import { GradeCardSchema, cmd, componentPieces, newId, type Course, type GradeCard, type GradeItem, type Label } from '@folio/core';
import { IconButton, InlineNumber, cx } from '@folio/ui';
import { X } from 'lucide-react';
import { EditableText } from '../../components/editing/EditableText';
import { useT } from '../../i18n';
import { AddButton } from '../../materials/EditableList';
import { addItem, leaveBlank } from '../../materials/newItems';
import { edit } from '../../state/edit';

/** What one component can weigh, in percent. */
const WEIGHT = { min: 0, max: 100 } as const;

const LABEL: Label = { key: 'editedGrading' };

/** Weights may be fractional; add them up without floating-point noise. */
function sum(items: GradeItem[]): number {
  return Math.round(items.reduce((n, g) => n + g.weight, 0) * 10) / 10;
}

function save(grading: GradeItem[]): void {
  edit([cmd('course.update', { grading })], LABEL);
}

/** Adds a component, weighted with whatever is left of 100%, and puts the caret in its name. */
export function addGradeItem(course: Course): void {
  const id = newId('g');
  // With no weights given yet, a new component has none either, rather than all of it.
  const given = sum(course.grading);
  const weight = course.grading.length && given === 0 ? 0 : Math.max(0, Math.min(WEIGHT.max, Math.round((100 - given) * 10) / 10));
  addItem(id, [cmd('course.update', { grading: [...course.grading, { id, item: '', weight }] })], LABEL);
}

export function AddGradeItem({ course }: { course: Course }) {
  const t = useT();
  return <AddButton label={t.tasks.addGradeItem} onPress={() => addGradeItem(course)} />;
}

const WHO = ['individual', 'pair', 'group'] as const;
const HAND_IN = ['paper', 'online', 'none'] as const;
const next = <T,>(all: readonly T[], now: T): T => all[(all.indexOf(now) + 1) % all.length]!;

/**
 * How the component runs, as every page Folio writes is told it: who does a piece and how it is handed in. Shown so a
 * teacher who means otherwise sees it, and changed with a press, as scoring is.
 */
function Runs({ item, name, set }: { item: GradeItem; name: string; set: (fields: Partial<GradeItem>) => void }) {
  const t = useT();
  const card: GradeCard = item.card ?? GradeCardSchema.parse({});
  const link = 'underline decoration-rule-strong underline-offset-2 hover:text-ink';
  return (
    <span className="no-print mt-0.5 block text-12 font-normal text-ink-2">
      <button type="button" aria-label={t.tasks.gradeWhoOf(name)} className={link} onClick={() => set({ card: { ...card, who: next(WHO, card.who), groupSize: undefined } })}>
        {t.tasks.gradeWho[card.who]}
      </button>
      {' · '}
      <button type="button" aria-label={t.tasks.gradeHandInOf(name)} className={link} onClick={() => set({ card: { ...card, handIn: next(HAND_IN, card.handIn) } })}>
        {t.tasks.gradeHandIn[card.handIn]}
      </button>
    </span>
  );
}

function Row({ course, item, i }: { course: Course; item: GradeItem; i: number }) {
  const t = useT();
  const name = item.item || t.tasks.gradeItemOf(i + 1);
  const pieces = componentPieces(course).get(item.item.trim())?.length ?? 0;
  const set = (fields: Partial<GradeItem>) => save(course.grading.map((g) => (g.id === item.id ? { ...g, ...fields } : g)));
  return (
    <tr
      data-item={item.id}
      className="group/grade align-top"
      onBlur={leaveBlank(
        item.id,
        (c) => c.grading.some((g) => g.id === item.id && !g.item.trim()),
        (c) => [cmd('course.update', { grading: c.grading.filter((g) => g.id !== item.id) })],
        LABEL,
      )}
    >
      <td className="border-b border-rule px-2 py-2.5 font-medium text-ink">
        <span className="flex items-start gap-1">
          <EditableText value={item.item} label={t.tasks.gradeItemOf(i + 1)} placeholder={t.tasks.gradeItemHint} lang={course.language} className="min-w-0 flex-1" onCommit={(text) => set({ item: text })} />
          <IconButton
            size="sm"
            tooltip={false}
            label={t.tasks.removeGradeItem(name)}
            className="no-print -my-0.5 size-6 opacity-0 pointer-coarse:opacity-100 group-focus-within/grade:opacity-100 group-hover/grade:opacity-100"
            onPress={() => save(course.grading.filter((g) => g.id !== item.id))}
          >
            <X size={13} strokeWidth={1.5} />
          </IconButton>
        </span>
        {/* One fact for every page Folio writes: this component's work is scored, or it is complete or incomplete. */}
        <button
          type="button"
          aria-label={t.tasks.gradeJudgedOf(name)}
          className="no-print mt-0.5 block text-12 font-normal text-ink-2 underline decoration-rule-strong underline-offset-2 hover:text-ink"
          onClick={() => set({ judged: item.judged === 'complete' ? 'levels' : 'complete' })}
        >
          {item.judged === 'complete' ? t.tasks.gradeComplete : t.tasks.gradeScored}
        </button>
        <Runs item={item} name={name} set={set} />
        {/* What Folio told every writer: the pieces of one component count equally. Shown, so a teacher who means otherwise sees it. */}
        {pieces > 1 && <span className="mt-0.5 block text-12 font-normal text-ink-2">{t.tasks.gradePieces(pieces, item.weight > 0 ? String(Math.round((item.weight / pieces) * 10) / 10) : '')}</span>}
      </td>
      <td className="border-b border-rule px-2 py-2.5 text-right text-ink-2">
        <InlineNumber
          label={t.tasks.gradeWeightOf(name)}
          // A weight the brief didn't state is 0: a dash to fill in, not a share of nothing.
          value={item.weight > 0 ? item.weight : Number.NaN}
          placeholder="—"
          minValue={WEIGHT.min}
          maxValue={WEIGHT.max}
          fractionDigits={1}
          hint={t.tasks.weightHint(WEIGHT.min, WEIGHT.max)}
          unit={item.weight > 0 ? <span className="-ml-1">%</span> : undefined}
          className="-my-0.5 items-end tabular"
          onChange={(weight) => set({ weight })}
        />
      </td>
    </tr>
  );
}

/**
 * The grading scheme on the syllabus, edited in place: what is graded and how
 * much each part weighs, with the total kept in view.
 */
export function GradingTable({ course }: { course: Course }) {
  const t = useT();
  const total = sum(course.grading);
  const off = total !== 100;
  return (
    <div className="-mx-1 mt-5">
      <table className="w-full border-collapse font-ui text-14 leading-5" aria-label={t.tasks.grading}>
        <colgroup>
          <col />
          <col className="w-28" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className="border-b border-rule-strong px-2 py-2 text-left text-12 font-semibold text-ink-2">
              {t.tasks.gradeItem}
            </th>
            <th scope="col" className="border-b border-rule-strong px-2 py-2 text-right text-12 font-semibold text-ink-2">
              {t.tasks.gradeWeight}
            </th>
          </tr>
        </thead>
        <tbody>
          {course.grading.map((g, i) => (
            <Row key={g.id} course={course} item={g} i={i} />
          ))}
        </tbody>
        <tfoot>
          <tr className="align-top">
            <th scope="row" className="px-2 py-2.5 text-left font-semibold text-ink">
              {t.tasks.gradeTotal}
              {total === 0 ? <span className="ml-3 text-13 font-normal text-ink-2">{t.tasks.gradeNoWeights}</span> : off && <span className="ml-3 text-13 font-normal text-attention">{t.tasks.gradeTotalOff}</span>}
            </th>
            <td className={cx('px-2 py-2.5 text-right font-semibold tabular', off && total > 0 ? 'text-attention' : 'text-ink')}>{total > 0 ? `${total}%` : '—'}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
