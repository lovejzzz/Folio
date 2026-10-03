import type { Delivery } from '@folio/core';
import { cx } from '@folio/ui';
import { ChevronDown } from 'lucide-react';
import { lazy, Suspense, type ReactNode } from 'react';
import { useT } from '../../i18n';
import { looksLikeSyllabus, useDraft } from '../../state/draft';

/** The quiet chips under the brief share one look, whether a native select or a menu button. */
export const chipLook =
  'h-10 cursor-default rounded-full border border-rule bg-paper font-ui text-14 text-ink outline-none transition-colors duration-120 hover:border-field focus-visible:ring-2 focus-visible:ring-accent';

/**
 * The quiet chips under the brief. They are native selects styled as
 * chips: tiny to load, and phones open their own picker.
 */
function Chip({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: ReactNode }) {
  return (
    <span className="relative inline-flex">
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cx(chipLook, 'appearance-none pl-4 pr-8')}
      >
        {children}
      </select>
      <ChevronDown size={14} strokeWidth={1.75} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-2" aria-hidden />
    </span>
  );
}

/** Up to a full term: a US semester runs 15 weeks, or about 30 classes meeting twice a week. The plan screen goes on to SHAPE_LIMITS.lessons.max. */
const LESSON_COUNTS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 14, 15, 16, 20, 24, 30];

/** The level menu loads after the page: until then its chip shows the level and waits. */
const LevelMenu = lazy(() => import('./LevelMenu').then((m) => ({ default: m.LevelMenu })));

export function LevelChip() {
  const t = useT();
  const level = useDraft((s) => s.level);
  const label = level || t.home.levelAny;
  return (
    <Suspense
      fallback={
        <span className={cx(chipLook, 'inline-flex items-center gap-1.5 pl-4 pr-3')}>
          {label}
          <ChevronDown size={14} strokeWidth={1.75} className="text-ink-2" aria-hidden />
        </span>
      }
    >
      <LevelMenu />
    </Suspense>
  );
}

/** In a room, or online on the students' own time: the second is written for the student, a page a week. */
export function DeliveryChip() {
  const t = useT();
  const { delivery, set, pinned } = useDraft();
  return (
    <Chip label={t.home.delivery} value={delivery} onChange={(v) => set({ delivery: v as Delivery, pinned: { ...pinned, delivery: true } })}>
      <option value="inperson">{t.home.deliveries.inperson}</option>
      <option value="online-async">{t.home.deliveries['online-async']}</option>
      <option value="online-sync">{t.home.deliveries['online-sync']}</option>
      <option value="online-mixed">{t.home.deliveries['online-mixed']}</option>
    </Chip>
  );
}

/** "From the syllabus" once a file is attached: Folio reads the count from it, and asks if it can't. */
export function LessonsChip() {
  const t = useT();
  const { lessons, lessonsFromFiles, files, set, pinned } = useDraft();
  const options = [...new Set([...LESSON_COUNTS, lessons])].sort((a, b) => a - b);
  const syllabus = files.some((f) => looksLikeSyllabus(f.title));
  return (
    <Chip
      label={t.plan.lessonsCount}
      value={lessonsFromFiles ? 'files' : String(lessons)}
      onChange={(v) =>
        v === 'files'
          ? set({ lessonsFromFiles: true, pinned: { ...pinned, lessons: true } })
          : set({ lessons: Number(v), lessonsFromFiles: false, pinned: { ...pinned, lessons: true } })
      }
    >
      {files.length > 0 && <option value="files">{syllabus ? t.home.lessonsFromSyllabus : t.home.lessonsFromFiles}</option>}
      {options.map((n) => (
        <option key={n} value={n}>
          {t.home.lessonsChip(n)}
        </option>
      ))}
    </Chip>
  );
}
