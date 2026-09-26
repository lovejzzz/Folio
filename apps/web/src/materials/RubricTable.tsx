import { cmd, newId, type Course, type Rubric } from '@folio/core';
import { EditableText } from '../components/editing/EditableText';
import { useT } from '../i18n';
import { AddButton } from './EditableList';
import { useSectionEdit } from './useSectionEdit';

/** Criteria × levels, every cell edited in place. */
export function RubricTable({ course, lessonId, rubric }: { course: Course; lessonId: string; rubric: Rubric }) {
  const t = useT();
  const save = useSectionEdit(course, lessonId, 'rubrics');
  const update = (next: Omit<Rubric, 'id'>) => save([cmd('rubric.update', { rubricId: rubric.id, rubric: next })]);
  const { id: _id, ...base } = rubric;
  return (
    <div className="-mx-1 overflow-x-auto" lang={course.language}>
      <table className="w-full min-w-xl table-fixed border-collapse font-ui text-14 leading-5">
        <thead>
          <tr>
            <th scope="col" className="w-1/5 border-b border-rule-strong px-2 py-2 text-left text-12 font-semibold text-ink-2">
              {t.tasks.criterion}
            </th>
            {rubric.levels.map((lv) => (
              <th key={lv.id} scope="col" className="border-b border-rule-strong px-2 py-2 text-left align-bottom">
                <EditableText value={lv.label} label={t.tasks.criterion} className="text-13 font-semibold text-ink" onCommit={(label) => update({ ...base, levels: rubric.levels.map((x) => (x.id === lv.id ? { ...x, label } : x)) })} />
                <span className="block text-12 font-normal text-ink-2 tabular">{t.tasks.points(lv.points)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rubric.criteria.map((c) => (
            <tr key={c.id} className="align-top">
              <th scope="row" className="border-b border-rule px-2 py-3 text-left font-semibold text-ink">
                <EditableText value={c.name} label={t.tasks.criterion} onCommit={(name) => update({ ...base, criteria: rubric.criteria.map((x) => (x.id === c.id ? { ...x, name } : x)) })} />
              </th>
              {rubric.levels.map((lv) => (
                <td key={lv.id} className="border-b border-rule px-2 py-3 text-ink-2">
                  <EditableText
                    multiline
                    value={c.descriptors[lv.id] ?? ''}
                    label={`${c.name}, ${lv.label}`}
                    onCommit={(text) => update({ ...base, criteria: rubric.criteria.map((x) => (x.id === c.id ? { ...x, descriptors: { ...x.descriptors, [lv.id]: text } } : x)) })}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <AddButton
        label={t.tasks.addCriterion}
        onPress={() => update({ ...base, criteria: [...rubric.criteria, { id: newId('x'), name: t.tasks.criterion, descriptors: {} }] })}
      />
    </div>
  );
}
