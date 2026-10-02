import { cmd, isBlankCriterion, newId, type Course, type Label, type Rubric } from '@folio/core';
import { IconButton, InlineNumber, useMediaQuery } from '@folio/ui';
import { X } from 'lucide-react';
import type { FocusEvent } from 'react';
import { EditableText } from '../components/editing/EditableText';
import { useT } from '../i18n';
import { AddButton } from './EditableList';
import { addItem, leaveBlank } from './newItems';
import { sectionLabel, useSectionEdit } from './useSectionEdit';

type Update = (next: Omit<Rubric, 'id'>) => void;

/** What a level can be worth. */
const POINTS = { min: 0, max: 100 } as const;

interface RubricProps {
  rubric: Rubric;
  update: Update;
  /** onBlur for a criterion's row: an added criterion left blank goes again. */
  leave: (criterionId: string) => (e: FocusEvent<HTMLElement>) => void;
  /** The level of a criterion's heading on a phone: one under the heading the rubric sits beneath. */
  level?: 4 | 5;
}

const withoutId = ({ id: _id, ...rest }: Rubric): Omit<Rubric, 'id'> => rest;

function LevelLabel({ rubric, levelId, update }: { rubric: Rubric; levelId: string; update: Update }) {
  const t = useT();
  const level = rubric.levels.find((l) => l.id === levelId);
  if (!level) return null;
  const n = rubric.levels.indexOf(level) + 1;
  const setLevel = (fields: Partial<typeof level>) => update({ ...withoutId(rubric), levels: rubric.levels.map((x) => (x.id === levelId ? { ...x, ...fields } : x)) });
  return (
    <>
      <EditableText value={level.label} label={t.tasks.levelName(n)} className="text-13 font-semibold text-ink" onCommit={(label) => setLevel({ label })} />
      <span className="mt-1 block">
        <InlineNumber
          label={t.tasks.levelPoints(level.label || t.tasks.levelName(n))}
          value={level.points}
          minValue={POINTS.min}
          maxValue={POINTS.max}
          fractionDigits={1}
          hint={t.tasks.pointsHint(POINTS.min, POINTS.max)}
          unit={t.tasks.pointsUnit(level.points)}
          className="text-12 font-normal text-ink-2 tabular"
          onChange={(points) => setLevel({ points })}
        />
      </span>
    </>
  );
}

function criterionName(rubric: Rubric, criterionId: string, t: ReturnType<typeof useT>): string {
  const i = rubric.criteria.findIndex((x) => x.id === criterionId);
  return rubric.criteria[i]?.name || t.tasks.criterionName(i + 1);
}

function Descriptor({ rubric, criterionId, levelId, update }: { rubric: Rubric; criterionId: string; levelId: string; update: Update }) {
  const t = useT();
  const c = rubric.criteria.find((x) => x.id === criterionId);
  const lv = rubric.levels.find((x) => x.id === levelId);
  if (!c || !lv) return null;
  return (
    <EditableText
      multiline
      value={c.descriptors[lv.id] ?? ''}
      label={t.tasks.descriptor(criterionName(rubric, c.id, t), lv.label)}
      onCommit={(text) => update({ ...withoutId(rubric), criteria: rubric.criteria.map((x) => (x.id === c.id ? { ...x, descriptors: { ...x.descriptors, [lv.id]: text } } : x)) })}
    />
  );
}

/** A criterion's name, with its remove button revealed on hover or focus. */
function CriterionName({ rubric, criterionId, update }: { rubric: Rubric; criterionId: string; update: Update }) {
  const t = useT();
  const c = rubric.criteria.find((x) => x.id === criterionId);
  if (!c) return null;
  const base = withoutId(rubric);
  return (
    <span className="flex items-start gap-1 hyphens-auto">
      <EditableText
        value={c.name}
        label={t.tasks.criterionName(rubric.criteria.indexOf(c) + 1)}
        className="min-w-0 flex-1"
        onCommit={(name) => update({ ...base, criteria: rubric.criteria.map((x) => (x.id === c.id ? { ...x, name } : x)) })}
      />
      <IconButton
        size="sm"
        tooltip={false}
        label={t.common.labelled(t.common.remove, criterionName(rubric, c.id, t))}
        className="no-print size-6 opacity-0 pointer-coarse:opacity-100 group-focus-within/crit:opacity-100 group-hover/crit:opacity-100"
        onPress={() => update({ ...base, criteria: rubric.criteria.filter((x) => x.id !== c.id) })}
      >
        <X size={13} strokeWidth={1.5} />
      </IconButton>
    </span>
  );
}

