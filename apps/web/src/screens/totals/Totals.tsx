import { useEffect, useState, type ReactNode } from 'react';
import { usePageTitle } from '../../app/usePageTitle';
import { SimpleHeader } from '../../components/AppHeader';
import { Days } from './Days';

export interface Stats {
  at: string;
  accounts: { all: number; week: number; month: number; school: number; withCourses: number; writing30: number; paying: number };
  courses: { kept: number; bytes: number; lessons: number; changed7: number; changed30: number; short: number; medium: number; long: number; mostInOneAccount: number };
  credits: { held: number; outstanding: number; spent30: number; spentMonth: number; bought30: number; granted30: number; purchases30: number; dollars30: number };
  models: { model: string; calls: number; credits: number }[];
  heaviest: number[];
  calls: { made30: number; refused30: number; unreachable30: number; ranOut30: number };
  media: { files: number; bytes: number; pictures: number; clips: number; other: number } | null;
  days: { day: string; counts: Record<string, number> }[];
}

/** A credit is a cent to the teacher and a third of a cent of model cost: Folio charges three times what a call costs. */
const cost = (credits: number) => `$${(credits / 300).toFixed(2)}`;
/** What the model providers may bill in a month before calls stop, as set in the provider's console. */
const MONTHLY_LIMIT = 1000;
const FREE_STORAGE = 10 * 1024 ** 3;

const size = (bytes: number) => (bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : bytes >= 1024 ** 2 ? `${(bytes / 1024 ** 2).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`);
const share = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : '0%');

function Figure({ label, value, note, warn }: { label: string; value: string; note?: string; warn?: boolean }) {
  return (
    <div className="rounded-sheet bg-well p-4">
      <dt className="font-ui text-13 text-ink-2">{label}</dt>
      <dd className={`mt-1 font-display text-22 ${warn ? 'text-attention' : 'text-ink'}`}>{value}</dd>
      {note && <dd className="mt-1 font-ui text-13 text-ink-2">{note}</dd>}
    </div>
  );
}

function Group({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="font-ui text-13 font-medium uppercase tracking-wide text-ink-2">{title}</h2>
      {note && <p className="mt-1 font-ui text-13 text-ink-2">{note}</p>}
      <dl className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">{children}</dl>
    </section>
  );
}

function People({ s }: { s: Stats }) {
  const a = s.accounts;
  return (
    <Group title="Accounts" note="Teachers who signed in. Anyone writing with their own key and no account never reaches Folio’s server, and is not counted.">
      <Figure label="Accounts" value={String(a.all)} note={`${a.week} new in 7 days, ${a.month} in 30`} />
      <Figure label="With a school address" value={String(a.school)} note={`${share(a.school, a.all)} of accounts`} />
      <Figure label="Keeping a course" value={String(a.withCourses)} note={`${share(a.withCourses, a.all)} of accounts`} />
      <Figure label="Wrote with credits, 30 days" value={String(a.writing30)} note={`${a.paying} have ever bought credits`} />
    </Group>
  );
}

function Courses({ s }: { s: Stats }) {
  const c = s.courses;
  return (
    <Group title="Courses in accounts">
      <Figure label="Courses" value={String(c.kept)} note={`${c.lessons} lessons, ${size(c.bytes)}`} />
      <Figure label="Changed lately" value={String(c.changed7)} note={`in 7 days; ${c.changed30} in 30`} />
      <Figure label="By length" value={`${c.short} / ${c.medium} / ${c.long}`} note="up to 5 lessons / 6 to 15 / more" />
      <Figure label="Most in one account" value={String(c.mostInOneAccount)} />
    </Group>
  );
}

