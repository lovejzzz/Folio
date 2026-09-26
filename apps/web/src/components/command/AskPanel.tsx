import { planCourseChange, missingTargets, type PlanOperation, type Proposal } from '@folio/ai';
import { CourseStore, staleItems } from '@folio/core';
import { Button, Skeleton } from '@folio/ui';
import { Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useT, type Messages } from '../../i18n';
import { startBuild } from '../../state/build';
import { currentInference, errorMessage } from '../../state/model';
import { updateSection } from '../../state/proposals';
import { activeStore, useCourse } from '../../state/session';
import { useUi } from '../../state/ui';

function describe(op: PlanOperation, t: Messages): string {
  switch (op.op) {
    case 'addLesson':
      return t.command.ops.addLesson(op);
    case 'removeLesson':
      return t.command.ops.removeLesson(op);
    case 'renameLesson':
      return t.command.ops.renameLesson(op);
    case 'moveLesson':
      return t.command.ops.moveLesson(op);
    case 'addObjective':
      return t.command.ops.addObjective(op);
    case 'setQuizSize':
      return t.command.ops.setQuizSize(op);
    case 'setMinutes':
      return t.command.ops.setMinutes(op);
    case 'setLevel':
      return t.command.ops.setLevel(op);
    case 'setMaterial':
      return t.command.ops.setMaterial({ material: t.materials[op.material], enabled: op.enabled });
  }
}

/** A course-level request, planned by the model and previewed before anything changes. */
export function AskPanel({ request, onDone, onBack }: { request: string; onDone: () => void; onBack: () => void }) {
  const t = useT();
  const course = useCourse();
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const inference = currentInference();
    if (!inference) {
      onDone();
      useUi.getState().requireModel(() => useUi.getState().setCommandOpen(true));
      return;
    }
    planCourseChange(inference, activeStore()!.getState(), request)
      .then(setProposal)
      .catch((e: unknown) => setError(errorMessage(e)));
  }, [request, onDone]);

  const preview = proposal ? new CourseStore(course) : null;
  preview?.apply(proposal!.commands, { label: { key: 'preview' }, source: 'ai' });
  const before = new Set(staleItems(course).map((s) => `${s.lessonId}:${s.kind}`));
  const newlyStale = preview ? staleItems(preview.getState()).filter((s) => !before.has(`${s.lessonId}:${s.kind}`)) : [];
  const changed = proposal !== null && proposal.basisRevision !== course.revision;

  const apply = () => {
    const store = activeStore();
    if (!store || !proposal) return;
    store.apply(proposal.commands, { label: { key: 'plan', values: { summary: proposal.rationale } }, source: 'ai' });
    onDone();
    const state = store.getState();
    for (const s of staleItems(state).filter((x) => !x.edited && !before.has(`${x.lessonId}:${x.kind}`))) void updateSection(s.lessonId, s.kind);
    if (missingTargets(state).length) void startBuild();
  };

  return (
    <div className="p-5">
      <p className="flex items-start gap-2 font-ui text-14 text-ink">
        <Sparkles size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-accent" aria-hidden />
        <span>“{request}”</span>
      </p>
      <div className="mt-4 min-h-24" aria-live="polite">
        {!proposal && !error && (
          <div className="space-y-3">
            <p className="font-ui text-13 text-ink-2">{t.command.planning}</p>
            <Skeleton lines={3} />
          </div>
        )}
        {error && <p className="font-ui text-14 text-critical">{error}</p>}
        {proposal && proposal.preview.length === 0 && (
          <p className="font-ui text-14 text-ink-2">
            {t.command.nothing} {proposal.rationale}
          </p>
        )}
        {proposal && proposal.preview.length > 0 && (
          <div className="rounded-control bg-well px-4 py-3">
            <p className="font-ui text-13 font-semibold text-ink">{t.command.preview}</p>
            <ul className="mt-2 space-y-1.5 font-ui text-14 text-ink">
              {proposal.preview.map((op, i) => (
                <li key={i}>
                  <span className="folio-highlight">{describe(op, t)}</span>
                </li>
              ))}
            </ul>
            {newlyStale.length > 0 && <p className="mt-2 font-ui text-13 text-ink-2">{t.command.thenUpdate(newlyStale.length)}</p>}
          </div>
        )}
        {changed && <p className="mt-2 font-ui text-13 text-attention">{t.command.changedMeanwhile}</p>}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="quiet" onPress={onBack}>
          {t.nav.back}
        </Button>
        <Button variant="primary" isDisabled={!proposal || proposal.preview.length === 0 || changed} onPress={apply}>
          {t.command.apply}
        </Button>
      </div>
    </div>
  );
}