/** Wide screens: criteria down the side, levels across the top. */
function Grid({ rubric, update, leave }: RubricProps) {
  const t = useT();
  return (
    <table className="w-full min-w-xl table-fixed border-collapse font-ui text-14 leading-5">
      <thead>
        <tr>
          <th scope="col" className="w-1/4 border-b border-rule-strong px-2 py-2 text-left text-12 font-semibold text-ink-2">
            {t.tasks.criterion}
          </th>
          {rubric.levels.map((lv) => (
            <th key={lv.id} scope="col" className="border-b border-rule-strong px-2 py-2 text-left align-bottom">
              <LevelLabel rubric={rubric} levelId={lv.id} update={update} />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rubric.criteria.map((c) => (
          <tr key={c.id} data-item={c.id} className="group/crit align-top" onBlur={leave(c.id)}>
            <th scope="row" className="border-b border-rule px-2 py-3 text-left font-semibold text-ink">
              <CriterionName rubric={rubric} criterionId={c.id} update={update} />
            </th>
            {rubric.levels.map((lv) => (
              <td key={lv.id} className="border-b border-rule px-2 py-3 text-ink-2">
                <Descriptor rubric={rubric} criterionId={c.id} levelId={lv.id} update={update} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Phones: one criterion at a time, its levels stacked from best to least, so nothing scrolls sideways. */
function Stacked({ rubric, update, leave, level = 4 }: RubricProps) {
  const Criterion = level === 5 ? 'h5' : 'h4';
  return (
    <ol className="font-ui text-14 leading-5">
      {rubric.criteria.map((c) => (
        <li key={c.id} data-item={c.id} className="group/crit border-b border-rule py-4 first:border-t first:border-rule-strong" onBlur={leave(c.id)}>
          <Criterion className="mb-3 font-semibold text-ink">
            <CriterionName rubric={rubric} criterionId={c.id} update={update} />
          </Criterion>
          <dl className="space-y-3 border-l-2 border-rule pl-3">
            {rubric.levels.map((lv) => (
              <div key={lv.id}>
                <dt className="flex items-baseline gap-2">
                  <LevelLabel rubric={rubric} levelId={lv.id} update={update} />
                </dt>
                <dd className="mt-0.5 text-ink-2">
                  <Descriptor rubric={rubric} criterionId={c.id} levelId={lv.id} update={update} />
                </dd>
              </div>
            ))}
          </dl>
        </li>
      ))}
    </ol>
  );
}

/** Criteria × levels, every cell edited in place. */
export function RubricTable({ course, lessonId, rubric, level }: { course: Course; lessonId: string; rubric: Rubric; level?: 4 | 5 }) {
  const t = useT();
  const phone = useMediaQuery('(max-width: 639px)');
  const save = useSectionEdit(course, lessonId, 'rubrics');
  const label: Label = sectionLabel(course, lessonId, 'rubrics');
  const update: Update = (next) => save([cmd('rubric.update', { rubricId: rubric.id, rubric: next })]);
  const add = () => {
    const id = newId('x');
    addItem(id, [cmd('rubric.update', { rubricId: rubric.id, rubric: { ...withoutId(rubric), criteria: [...rubric.criteria, { id, name: '', descriptors: {} }] } })], label);
  };
  const leave = (criterionId: string) =>
    leaveBlank(
      criterionId,
      (c) => Boolean(c.rubrics[rubric.id]?.criteria.some((x) => x.id === criterionId && isBlankCriterion(x))),
      (c) => {
        const now = c.rubrics[rubric.id];
        return now ? [cmd('rubric.update', { rubricId: rubric.id, rubric: { ...withoutId(now), criteria: now.criteria.filter((x) => x.id !== criterionId) } })] : [];
      },
      label,
    );
  const Layout = phone ? Stacked : Grid;
  return (
    <div className={phone ? '' : '-mx-1 overflow-x-auto'} lang={course.language}>
      <Layout rubric={rubric} update={update} leave={leave} level={level} />
      <AddButton label={t.tasks.addCriterion} onPress={add} />
    </div>
  );
}
