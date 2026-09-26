import { sectionFor, staleReasons, type Course, type Lesson, type MaterialKind } from '@folio/core';
import { BinderTab, Button, Skeleton, StatusMark } from '@folio/ui';
import type { ReactNode } from 'react';
import { useT } from '../i18n';
import { retryCell, useBuild } from '../state/build';
import { keepMine, updateSection, useProposals } from '../state/proposals';
import { FlagNote } from './FlagNote';

function StaleBar({ course, lesson, kind }: { course: Course; lesson: Lesson; kind: MaterialKind }) {
  const t = useT();
  const section = sectionFor(kind);
  const pending = useProposals((s) => (section ? s.pending[`${lesson.id}:${section}`] : undefined));
  if (!section) return null;
  const reasons = staleReasons(course, lesson, section);
  if (!reasons.length) return null;
  return (
    <div role="note" className="no-print mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-control border border-rule px-3 py-2 font-ui text-13 text-ink-2">
      <StatusMark kind="stale" label={t.map.stale} />
      <p className="min-w-0 flex-1">
        <span className="font-medium text-ink">{t.map.stale}. </span>
        {t.changes.because(reasons.map((r) => t.changes.reasons[r]).join(', '))}
      </p>
      <span className="flex gap-1">
        <Button size="sm" variant="secondary" isDisabled={Boolean(pending)} onPress={() => void updateSection(lesson.id, section)}>
          {pending ? t.changes.updating : t.changes.update}
        </Button>
        <Button size="sm" variant="quiet" onPress={() => keepMine(lesson.id, section)}>
          {t.changes.keepMine}
        </Button>
      </span>
    </div>
  );
}

function NotBuilt({ lesson, kind }: { lesson: Lesson; kind: MaterialKind }) {
  const t = useT();
  const section = sectionFor(kind);
  const run = useBuild((s) => (section ? s.cells[`${lesson.id}:${section}`] : undefined));
  const error = useBuild((s) => (section ? s.errors[`${lesson.id}:${section}`] : undefined));
  if (run === 'building' || run === 'queued') {
    return (
      <div aria-busy className="space-y-4 py-2">
        <Skeleton lines={3} />
        <Skeleton lines={2} />
      </div>
    );
  }
  return (
    <div className="no-print rounded-control border border-dashed border-rule-strong px-4 py-5 font-ui text-14 text-ink-2">
      <p>{run === 'error' ? error : t.lesson.notBuilt(t.materialOne[kind])}</p>
      {section && (
        <Button size="sm" variant="secondary" className="mt-3" onPress={() => retryCell(lesson.id, section)}>
          {run === 'error' ? t.common.retry : t.lesson.buildThis}
        </Button>
      )}
    </div>
  );
}

/** A material inside the lesson sheet, under its binder-tab heading. */
export function SectionFrame({
  course,
  lesson,
  kind,
  meta,
  hideHeading,
  children,
}: {
  course: Course;
  lesson: Lesson;
  kind: MaterialKind;
  meta?: ReactNode;
  hideHeading?: boolean;
  children: ReactNode;
}) {
  const t = useT();
  const section = sectionFor(kind);
  const built = !section || Boolean(lesson.gen[section]);
  const flag = section ? lesson.gen[section]?.flag : null;
  return (
    <section id={hideHeading ? undefined : `m-${kind}`} aria-labelledby={hideHeading ? undefined : `h-${kind}`} className="scroll-mt-24 border-t border-rule pt-8 first:border-t-0 first:pt-0">
      {!hideHeading && (
        <h2 id={`h-${kind}`} className="mb-5">
          <BinderTab kind={kind} label={t.materialOne[kind]} meta={meta} />
        </h2>
      )}
      {built && <StaleBar course={course} lesson={lesson} kind={kind} />}
      {built && flag && section && <FlagNote flag={flag} lessonId={lesson.id} kind={section} itemId={null} />}
      {built ? children : <NotBuilt lesson={lesson} kind={kind} />}
    </section>
  );
}
