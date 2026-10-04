import { attentionItems, cmd, isMaterialKind, lessonNumber, staleItems, type AttentionItem, type GeneratedKind, type HistoryEntry, type StaleItem } from '@folio/core';
import { BinderTab, Button, StatusMark } from '@folio/ui';
import { useNavigate } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { flagLine, flagText, relativeTime, useT, type Messages } from '../../i18n';
import { retryCell, startBuild, useBuild } from '../../state/build';
import { edit, undo } from '../../state/edit';
import { keepAll, keepMine, updateSection, updateSections, useProposals } from '../../state/proposals';
import { useCourse, useStore } from '../../state/session';
import { CompareDialog } from './CompareDialog';
import { Sep } from '../Sep';

function Group({ title, count, action, children }: { title: string; count: number; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-b border-rule px-5 py-5 last:border-b-0">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-ui text-13 font-semibold text-ink">
          {title}
          {/* A zero beside "No edits yet" says the same thing twice. */}
          {count > 0 && (
            <>
              <Sep />
              <span className="font-normal text-ink-2 tabular">{count}</span>
            </>
          )}
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
      {item.flags.length > 1 ? (
        <ul className="mt-2 grid list-disc gap-1 pl-4 font-ui text-13 leading-5 text-ink">
          {item.flags.map((flag, i) => (
            <li key={i}>{flagLine(flag, t)}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 font-ui text-13 leading-5 text-ink">{flagText(item.flags, t)}</p>
      )}
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
      <p className="mt-2 font-ui text-13 leading-5 text-ink">{because(item, t)}</p>
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
          {item.edited ? t.changes.keepMine : t.changes.keepAsIs}
        </Button>
      </div>
      {comparing && <CompareDialog lessonId={item.lessonId} kind={item.kind} onClose={() => setComparing(false)} />}
    </li>
  );
}

const because = (item: StaleItem, t: Messages) => t.changes.because(t.changes.reasonList(item.reasons.map((r) => t.changes.reasons[r])));

/**
 * The sections of one lesson that went out of date for one reason, as one
 * card with one Update: six cards saying "Because its objectives changed"
 * over and over said it six times.
 */
function StaleGroup({ items }: { items: StaleItem[] }) {
  const t = useT();
  const course = useCourse();
  const pending = useProposals((s) => s.pending);
  const first = items[0]!;
  const working = items.some((i) => pending[`${i.lessonId}:${i.kind}`]);
  return (
    <li className="rounded-control bg-well p-3">
      <p className="flex items-baseline gap-2 font-ui text-12 text-ink-2">
        <span className="shrink-0 font-medium text-ink">{t.common.lesson(lessonNumber(course, first.lessonId))}</span>
        <span className="truncate" lang={course.language}>
          {course.lessons[first.lessonId]?.title}
        </span>
      </p>
      <p className="mt-2 font-ui text-13 leading-5 text-ink">
        {because(first, t)} {t.changes.builtOn(items.length)}
      </p>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5">
        {items.map((i) => (
          <li key={i.kind} className="flex items-center gap-1.5">
            <BinderTab kind={i.kind} size="sm" label={t.materialOne[i.kind]} />
            {pending[`${i.lessonId}:${i.kind}`] && <StatusMark kind="building" label={t.changes.updating} />}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Button size="sm" isDisabled={working} onPress={() => void updateSections(items)}>
          {working ? t.changes.updating : t.changes.updateN(items.length)}
        </Button>
        <Button size="sm" variant="quiet" isDisabled={working} onPress={() => keepAll(items)}>
          {t.changes.keepAll}
        </Button>
      </div>
    </li>
  );
}

/** Sections nobody edited, grouped by lesson and reason. Edited ones stay apart: each needs its own compare. */
function staleGroups(stale: StaleItem[]): { alone: StaleItem[]; groups: StaleItem[][] } {
  const byCause = new Map<string, StaleItem[]>();
  for (const s of stale.filter((i) => !i.edited)) {
    const k = `${s.lessonId}|${s.reasons.join(',')}`;
    byCause.set(k, [...(byCause.get(k) ?? []), s]);
  }
  const groups = [...byCause.values()].filter((g) => g.length > 1);
  const grouped = new Set(groups.flat());
  return { alone: stale.filter((s) => !grouped.has(s)), groups };
}

function StaleSection({ stale }: { stale: StaleItem[] }) {
  const t = useT();
  const updatable = stale.filter((s) => !s.edited);
  const { alone, groups } = staleGroups(stale);
  // One group already has its own Update; a second button saying the same would be noise.
  const cards = alone.length + groups.length;
  return (
    <Group
      title={t.changes.stale}
      count={stale.length}
      action={
        cards > 1 && updatable.length > 1 ? (
          <Button size="sm" variant="quiet" onPress={() => void updateSections(updatable)}>
            {t.changes.updateAll(updatable.length)}
          </Button>
        ) : undefined
      }
    >
      {groups.map((g) => (
        <StaleGroup key={`${g[0]!.lessonId}:${g[0]!.reasons.join()}`} items={g} />
      ))}
      {alone.map((s) => (
        <StaleRow key={`${s.lessonId}:${s.kind}`} item={s} />
      ))}
    </Group>
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
  const canUndo = store.canUndoEntry(entry.id);
  return (
    <li className="flex items-start justify-between gap-3 font-ui text-13 leading-5">
      <span className="min-w-0">
        <span className={entry.undone ? 'text-ink-2 line-through' : 'text-ink'}>{historyLabel(entry, t)}</span>
        <span className="block text-12 text-ink-2">
          {entry.source === 'ai' ? t.changes.ai : t.changes.you}
          <Sep />
          {entry.undone ? t.changes.undone : relativeTime(entry.at)}
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
      {stale.length > 0 && <StaleSection stale={stale} />}
      <Group title={t.changes.history} count={history.length}>
        {history.length === 0 ? <li className="font-ui text-13 text-ink-2">{t.changes.noHistory}</li> : history.map((e) => <HistoryRow key={e.id} entry={e} />)}
      </Group>
    </div>
  );
}
