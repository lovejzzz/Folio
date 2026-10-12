import type { PlannedTask } from '@folio/ai';
import type { Course } from '@folio/core';
import { useT } from '../../i18n';
import { commandText } from '../../i18n/commandText';
import type { AfterPlan } from '../../state/afterPlan';
import { estimateLines } from '../../state/estimate';
import { estimateOf, usePaying } from '../../screens/plan/CreditsNote';

const text = commandText.work;

/**
 * What applying a plan goes on to write, and what that takes: read from the same account Apply runs (`afterPlan`), on the
 * course as the plan's steps leave it. Nothing is asked of a model to show it.
 */
export function PlanWork({ course, work }: { course: Course; work: AfterPlan }) {
  const t = useT();
  const pay = usePaying();
  const again = new Set(work.updates.map((u) => `${u.lessonId}:${u.kind}`));
  const name = (kind: PlannedTask['kind']) => (kind === 'facts' ? text.facts : t.materials[kind]);
  const number = (lessonId: string) => course.lessonOrder.indexOf(lessonId) + 1;
  // A line a material and a reason, with the lessons it is written for.
  const groups = new Map<string, { task: PlannedTask; lessons: number[] }>();
  for (const task of work.tasks) {
    const key = `${task.kind}|${task.neededBy ?? ''}|${again.has(`${task.lessonId}:${task.kind}`)}`;
    groups.set(key, { task, lessons: [...(groups.get(key)?.lessons ?? []), task.lesson] });
  }
  const line = ({ task, lessons }: { task: PlannedTask; lessons: number[] }) => {
    const said = { material: name(task.kind), lessons: text.lessons(lessons) };
    if (task.neededBy) return text.needed({ ...said, by: t.materials[task.neededBy] });
    return again.has(`${task.lessonId}:${task.kind}`) ? text.again(said) : text.fresh(said);
  };
  const kept = work.kept.map((k) => `${t.materials[k.kind]}, ${text.lessons([number(k.lessonId)])}`).join('; ');
  return (
    <div role="note" aria-label={text.title} className="mt-3 border-t border-rule pt-3 font-ui text-13 leading-5 text-ink-2">
      {work.tasks.length === 0 ? (
        <p>{text.nothing}</p>
      ) : (
        <>
          <p className="font-semibold text-ink">{text.title}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink">
            {[...groups.values()].map((g) => (
              <li key={line(g)}>{line(g)}</li>
            ))}
          </ul>
          {estimateLines(estimateOf(course, work.tasks), pay).map((l) => (
            <p key={l} className="mt-1">
              {l}
            </p>
          ))}
        </>
      )}
      {kept && <p className="mt-1">{text.kept({ parts: kept })}</p>}
    </div>
  );
}
