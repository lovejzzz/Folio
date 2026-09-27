import { attentionItems, cmd, isMaterialKind, lessonNumber, staleItems, type AttentionItem, type GeneratedKind, type HistoryEntry, type StaleItem } from '@folio/core';
import { BinderTab, Button } from '@folio/ui';
import { useNavigate } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { flagText, relativeTime, useT, type Messages } from '../../i18n';
import { retryCell, startBuild, useBuild } from '../../state/build';
import { edit, undo } from '../../state/edit';
import { usePrefs } from '../../state/prefs';
import { keepMine, updateSection, useProposals } from '../../state/proposals';
import { useCourse, useStore } from '../../state/session';
import { CompareDialog } from './CompareDialog';

function Group({ title, count, action, children }: { title: string; count: number; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-b border-rule px-5 py-5 last:border-b-0">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-ui text-13 font-semibold text-ink">
          {title} <span className="font-normal text-ink-2 tabular">· {count}</span>
        </h3>
        {action}
      </div>
      <ul className="space-y-3">{children}</ul>
    </section>
  );
}

function ItemHead({ lessonId, kind, n }: { lessonId: string; kind: StaleItem['kind']; n: number }) {
  const t = useT();
  const course = useCourse();
  return (
    <p className="flex items-center justify-between gap-2">
      <BinderTab kind={kind} size="sm" label={t.materialOne[kind]} />
      <span className="truncate font-ui text-12 text-ink-2" lang={course.language} title={course.lessons[lessonId]?.title}>
        {t.common.lesson(n)}
      </span>
    </p>
  );
}

function AttentionRow({ item }: { item: AttentionItem }) {
  const t = useT();
  const course = useCourse();
  const navigate = useNavigate();
  return (
    <li className="rounded-control bg-well p-3">
      <ItemHead lessonId={item.lessonId} kind={item.kind} n={lessonNumber(course, item.lessonId)} />
      <p className="mt-2 font-ui text-13 leading-5 text-ink">{flagText(item.flags, t)}</p>
      <div className="mt-3 flex gap-1.5">
        <Button size="sm" onPress={() => void navigate({ to: '/c/$courseId/lesson/$lessonId', params: { courseId: course.id, lessonId: item.lessonId }, search: { m: item.kind } })}>
          {t.changes.open}
        </Button>
        <Button size="sm" variant="quiet" onPress={() => edit([cmd('review.resolve', { lessonId: item.lessonId, kind: item.kind, itemId: item.itemId })], { key: 'resolved' })}>
          {t.changes.resolve}
        </Button>
      </div>
    </li>
  );
}

function StaleRow({ item }: { item: StaleItem }) {
  const t = useT();
  const course = useCourse();
  const pending = useProposals((s) => s.pending[`${item.lessonId}:${item.kind}`]);
  const [comparing, setComparing] = useState(false);
  return (
    <li className="rounded-control bg-well p-3">
      <ItemHead lessonId={item.lessonId} kind={item.kind} n={lessonNumber(course, item.lessonId)} />
      <p className="mt-2 font-ui text-13 leading-5 text-ink">{t.changes.because(t.changes.reasonList(item.reasons.map((r) => t.changes.reasons[r])))}</p>
      {item.edited && !pending && <p className="mt-1 font-ui text-12 leading-5 text-ink-2">{t.changes.edited}</p>}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {pending?.status === 'ready' ? (
          <Button size="sm" variant="primary" onPress={() => setComparing(true)}>
            {t.changes.compare}
          </Button>
        ) : (
          <Button size="sm" isDisabled={Boolean(pending)} onPress={() => void updateSection(item.lessonId, item.kind)}>
            {pending ? t.changes.updating : t.changes.update}
          </Button>
        )}
        <Button size="sm" variant="quiet" onPress={() => keepMine(item.lessonId, item.kind)}>
          {t.changes.keepMine}
        </Button>
      </div>
      {comparing && <CompareDialog lessonId={item.lessonId} kind={item.kind} onClose={() => setComparing(false)} />}
    </li>
  );
}

interface Failed {
  lessonId: string;
  kind: GeneratedKind;
  error: string;
}

/** Sections the last build couldn't make, with why, for this course. */
function useFailed(courseId: string, lessons: Record<string, unknown>): Failed[] {
  const { courseId: built, cells, errors } = useBuild();
  if (built !== courseId) return [];
  return Object.entries(cells)
    .filter(([, state]) => state === 'error')
    .map(([key]) => {
      const [lessonId = '', kind = ''] = key.split(':');
      return { lessonId, kind: kind as GeneratedKind, error: errors[key] ?? '' };
    })
    .filter((f) => f.lessonId in lessons);
}

