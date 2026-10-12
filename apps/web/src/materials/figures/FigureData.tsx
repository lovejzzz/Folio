import { enteredFaults, figureEntries, figureProblem, isFigureNumber, sortedForSearch, type FigureEntered, type SlideVisual } from '@folio/core';
import { cabinetCramped } from '@folio/figures';
import { Button, SegmentedControl } from '@folio/ui';
import { EditableText } from '../../components/editing/EditableText';
import { useT } from '../../i18n';

type Figure = Extract<SlideVisual, { kind: 'figure' }>;

/** A demonstration a teacher adds: a short sorted list with its target in the middle of the second half. */
export const newBinarySearch = (): Figure => ({ kind: 'figure', figure: 'binarySearch', look: 'cabinet', values: [3, 8, 12, 17, 23, 31, 42, 56, 71], target: 42 });

/** What was typed, with a field put right taken out of it: nothing left means the demonstration is finished. */
function typed(v: Figure, field: keyof FigureEntered, text: string | undefined): Figure {
  const entered = { ...v.entered, [field]: text };
  return { ...v, entered: entered.values === undefined && entered.target === undefined ? undefined : entered };
}

/**
 * The demonstration's numbers, under the slide where there is room for them. What is typed and is not a number is
 * kept in the course as typed, with the entries at fault named, and the demonstration is unfinished until it is put
 * right: "1, nope, 3" had become "1, 3" without a word, and a draft held only on the screen went with the next slide.
 */
export function FigureData({ v, onChange }: { v: Figure; onChange: (next: Figure) => void }) {
  const t = useT();
  const problem = figureProblem(v);
  const wrong = enteredFaults(v.entered);
  const values = (text: string) => {
    const given = figureEntries(text);
    onChange(given.every(isFigureNumber) ? { ...typed(v, 'values', undefined), values: given.map(Number) } : typed(v, 'values', text));
  };
  const target = (text: string) => onChange(isFigureNumber(text) ? { ...typed(v, 'target', undefined), target: Number(text) } : typed(v, 'target', text));
  return (
    <div className="no-print mt-2 grid gap-1 font-ui text-12 text-ink-2" role="group" aria-label={t.figures.data}>
      <div className="flex items-center gap-2">
        <span className="shrink-0 font-semibold">{t.figures.look}</span>
        <SegmentedControl<Figure['look']> label={t.figures.look} value={v.look} onChange={(look) => onChange({ ...v, look })} options={[{ id: 'cabinet', label: t.figures.looks.cabinet }, { id: 'flat', label: t.figures.looks.flat }, { id: 'composite', label: t.figures.looks.composite }]} />
      </div>
      <div className="flex items-baseline gap-2">
        <span className="shrink-0 font-semibold">{t.figures.values}</span>
        <EditableText as="div" className="min-w-0 flex-1 border border-rule px-1.5 py-0.5 tabular-nums" value={v.entered?.values ?? v.values.join(', ')} label={t.figures.values} placeholder={t.figures.valuesHint} onCommit={values} />
      </div>
      <div className="flex items-baseline gap-2">
        <span className="shrink-0 font-semibold">{t.figures.target}</span>
        <EditableText as="div" className="border border-rule px-1.5 py-0.5 tabular-nums" value={v.entered?.target ?? String(v.target)} label={t.figures.target} onCommit={target} />
      </div>
      {/* Drawn, and too small to read: said, with the look that has room for them one press away. Never switched unasked. */}
      {!problem && v.look === 'cabinet' && cabinetCramped(v.values, v.target) && (
        <p role="note" className="flex flex-wrap items-center gap-2 text-ink">
          {t.figures.cramped}
          <Button size="sm" variant="secondary" onPress={() => onChange({ ...v, look: 'flat' })}>
            {t.figures.asRow}
          </Button>
        </p>
      )}
      {problem === 'unfinished' && (
        <p role="alert" className="text-ink">
          {t.figures.notNumber(wrong)}
        </p>
      )}
      {problem && problem !== 'unfinished' && (
        <p role="alert" className="flex flex-wrap items-center gap-2 text-ink">
          {t.figures.problem[problem]}
          {problem === 'unsorted' && (
            <Button size="sm" variant="secondary" onPress={() => onChange({ ...v, values: sortedForSearch(v.values) })}>
              {t.figures.sort}
            </Button>
          )}
        </p>
      )}
    </div>
  );
}
