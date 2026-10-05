import type { SlideVisual } from '@folio/core';
import { EditableText } from '../components/editing/EditableText';
import { useT } from '../i18n';

type Chart = Extract<SlideVisual, { kind: 'chart' }>;
type Table = Extract<SlideVisual, { kind: 'table' }>;

const W = 320;
const H = 132;
const PLOT = { left: 30, right: 312, top: 10, bottom: 108 };
/** The two series: told apart by more than their colour (a solid shape and an outlined one, a full line and a dashed one). */
const INK = ['var(--folio-accent)', 'var(--folio-ink-2)'];

/** A round number at or above the largest value, so the scale ends on something a class can read. */
function ceiling(max: number): number {
  if (max <= 0) return 1;
  const step = 10 ** Math.floor(Math.log10(max));
  return [1, 2, 2.5, 5, 10].map((m) => m * step).find((m) => m >= max) ?? max;
}

const short = (n: number): string => (Math.abs(n) >= 1000 ? n.toLocaleString('en-US') : String(Math.round(n * 100) / 100));

function ChartView({ v }: { v: Chart }) {
  const t = useT();
  const top = ceiling(Math.max(...v.series.flatMap((s) => s.values), 0));
  const band = (PLOT.right - PLOT.left) / v.categories.length;
  const y = (n: number) => PLOT.bottom - (Math.max(0, n) / top) * (PLOT.bottom - PLOT.top);
  const x = (i: number) => PLOT.left + band * (i + 0.5);
  const one = v.series.length === 1;
  const label = `${v.chart === 'bar' ? t.slides.barChart : t.slides.lineChart}: ${v.series.map((s) => `${s.name ? `${s.name}: ` : ''}${v.categories.map((c, i) => `${c} ${short(s.values[i] ?? 0)}${v.unit ? ` ${v.unit}` : ''}`).join(', ')}`).join('; ')}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="folio-slide-chart w-full" role="img" aria-label={label}>
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={PLOT.left} x2={PLOT.right} y1={y(top * f)} y2={y(top * f)} style={{ stroke: 'var(--folio-rule)' }} strokeWidth={0.6} />
          <text x={PLOT.left - 3} y={y(top * f) + 2} textAnchor="end" fontSize={6} style={{ fill: 'var(--folio-ink-2)' }}>
            {short(top * f)}
          </text>
        </g>
      ))}
      {v.series.map((s, k) =>
        v.chart === 'bar' ? (
          s.values.map((n, i) => {
            const w = (band * 0.7) / v.series.length;
            const left = x(i) - band * 0.35 + k * w;
            return (
              <g key={`${k}-${i}`}>
                <rect x={left} y={y(n)} width={w - 1} height={PLOT.bottom - y(n)} style={{ fill: k ? 'var(--folio-paper)' : INK[0], stroke: INK[k] }} strokeWidth={k ? 1.2 : 0} />
                {one && (
                  <text x={left + (w - 1) / 2} y={y(n) - 2} textAnchor="middle" fontSize={6.5} style={{ fill: 'var(--folio-ink)' }}>
                    {short(n)}
                  </text>
                )}
              </g>
            );
          })
        ) : (
          <g key={k}>
            <polyline points={s.values.map((n, i) => `${x(i)},${y(n)}`).join(' ')} fill="none" style={{ stroke: INK[k] }} strokeWidth={1.4} strokeDasharray={k ? '4 3' : undefined} />
            {s.values.map((n, i) => (
              <circle key={i} cx={x(i)} cy={y(n)} r={2.2} style={{ fill: k ? 'var(--folio-paper)' : INK[0], stroke: INK[k] }} strokeWidth={1} />
            ))}
          </g>
        ),
      )}
      {v.categories.map((c, i) => (
        <text key={i} x={x(i)} y={PLOT.bottom + 9} textAnchor="middle" fontSize={6.5} style={{ fill: 'var(--folio-ink)' }}>
          {c.length > 14 ? `${c.slice(0, 13)}…` : c}
        </text>
      ))}
      <text x={PLOT.left} y={H - 3} fontSize={6} style={{ fill: 'var(--folio-ink-2)' }}>
        {[v.unit, !one && v.series.map((s, k) => `${k ? '□' : '■'} ${s.name}`).join('   '), v.illustrative && t.slides.illustrative].filter(Boolean).join('   ·   ')}
      </text>
    </svg>
  );
}

/** The chart's numbers, to change where they stand: the chart is drawn from them again. */
export function ChartData({ v, onChange }: { v: Chart; onChange: (next: Chart) => void }) {
  const t = useT();
  const set = (k: number, i: number, text: string) => {
    const n = Number(text.replace(/,/g, ''));
    if (Number.isFinite(n)) onChange({ ...v, series: v.series.map((s, a) => (a === k ? { ...s, values: s.values.map((x, b) => (b === i ? n : x)) } : s)) });
  };
  return (
    <table className="no-print mt-2 w-full border-collapse font-ui text-12 text-ink-2" aria-label={t.slides.chartData}>
      <tbody>
        <tr>
          <th scope="row" className="pr-2 text-left font-semibold">
            {v.unit}
          </th>
          {v.categories.map((c, i) => (
            <td key={i} className="border border-rule px-1.5 py-0.5">
              <EditableText as="div" value={c} label={t.slides.category(i + 1)} onCommit={(text) => onChange({ ...v, categories: v.categories.map((x, b) => (b === i ? text : x)) })} />
            </td>
          ))}
        </tr>
        {v.series.map((s, k) => (
          <tr key={k}>
            <th scope="row" className="pr-2 text-left font-semibold">
              {s.name || t.slides.values}
            </th>
            {s.values.map((n, i) => (
              <td key={i} className="border border-rule px-1.5 py-0.5">
                <EditableText as="div" value={String(n)} label={t.slides.valueOf(v.categories[i] ?? '')} onCommit={(text) => set(k, i, text)} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TableView({ v, onChange }: { v: Table; onChange?: (next: Table) => void }) {
  const t = useT();
  const cell = (r: number, c: number, text: string) => onChange?.({ ...v, rows: v.rows.map((row, i) => (i === r ? row.map((x, j) => (j === c ? text : x)) : row)) });
  return (
    <table className="folio-slide-table w-full border-collapse font-reading text-ink">
      <thead>
        <tr>
          {v.columns.map((c, i) => (
            <th key={i} scope="col">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {v.rows.map((row, r) => (
          <tr key={r}>
            {row.map((value, c) => (
              <td key={c}>{onChange ? <EditableText as="div" value={value} label={t.module.exhibit.cell(v.columns[c] ?? '', r + 1)} placeholder=" " onCommit={(text) => cell(r, c, text)} /> : value}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** A slide's table or chart, at the slide's own scale. A table's words are changed in place; a chart's numbers under the slide, where there is room for them. */
export function SlideVisualView({ visual, onChange }: { visual: SlideVisual; onChange?: (next: SlideVisual) => void }) {
  if (visual.kind === 'table') return <TableView v={visual} onChange={onChange} />;
  return <ChartView v={visual} />;
}