function FailedRow({ item }: { item: Failed }) {
  const t = useT();
  const course = useCourse();
  const running = useBuild((s) => s.running);
  return (
    <li className="rounded-control bg-well p-3">
      <ItemHead lessonId={item.lessonId} kind={item.kind} n={lessonNumber(course, item.lessonId)} />
      {item.error && (
        <p className="mt-2 flex gap-2 font-ui text-13 leading-5 text-ink">
          <span aria-hidden className="mt-1.5 size-2 shrink-0 rotate-45 bg-critical" />
          {item.error}
        </p>
      )}
      <div className="mt-3">
        <Button size="sm" isDisabled={running} onPress={() => retryCell(item.lessonId, item.kind)}>
          {t.common.retry}
        </Button>
      </div>
    </li>
  );
}

function FailedGroup({ failed }: { failed: Failed[] }) {
  const t = useT();
  const running = useBuild((s) => s.running);
  if (!failed.length) return null;
  const retryAll = () => void startBuild(failed.map(({ lessonId, kind }) => ({ lessonId, kind })));
  return (
    <Group
      title={t.changes.failed}
      count={failed.length}
      action={
        failed.length > 1 ? (
          <Button size="sm" variant="quiet" isDisabled={running} onPress={retryAll}>
            {t.changes.retryAll(failed.length)}
          </Button>
        ) : undefined
      }
    >
      {failed.map((f) => (
        <FailedRow key={`${f.lessonId}:${f.kind}`} item={f} />
      ))}
    </Group>
  );
}

/** History labels are stored as keys and values, and worded in the current language. */
export function historyLabel(entry: HistoryEntry, t: Messages): string {
  const values: Record<string, string | number> = { ...entry.label.values };
  const kind = values.kind;
  if (typeof kind === 'string' && isMaterialKind(kind)) {
    const whole = entry.label.key === 'includedMaterial' || entry.label.key === 'leftOutMaterial';
    values.material = whole ? t.materialsInline[kind] : t.materialInline[kind];
  }
  const fn = (t.history as Record<string, unknown>)[entry.label.key];
  if (typeof fn === 'function') return (fn as (v: Record<string, string | number>) => string)(values);
  return t.history.edit;
}

function HistoryRow({ entry }: { entry: HistoryEntry }) {
  const t = useT();
  const store = useStore();
  const language = usePrefs((s) => s.uiLanguage);
  const canUndo = store.canUndoEntry(entry.id);
  return (
    <li className="flex items-start justify-between gap-3 font-ui text-13 leading-5">
      <span className="min-w-0">
        <span className={entry.undone ? 'text-ink-2 line-through' : 'text-ink'}>{historyLabel(entry, t)}</span>
        <span className="block text-12 text-ink-2">
          {entry.source === 'ai' ? t.changes.ai : t.changes.you} · {entry.undone ? t.changes.undone : relativeTime(entry.at, language)}
        </span>
      </span>
      {!entry.undone &&
        (canUndo ? (
          <Button size="sm" variant="quiet" onPress={() => undo(entry.id)}>
            {t.common.undo}
          </Button>
        ) : (
          // Say why there's no Undo: undoing it would clobber later work.
          <span title={t.changes.cantUndo} className="max-w-40 shrink-0 pt-1 text-right text-12 leading-4 text-ink-2">
            {t.changes.touchedLater}
          </span>
        ))}
    </li>
  );
}

/** What changed, what needs a look, and why. Each applied change can be undone. */
export function ChangesDrawer() {
  const t = useT();
  const course = useCourse();
  const store = useStore();
  const attention = attentionItems(course);
  const stale = staleItems(course);
  const history = [...store.getHistory()].reverse().slice(0, 60);
  const updatable = stale.filter((s) => !s.edited);
  const failed = useFailed(course.id, course.lessons);
  return (
    <div>
      <FailedGroup failed={failed} />
      {attention.length === 0 && stale.length === 0 && failed.length === 0 && (
        <div className="px-5 py-8 text-center">
          <p className="font-display text-22 text-ink">{t.changes.nothing}</p>
          <p className="mt-1 font-ui text-13 text-ink-2">{t.changes.nothingHint}</p>
        </div>
      )}
      {attention.length > 0 && (
        <Group title={t.changes.attention} count={attention.length}>
          {attention.map((a) => (
            <AttentionRow key={`${a.lessonId}:${a.kind}:${a.itemId}`} item={a} />
          ))}
        </Group>
      )}
      {stale.length > 0 && (
        <Group
          title={t.changes.stale}
          count={stale.length}
          action={
            updatable.length > 1 ? (
              <Button size="sm" variant="quiet" onPress={() => void Promise.all(updatable.map((s) => updateSection(s.lessonId, s.kind)))}>
                {t.changes.updateAll(updatable.length)}
              </Button>
            ) : undefined
          }
        >
          {stale.map((s) => (
            <StaleRow key={`${s.lessonId}:${s.kind}`} item={s} />
          ))}
        </Group>
      )}
      <Group title={t.changes.history} count={history.length}>
        {history.length === 0 ? <li className="font-ui text-13 text-ink-2">{t.changes.noHistory}</li> : history.map((e) => <HistoryRow key={e.id} entry={e} />)}
      </Group>
    </div>
  );
}
