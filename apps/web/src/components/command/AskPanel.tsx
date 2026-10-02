import { planCourseChange, missingTargets, type PlanOperation, type Proposal, type SkipReason, type SkippedOperation } from '@folio/ai';
import { CourseStore, orderedLessons, staleItems, type Course } from '@folio/core';
import { Button, Skeleton } from '@folio/ui';
import { Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useT, type Messages } from '../../i18n';
import { startBuild } from '../../state/build';
import { currentInference, errorMessage } from '../../state/model';
import { updateSection } from '../../state/proposals';
import { activeStore, useCourse } from '../../state/session';
import { useUi } from '../../state/ui';
import { commandText } from '../../i18n/commandText';

/** A step in words, naming lessons by title as well as number (numbers are as the course stands now). */
function describe(op: PlanOperation, t: Messages, course: Course): string {
  const name = (n: number) => orderedLessons(course)[n - 1]?.title || undefined;
  switch (op.op) {
    case 'addLesson':
      return commandText.ops.addLesson(op);
    case 'removeLesson':
      return commandText.ops.removeLesson({ ...op, name: name(op.lesson) });
    case 'renameLesson':
      return commandText.ops.renameLesson({ ...op, name: name(op.lesson) });
    case 'moveLesson':
      return commandText.ops.moveLesson({ ...op, name: name(op.lesson) });
    case 'addObjective':
      return commandText.ops.addObjective({ ...op, name: name(op.lesson) });
    case 'setQuizSize':
      return commandText.ops.setQuizSize(op);
    case 'setMinutes':
      // One length for the whole lesson replaces its sessions: say so, not just the number.
      return course.shape.sessions.length > 1 ? commandText.ops.setMinutesOneClass(op) : commandText.ops.setMinutes(op);
    case 'setLevel':
      return commandText.ops.setLevel(op);
    case 'setMaterial':
      return commandText.ops.setMaterial({ material: t.materials[op.material], enabled: op.enabled });
  }
}

function reason(r: SkipReason): string {
  switch (r.code) {
    case 'noLesson':
      return commandText.skip.noLesson(r);
    case 'range':
      return commandText.skip.range(r);
    case 'tooMany':
      return commandText.skip.tooMany(r);
    default:
      return commandText.skip[r.code];
  }
}

/** Steps the model proposed that can't be done here, each with the reason. */
function Skipped({ skipped }: { skipped: SkippedOperation[] }) {
  const t = useT();
  const course = useCourse();
  if (!skipped.length) return null;
  return (
    <div className="mt-3">
      <p className="font-ui text-13 text-ink-2">{commandText.skipped(skipped.length)}</p>
      <ul className="mt-1 space-y-1 font-ui text-13 text-ink-2">
        {skipped.map((s, i) => (
          <li key={i}>{commandText.skipLine(describe(s.op, t, course), reason(s.reason))}</li>
        ))}
      </ul>
    </div>
  );
}

function usePlan(request: string, onDone: () => void): { proposal: Proposal | null; error: string | null } {
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
  return { proposal, error };
}

const staleKey = (s: { lessonId: string; kind: string }) => `${s.lessonId}:${s.kind}`;

/** Apply the plan, then update what it made out of date and build any new lessons. */
function applyPlan(proposal: Proposal, before: Set<string>): void {
  const store = activeStore();
  if (!store) return;
  store.apply(proposal.commands, { label: { key: 'plan', values: { summary: proposal.rationale } }, source: 'ai' });
  const state = store.getState();
  for (const s of staleItems(state).filter((x) => !x.edited && !before.has(staleKey(x)))) void updateSection(s.lessonId, s.kind);
  if (missingTargets(state).length) void startBuild();
}

function PlanPreview({ proposal, before }: { proposal: Proposal; before: Set<string> }) {
  const t = useT();
  const course = useCourse();
  if (proposal.preview.length === 0) {
    return proposal.skipped.length ? (
      <div>
        <p className="font-ui text-14 text-ink">{commandText.nothingToDo}</p>
        <Skipped skipped={proposal.skipped} />
      </div>
    ) : (
      <p className="font-ui text-14 text-ink-2">
        {commandText.nothing} {proposal.rationale}
      </p>
    );
  }
  const preview = new CourseStore(course);
  preview.apply(proposal.commands, { label: { key: 'preview' }, source: 'ai' });
  const newlyStale = staleItems(preview.getState()).filter((s) => !before.has(staleKey(s)));
  return (
    <div className="rounded-control bg-well px-4 py-3">
      {proposal.note && <p className="mb-3 font-ui text-14 leading-relaxed text-ink">{proposal.note}</p>}
      <p className="font-ui text-13 font-semibold text-ink">{commandText.preview}</p>
      <ul className="mt-2 space-y-1.5 font-ui text-14 text-ink">
        {proposal.preview.map((op, i) => (
          <li key={i}>
            <span className="folio-highlight">{describe(op, t, course)}</span>
          </li>
        ))}
      </ul>
      {newlyStale.length > 0 && <p className="mt-2 font-ui text-13 text-ink-2">{commandText.thenUpdate(newlyStale.length)}</p>}
      <Skipped skipped={proposal.skipped} />
    </div>
  );
}

/** A course-level request, planned by the model and previewed before anything changes. */
export function AskPanel({ request, onDone, onBack }: { request: string; onDone: () => void; onBack: () => void }) {
  const t = useT();
  const course = useCourse();
  const { proposal, error } = usePlan(request, onDone);
  const before = new Set(staleItems(course).map(staleKey));
  const changed = proposal !== null && proposal.basisRevision !== course.revision;
  return (
    <div className="p-5">
      <p className="flex items-start gap-2 font-ui text-14 text-ink">
        <Sparkles size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-accent" aria-hidden />
        <span>“{request}”</span>
      </p>
      <div className="mt-4 min-h-24" aria-live="polite">
        {!proposal && !error && (
          <div className="space-y-3">
            <p className="font-ui text-13 text-ink-2">{commandText.planning}</p>
            <Skeleton lines={3} />
          </div>
        )}
        {error && <p className="font-ui text-14 text-critical">{error}</p>}
        {proposal && <PlanPreview proposal={proposal} before={before} />}
        {changed && <p className="mt-2 font-ui text-13 text-attention">{commandText.changedMeanwhile}</p>}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="quiet" onPress={onBack}>
          {t.nav.back}
        </Button>
        {proposal?.preview.length !== 0 && (
        <Button
          variant="primary"
          isDisabled={!proposal || changed}
          onPress={() => {
            if (!proposal) return;
            onDone();
            applyPlan(proposal, before);
          }}
        >
          {commandText.apply}
        </Button>
        )}
      </div>
    </div>
  );
}
