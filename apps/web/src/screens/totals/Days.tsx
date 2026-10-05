import type { Stats } from './Totals';

type Day = Stats['days'][number];

const sum = (d: Day, test: (metric: string) => boolean) => Object.entries(d.counts).reduce((n, [k, v]) => n + (test(k) ? v : 0), 0);

/** What a day's row shows, in the order it is read. A count that means someone was stopped is marked when it is not zero. */
const COLUMNS: { label: string; of: (d: Day) => number; stopped?: boolean; show?: (n: number) => string }[] = [
  { label: 'New accounts', of: (d) => d.counts.new_accounts ?? 0 },
  { label: 'Sign-ins', of: (d) => d.counts.sign_in ?? 0 },
  { label: 'Saves', of: (d) => d.counts.course_saved ?? 0 },
  { label: 'Model calls', of: (d) => sum(d, (k) => k.startsWith('ai_call:')) },
  { label: 'Credits spent', of: (d) => Math.round((d.counts.millicredits_spent ?? 0) / 1000) },
  { label: 'Model cost', of: (d) => (d.counts.millicredits_spent ?? 0) / 1000 / 300, show: (n) => `$${n.toFixed(2)}` },
  { label: 'Free grants', of: (d) => d.counts.free_credits_granted ?? 0 },
  { label: 'Purchases', of: (d) => d.counts.purchase ?? 0 },
  { label: 'Calls failed', of: (d) => sum(d, (k) => k.startsWith('ai_refused:') || k === 'ai_unreachable'), stopped: true },
  { label: 'Ran out', of: (d) => d.counts.credits_exhausted ?? 0, stopped: true },
  { label: 'Account full', of: (d) => d.counts.account_full ?? 0, stopped: true },
];

/** The last 30 days, newest first, with the day's model calls drawn as a bar so a busy day stands out. */
export function Days({ days }: { days: Day[] }) {
  const calls = COLUMNS[3]!.of;
  const most = Math.max(1, ...days.map(calls));
  return (
    <section className="mt-10">
      <h2 className="font-ui text-13 font-medium uppercase tracking-wide text-ink-2">By day, last 30 days</h2>
      {days.length === 0 && <p className="mt-3 font-ui text-13 text-ink-2">Nothing counted yet.</p>}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse font-ui text-13 tabular" aria-label="Counts by day, last 30 days">
          <thead>
            <tr>
              <th scope="col" className="border-b border-rule-strong px-2 py-2 text-left font-semibold text-ink-2">
                Day
              </th>
              <th scope="col" className="w-24 border-b border-rule-strong px-2 py-2 text-left font-semibold text-ink-2">
                Activity
              </th>
              {COLUMNS.map((c) => (
                <th key={c.label} scope="col" className="border-b border-rule-strong px-2 py-2 text-right font-semibold text-ink-2">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.day}>
                <th scope="row" className="whitespace-nowrap border-b border-rule px-2 py-2 text-left font-normal text-ink">
                  {d.day}
                </th>
                <td className="border-b border-rule px-2 py-2">
                  <svg viewBox="0 0 100 8" preserveAspectRatio="none" className="h-2 w-full" aria-hidden>
                    <rect width={(calls(d) / most) * 100} height="8" rx="2" className="fill-accent" />
                  </svg>
                </td>
                {COLUMNS.map((c) => {
                  const n = c.of(d);
                  return (
                    <td key={c.label} className={`border-b border-rule px-2 py-2 text-right ${c.stopped && n ? 'font-semibold text-attention' : 'text-ink-2'}`}>
                      {c.show ? c.show(n) : n}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
