import { cmd, hasModulePages, type Online } from '@folio/core';
import { NumberStepper, Switch } from '@folio/ui';
import { useT } from '../../i18n';
import { edit } from '../../state/edit';
import { useCourse } from '../../state/session';

/**
 * What an online format commits the teacher to. Folio assumes the usual answers and shows them here: each can
 * be changed before the course is written.
 */
export function OnlineShape() {
  const t = useT();
  const course = useCourse();
  const online = course.online;
  if (!online) return null;
  const set = (patch: Partial<Online>) => edit([cmd('course.update', { online: patch })], { key: 'changedShape' });
  const live = course.delivery === 'online-sync' || course.delivery === 'online-mixed';
  return (
    <>
      {hasModulePages(course) && <NumberStepper label={t.plan.hoursPerWeek} minValue={1} maxValue={40} value={online.hoursPerWeek} onChange={(v) => Number.isFinite(v) && set({ hoursPerWeek: v })} />}
      {live && (
        <>
          <NumberStepper label={t.plan.classSize} minValue={1} maxValue={500} value={online.classSize} onChange={(v) => Number.isFinite(v) && set({ classSize: v })} />
          <Switch isSelected={online.breakouts} onChange={(breakouts) => set({ breakouts })}>
            {t.plan.breakouts}
          </Switch>
          <Switch isSelected={online.polls} onChange={(polls) => set({ polls })}>
            {t.plan.polls}
          </Switch>
          <Switch isSelected={online.recorded} onChange={(recorded) => set({ recorded })}>
            {t.plan.recorded}
          </Switch>
        </>
      )}
    </>
  );
}
