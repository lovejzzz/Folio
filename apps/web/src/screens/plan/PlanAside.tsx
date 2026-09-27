import { CORE_SET, MATERIAL_KINDS, SHAPE_LIMITS, cmd, newId, type MaterialKind } from '@folio/core';
import { Button, MaterialIcon, NumberStepper, SegmentedControl, cx, tabBg } from '@folio/ui';
import { useNavigate } from '@tanstack/react-router';
import { Check } from 'lucide-react';
import { Checkbox } from 'react-aria-components';
import { useT } from '../../i18n';
import { readyToBuild, startBuild } from '../../state/build';
import { edit } from '../../state/edit';
import { useCourse } from '../../state/session';

function MaterialToggle({ kind, selected }: { kind: MaterialKind; selected: boolean }) {
  const t = useT();
  return (
    <Checkbox
      isSelected={selected}
      onChange={(enabled) => edit([cmd('material.set', { kind, enabled })], { key: enabled ? 'includedMaterial' : 'leftOutMaterial', values: { kind } })}
      className="group flex h-9 cursor-default items-center gap-2.5 rounded-control px-2 font-ui text-14 text-ink outline-none data-hovered:bg-well data-focus-visible:ring-2 data-focus-visible:ring-accent"
    >
      <span aria-hidden className={cx('h-4 w-1 rounded-full transition-opacity', tabBg[kind], !selected && 'opacity-30')} />
      <MaterialIcon kind={kind} size={17} className={selected ? 'text-ink-2' : 'text-ink-3'} />
      <span className={cx('flex-1', !selected && 'text-ink-2')}>{t.materials[kind]}</span>
      <span
        aria-hidden
        className="flex size-4.5 items-center justify-center rounded-control border border-field text-accent-ink group-data-selected:border-accent group-data-selected:bg-accent"
      >
        <Check size={12} strokeWidth={2.5} className="opacity-0 group-data-selected:opacity-100" />
      </span>
    </Checkbox>
  );
}

function Shape() {
  const t = useT();
  const course = useCourse();
  const count = course.lessonOrder.length;
  const setCount = (n: number) => {
    if (!Number.isFinite(n) || n === count) return;
    if (n > count) {
      const commands = [];
      let after = course.lessonOrder.at(-1) ?? null;
      for (let i = count; i < n; i++) {
        const id = newId('l');
        commands.push(cmd('lesson.insert', { lesson: { id, title: t.plan.newLesson, summary: '' }, afterId: after }));
        after = id;
      }
      edit(commands, { key: 'addedLesson' });
    } else {
      const drop = course.lessonOrder.slice(n);
      edit(drop.map((lessonId) => cmd('lesson.remove', { lessonId })), { key: 'removedLesson', values: { n: n + 1 } });
    }
  };
  const { lessons, minutesPerLesson: minutes, quizSize: quiz } = SHAPE_LIMITS;
  const shape = (patch: Partial<typeof course.shape>) => edit([cmd('course.update', { shape: patch })], { key: 'changedShape' });
  return (
    <div className="space-y-3">
      {/* The range always includes the real count, so the field never shows a number of lessons that isn't there. */}
      <NumberStepper label={t.plan.lessonsCount} minValue={Math.min(lessons.min, count)} maxValue={Math.max(lessons.max, count)} value={count} onChange={setCount} />
      <NumberStepper label={t.plan.minutes} minValue={minutes.min} maxValue={minutes.max} step={minutes.step} value={course.shape.minutesPerLesson} onChange={(v) => Number.isFinite(v) && shape({ minutesPerLesson: v })} />
      <NumberStepper label={t.plan.quizSize} minValue={quiz.min} maxValue={quiz.max} value={course.shape.quizSize} onChange={(v) => Number.isFinite(v) && shape({ quizSize: v })} />
    </div>
  );
}

/** The right-hand column of the plan: shape, materials, and the one button. */
export function PlanAside() {
  const t = useT();
  const course = useCourse();
  const navigate = useNavigate();
  const enabled = MATERIAL_KINDS.filter((k) => course.materials[k].enabled);
  const isCore = enabled.length === CORE_SET.length && CORE_SET.every((k) => course.materials[k].enabled);
  const preset = isCore ? 'core' : enabled.length === MATERIAL_KINDS.length ? 'all' : 'custom';
  const applyPreset = (p: 'all' | 'core') => {
    const want = p === 'all' ? MATERIAL_KINDS : CORE_SET;
    const commands = MATERIAL_KINDS.filter((k) => course.materials[k].enabled !== want.includes(k)).map((k) => cmd('material.set', { kind: k, enabled: want.includes(k) }));
    edit(commands, { key: 'changedMaterials' });
  };
  const count = course.lessonOrder.length;
  const build = () => {
    if (!readyToBuild()) return;
    void navigate({ to: '/c/$courseId/map', params: { courseId: course.id } });
    void startBuild();
  };
  return (
    <aside className="w-full shrink-0 space-y-6 rounded-sheet bg-paper p-5 shadow-sheet lg:sticky lg:top-20 lg:w-80">
      <section aria-labelledby="shape">
        <h2 id="shape" className="mb-3 font-ui text-13 font-semibold text-ink">
          {t.plan.shape}
        </h2>
        <Shape />
      </section>
      <section aria-labelledby="materials">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 id="materials" className="font-ui text-13 font-semibold text-ink">
            {t.plan.materialsHeading}
          </h2>
          <SegmentedControl
            label={t.plan.materialsHeading}
            value={preset === 'custom' ? null : preset}
            onChange={applyPreset}
            options={[
              { id: 'all', label: t.plan.allMaterials },
              { id: 'core', label: t.plan.coreSet },
            ]}
          />
        </div>
        <div className="-mx-2">
          {MATERIAL_KINDS.map((kind) => (
            <MaterialToggle key={kind} kind={kind} selected={course.materials[kind].enabled} />
          ))}
        </div>
      </section>
      <div>
        <Button variant="primary" size="lg" className="w-full" isDisabled={count === 0 || enabled.length === 0} onPress={build}>
          {t.plan.build(count)}
        </Button>
        {/* Measured: four lessons take two to three minutes; lessons are written a few at a time. */}
        <p className="mt-2 font-ui text-13 leading-5 text-ink-2">{count === 0 ? t.plan.noLessons : t.plan.buildTime(Math.max(2, Math.ceil(count * 0.6)))}</p>
      </div>
    </aside>
  );
}
