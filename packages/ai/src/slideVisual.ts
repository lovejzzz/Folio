import { figureProblem, type SlideVisual } from '@folio/core';
import type { SlidesDraft } from './schemas';

type SlideDraft = SlidesDraft['slides'][number];

/** A slide's table or chart as the deck keeps it: rows as long as their headings, a value for every category, or nothing at all. */
export function slideVisual(table: SlideDraft['table'], chart: SlideDraft['chart'], steps?: SlideDraft['steps'], compare?: SlideDraft['compare'], figure?: SlideDraft['figure']): { visual?: SlideVisual } {
  // A demonstration is kept only when its numbers are ones its method can work: an unsorted list for a search, or a rate of 0, is dropped, never drawn wrong.
  if (figure && !figureProblem(figure)) return { visual: { kind: 'figure', look: 'composite', ...figure } };
  const named = steps?.steps.filter((x) => x.title.trim()) ?? []; // two named at the least, of a chain as of things side by side
  if (named.length >= 2) return { visual: { kind: 'steps', steps: named, cycle: steps!.cycle } };
  const sides = compare?.sides.filter((x) => x.title.trim()) ?? [];
  if (sides.length >= 2) return { visual: { kind: 'compare', sides, ask: compare!.ask } };
  // The draft is taken loosely, so one odd chart does not cost the deck; only a sound one is kept.
  if (chart && chart.categories.length >= 2 && chart.series.length >= 1 && chart.series.every((x) => x.values.length === chart.categories.length)) return { visual: { kind: 'chart', ...chart, series: chart.series as [typeof chart.series[number]] } };
  if (table && table.columns.length >= 2 && table.rows.length) return { visual: { kind: 'table', columns: table.columns, rows: table.rows.map((r) => table.columns.map((_, i) => r[i] ?? '')) } };
  return {};
}

