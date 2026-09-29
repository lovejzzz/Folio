import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { useT } from '../../i18n';
import { useDraft } from '../../state/draft';

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
        className="h-8 cursor-default appearance-none rounded-full border border-rule bg-paper pl-3 pr-7 font-ui text-13 text-ink outline-none transition-colors duration-120 hover:border-field focus-visible:ring-2 focus-visible:ring-accent"
      >
        {children}
      </select>
      <ChevronDown size={14} strokeWidth={1.75} className="pointer-events-none absolute right-2.5 top-2 text-ink-2" aria-hidden />
    </span>
  );
}

/** Up to a full term: a US semester runs 15 weeks, or about 30 classes meeting twice a week. The plan screen goes on to SHAPE_LIMITS.lessons.max. */
const LESSON_COUNTS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 14, 15, 16, 20, 24, 30];

export function LevelChip() {
  const t = useT();
  const { level, set, pinned } = useDraft();
  const options = [...new Set([level, ...t.levels].filter(Boolean))];
  return (
    <Chip label={t.home.level} value={level} onChange={(v) => set({ level: v, pinned: { ...pinned, level: true } })}>
      <option value="">{t.home.levelAny}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </Chip>
  );
}

/** "From the syllabus" once a file is attached: Folio reads the count from it, and asks if it can't. */
export function LessonsChip() {
  const t = useT();
  const { lessons, lessonsFromFiles, files, set, pinned } = useDraft();
  const options = [...new Set([...LESSON_COUNTS, lessons])].sort((a, b) => a - b);
  const syllabus = files.some((f) => /syllab|course outline|schedule/i.test(f.title));
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
