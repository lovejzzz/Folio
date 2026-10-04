import { useEffect, useState } from 'react';
import { usePageTitle } from '../../app/usePageTitle';
import { SimpleHeader } from '../../components/AppHeader';

interface Stats {
  at: string;
  accounts: { all: number; week: number };
  courses: { kept: number; bytes: number };
  credits: { held: number; outstanding: number; spent30: number; bought30: number; granted30: number };
  media: { files: number; bytes: number } | null;
  days: { day: string; counts: Record<string, number> }[];
}

/** The counts worth a column, in the order they are read; any other the server sends follows them. */
const COLUMNS: [string, string][] = [
  ['sign_in', 'Sign-ins'],
  ['course_saved', 'Saves'],
  ['free_credits_granted', 'Free grants'],
  ['purchase', 'Purchases'],
  ['credits_bought', 'Credits bought'],
  ['credits_exhausted', 'Ran out'],
  ['account_full', 'Account full'],
];
/** Counts that mean someone was stopped: shown in the attention colour when not zero. */
const STOPPED = new Set(['credits_exhausted', 'account_full']);

const size = (bytes: number) => (bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`);

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-sheet bg-well p-4">
      <dt className="font-ui text-13 text-ink-2">{label}</dt>
      <dd className="mt-1 font-display text-22 text-ink">{value}</dd>
      {note && <dd className="mt-1 font-ui text-13 text-ink-2">{note}</dd>}
    </div>
  );
}

function Days({ days }: { days: Stats['days'] }) {
  const known = new Set(COLUMNS.map(([k]) => k));
  const others = [...new Set(days.flatMap((d) => Object.keys(d.counts)))].filter((k) => !known.has(k)).sort();
  const columns: [string, string][] = [...COLUMNS, ...others.map((k): [string, string] => [k, k.replace(/_/g, ' ')])];
  return (
    <div className="mt-8 overflow-x-auto">
      <table className="w-full border-collapse font-ui text-13 tabular" aria-label="Counts by day, last 30 days">
        <thead>
          <tr>
            <th scope="col" className="border-b border-rule-strong px-2 py-2 text-left font-semibold text-ink-2">
              Day
            </th>
            {columns.map(([key, label]) => (
              <th key={key} scope="col" className="border-b border-rule-strong px-2 py-2 text-right font-semibold text-ink-2">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.day}>
              <th scope="row" className="border-b border-rule px-2 py-2 text-left font-normal text-ink">
                {d.day}
              </th>
              {columns.map(([key]) => (
                <td key={key} className={`border-b border-rule px-2 py-2 text-right ${STOPPED.has(key) && d.counts[key] ? 'font-semibold text-attention' : 'text-ink-2'}`}>
                  {d.counts[key] ?? 0}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * How Folio is doing, for the one account that runs it: totals only. The server answers no one else, and to
 * them this page says only that there is nothing here.
 */
export function Totals() {
  usePageTitle('Totals');
  const [stats, setStats] = useState<Stats | null | 'none'>(null);
  useEffect(() => {
    void fetch('/api/admin/stats', { credentials: 'same-origin' })
      .then(async (r): Promise<Stats | 'none'> => (r.ok ? ((await r.json()) as Stats) : 'none'))
      .then(setStats, () => setStats('none'));
  }, []);
  return (
    <div className="min-h-dvh">
      <SimpleHeader />
      <main id="main" className="mx-auto max-w-4xl px-5 pb-24 pt-8 md:pt-12">
        <h1 className="font-display text-36 text-ink">Totals</h1>
        {stats === null && <p className="mt-4 font-ui text-14 text-ink-2">Loading…</p>}
        {stats === 'none' && <p className="mt-4 font-ui text-14 text-ink-2">There is nothing here.</p>}
        {stats && stats !== 'none' && (
          <>
            <p className="mt-2 font-ui text-13 text-ink-2">As of {new Date(stats.at).toLocaleString('en-US')}. Counts only: no course, name or address.</p>
            <dl className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
              <Figure label="Accounts" value={String(stats.accounts.all)} note={`${stats.accounts.week} new in 7 days`} />
              <Figure label="Courses in accounts" value={String(stats.courses.kept)} note={size(stats.courses.bytes)} />
              <Figure label="Credits spent, 30 days" value={String(stats.credits.spent30)} note={`about $${(stats.credits.spent30 / 300).toFixed(2)} of model cost`} />
              <Figure label="Credits bought, 30 days" value={String(stats.credits.bought30)} note={`${stats.credits.granted30} given free`} />
              <Figure label="Credits not yet used" value={String(stats.credits.outstanding)} note={`${stats.credits.held} held by calls now`} />
              <Figure label="Pictures, clips, files" value={stats.media ? String(stats.media.files) : 'off'} note={stats.media ? `${size(stats.media.bytes)} of 10 GB free` : 'no store bound'} />
            </dl>
            <Days days={stats.days} />
          </>
        )}
      </main>
    </div>
  );
}
