import { cmd, newId, type Course, type Rubric } from '@folio/core';
import { useMediaQuery } from '@folio/ui';
import { EditableText } from '../components/editing/EditableText';
import { useT } from '../i18n';
import { AddButton } from './EditableList';
import { useSectionEdit } from './useSectionEdit';

type Update = (next: Omit<Rubric, 'id'>) => void;

function LevelLabel({ rubric, levelId, update }: { rubric: Rubric; levelId: string; update: Update }) {
  const t = useT();
  const { id: _id, ...base } = rubric;
  const level = rubric.levels.find((l) => l.id === levelId);
  if (!level) return null;
  return (
    <>
      <EditableText value={level.label} label={t.tasks.criterion} className="text-13 font-semibold text-ink" onCommit={(label) => update({ ...base, levels: rubric.levels.map((x) => (x.id === levelId ? { ...x, label } : x)) })} />
      <span className="block text-12 font-normal text-ink-2 tabular">{t.tasks.points(level.points)}</span>
    </>
  );
}

function Descriptor({ rubric, criterionId, levelId, update }: { rubric: Rubric; criterionId: string; levelId: string; update: Update }) {
  const { id: _id, ...base } = rubric;
  const c = rubric.criteria.find((x) => x.id === criterionId);
  const lv = rubric.levels.find((x) => x.id === levelId);
  if (!c || !lv) return null;
  return (
    <EditableText
      multiline
      value={c.descriptors[lv.id] ?? ''}
      label={`${c.name}, ${lv.label}`}
      onCommit={(text) => update({ ...base, criteria: rubric.criteria.map((x) => (x.id === c.id ? { ...x, descriptors: { ...x.descriptors, [lv.id]: text } } : x)) })}
    />
  );
}

function CriterionName({ rubric, criterionId, update }: { rubric: Rubric; criterionId: string; update: Update }) {
  const t = useT();
  const { id: _id, ...base } = rubric;
  const c = rubric.criteria.find((x) => x.id === criterionId);
  if (!c) return null;
  return <EditableText value={c.name} label={t.tasks.criterion} onCommit={(name) => update({ ...base, criteria: rubric.criteria.map((x) => (x.id === c.id ? { ...x, name } : x)) })} />;
}

/** Wide screens: criteria down the side, levels across the top. */
function Grid({ rubric, update }: { rubric: Rubric; update: Update }) {
  const t = useT();
  return (
    <table className="w-full min-w-xl table-fixed border-collapse font-ui text-14 leading-5">
      <thead>
        <tr>
          <th scope="col" className="w-1/5 border-b border-rule-strong px-2 py-2 text-left text-12 font-semibold text-ink-2">
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
          <tr key={c.id} className="align-top">
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
function Stacked({ rubric, update }: { rubric: Rubric; update: Update }) {
  return (
    <ol className="font-ui text-14 leading-5">
      {rubric.criteria.map((c) => (
        <li key={c.id} className="border-b border-rule py-4 first:border-t first:border-rule-strong">
          <h4 className="mb-3 font-semibold text-ink">
            <CriterionName rubric={rubric} criterionId={c.id} update={update} />
          </h4>
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
export function RubricTable({ course, lessonId, rubric }: { course: Course; lessonId: string; rubric: Rubric }) {
  const t = useT();
  const phone = useMediaQuery('(max-width: 639px)');
  const save = useSectionEdit(course, lessonId, 'rubrics');
  const update: Update = (next) => save([cmd('rubric.update', { rubricId: rubric.id, rubric: next })]);
  const { id: _id, ...base } = rubric;
  return (
    <div className={phone ? '' : '-mx-1 overflow-x-auto'} lang={course.language}>
      {phone ? <Stacked rubric={rubric} update={update} /> : <Grid rubric={rubric} update={update} />}
      <AddButton
        label={t.tasks.addCriterion}
        onPress={() => update({ ...base, criteria: [...rubric.criteria, { id: newId('x'), name: t.tasks.criterion, descriptors: {} }] })}
      />
    </div>
  );
}