function Money({ s }: { s: Stats }) {
  const c = s.credits;
  const month = c.spentMonth / 300;
  return (
    <Group title="Credits and money" note="A credit is one cent to the teacher. Model cost is a third of the credits spent.">
      <Figure label="Spent, 30 days" value={`${c.spent30} credits`} note={`about ${cost(c.spent30)} of model cost`} />
      <Figure label="Model cost this month" value={`$${month.toFixed(2)}`} note={`of the $${MONTHLY_LIMIT} monthly limit (${share(month, MONTHLY_LIMIT)})`} warn={month > MONTHLY_LIMIT * 0.7} />
      <Figure label="Bought, 30 days" value={`$${c.dollars30.toFixed(2)}`} note={`${c.purchases30} purchases, ${c.bought30} credits`} />
      <Figure label="Given free, 30 days" value={`${c.granted30} credits`} note={`worth up to ${cost(c.granted30)} of model cost`} />
      <Figure label="Not yet used" value={`${c.outstanding} credits`} note={`up to ${cost(c.outstanding)} still to pay for; ${c.held} held by calls now`} />
      <Figure label="Busiest accounts, 30 days" value={s.heaviest.length ? s.heaviest.join(' · ') : 'none'} note="credits each, no account named" />
    </Group>
  );
}

function Health({ s }: { s: Stats }) {
  const k = s.calls;
  const failed = k.refused30 + k.unreachable30;
  const m = s.media;
  return (
    <Group title="Calls and storage, 30 days">
      <Figure label="Model calls" value={String(k.made30)} note={`${failed} failed (${share(failed, k.made30 + failed)})`} warn={failed > (k.made30 + failed) * 0.05} />
      <Figure label="Refused or unreachable" value={`${k.refused30} / ${k.unreachable30}`} note="by the provider / never answered" warn={failed > 0} />
      <Figure label="Stopped for no credits" value={String(k.ranOut30)} note="a teacher ran out mid-course" warn={k.ranOut30 > 0} />
      <Figure label="Pictures, clips, files" value={m ? String(m.files) : 'off'} note={m ? `${size(m.bytes)} of 10 GB free (${share(m.bytes, FREE_STORAGE)}): ${m.pictures} / ${m.clips} / ${m.other}` : 'no store bound'} warn={Boolean(m && m.bytes > FREE_STORAGE * 0.7)} />
    </Group>
  );
}

function Models({ models }: { models: Stats['models'] }) {
  if (!models.length) return null;
  const all = models.reduce((n, m) => n + m.credits, 0);
  const cell = 'border-b border-rule px-2 py-2 text-right text-ink-2';
  return (
    <section className="mt-10">
      <h2 className="font-ui text-13 font-medium uppercase tracking-wide text-ink-2">By model, 30 days</h2>
      <table className="mt-3 w-full border-collapse font-ui text-13 tabular" aria-label="Calls and credits by model, last 30 days">
        <thead>
          <tr>
            {['Model', 'Calls', 'Credits', 'Model cost', 'Share', 'Per call'].map((h, i) => (
              <th key={h} scope="col" className={`border-b border-rule-strong px-2 py-2 font-semibold text-ink-2 ${i ? 'text-right' : 'text-left'}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {models.map((m) => (
            <tr key={m.model}>
              <th scope="row" className="border-b border-rule px-2 py-2 text-left font-normal text-ink">
                {m.model || 'unnamed'}
              </th>
              <td className={cell}>{m.calls}</td>
              <td className={cell}>{m.credits}</td>
              <td className={cell}>{cost(m.credits)}</td>
              <td className={cell}>{share(m.credits, all)}</td>
              <td className={cell}>{m.calls ? `$${(m.credits / 300 / m.calls).toFixed(3)}` : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
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
      <main id="main" className="mx-auto max-w-5xl px-5 pb-24 pt-8 md:pt-12">
        <h1 className="font-display text-36 text-ink">Totals</h1>
        {stats === null && <p className="mt-4 font-ui text-14 text-ink-2">Loading…</p>}
        {stats === 'none' && <p className="mt-4 font-ui text-14 text-ink-2">There is nothing here.</p>}
        {stats && stats !== 'none' && (
          <>
            <p className="mt-2 font-ui text-13 text-ink-2">As of {new Date(stats.at).toLocaleString('en-US')}. Counts only: no course, name or address.</p>
            <People s={stats} />
            <Courses s={stats} />
            <Money s={stats} />
            <Models models={stats.models} />
            <Health s={stats} />
            <Days days={stats.days} />
          </>
        )}
      </main>
    </div>
  );
}
