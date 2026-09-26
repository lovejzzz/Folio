import type { Block, SemanticDoc } from '@folio/core';
import { cx } from '@folio/ui';
import { useT } from '../i18n';
import { SlideCanvas } from '../materials/SlideCanvas';

function Table({ head, rows, widths }: { head: string[]; rows: string[][]; widths?: number[] }) {
  return (
    <div className="-mx-1 my-5 overflow-x-auto">
      <table className="w-full border-collapse font-ui text-14 leading-5">
        {widths && (
          <colgroup>
            {widths.map((w, i) => (
              <col key={i} style={{ width: `${w}%` }} />
            ))}
          </colgroup>
        )}
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} scope="col" className="border-b border-rule-strong px-2 py-2 text-left text-12 font-semibold text-ink-2">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} className="avoid-break align-top">
              {row.map((cell, c) => (
                <td key={c} className={cx('whitespace-pre-line border-b border-rule px-2 py-2.5', c === 0 ? 'font-medium text-ink' : 'text-ink-2')}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QuestionBlock({ b }: { b: Extract<Block, { t: 'question' }> }) {
  const t = useT();
  return (
    <div className="avoid-break my-5">
      <p>
        <span className="mr-2 font-ui text-14 font-semibold text-ink tabular">{b.n}.</span>
        {b.prompt}
      </p>
      {b.choices.length > 0 && (
        <ol className="mt-2 space-y-1 pl-7">
          {b.choices.map((c, i) => (
            <li key={i} className="flex gap-2">
              <span className="font-ui text-14 text-ink-2">{String.fromCharCode(65 + i)}.</span>
              {c}
            </li>
          ))}
        </ol>
      )}
      {!b.answer && b.choices.length === 0 && <div aria-hidden className="mt-3 space-y-5 pl-7">{[0, 1].map((i) => <div key={i} className="border-b border-rule-strong" />)}</div>}
      {b.answer && (
        <p className="mt-2 pl-7 font-ui text-14 leading-6 text-ink-2">
          <span className="font-semibold text-good">{t.quiz.answer}: </span>
          {b.answer}
          {b.explanation && <span className="block">{b.explanation}</span>}
        </p>
      )}
    </div>
  );
}

function BlockView({ b, lang }: { b: Block; lang: string }) {
  switch (b.t) {
    case 'heading':
      return b.level === 1 ? <h2 className="mb-4 mt-10 text-28 font-semibold leading-9">{b.text}</h2> : b.level === 2 ? <h3 className="mb-3 mt-10 text-22 font-semibold leading-8 first:mt-0">{b.text}</h3> : <h4 className="mb-2 mt-6 text-18 font-semibold">{b.text}</h4>;
    case 'para':
      return <p className={cx('my-3', b.tone === 'lead' && 'text-18 leading-8 text-ink-2', b.tone === 'muted' && 'font-ui text-14 text-ink-2')}>{b.text}</p>;
    case 'list': {
      const L = b.ordered ? 'ol' : 'ul';
      return <L className={cx('my-3 space-y-1 pl-6', b.ordered ? 'list-decimal' : 'list-disc marker:text-ink-3')}>{b.items.map((x, i) => <li key={i}>{x}</li>)}</L>;
    }
    case 'meta':
      return (
        <dl className="my-5 grid grid-cols-1 gap-x-6 gap-y-1 rounded-control bg-well px-4 py-3 font-ui text-14 sm:grid-cols-3">
          {b.items.map((m) => (
            <div key={m.label}>
              <dt className="text-12 text-ink-2">{m.label}</dt>
              <dd className="text-ink">{m.value}</dd>
            </div>
          ))}
        </dl>
      );
    case 'table':
      return <Table head={b.head} rows={b.rows} widths={b.widths} />;
    case 'terms':
      return (
        <dl className="my-3 divide-y divide-rule">
          {b.items.map((x) => (
            <div key={x.term} className="grid gap-x-6 py-1.5 sm:grid-cols-3">
              <dt className="font-semibold">{x.term}</dt>
              <dd className="sm:col-span-2">{x.definition}</dd>
            </div>
          ))}
        </dl>
      );
    case 'note':
      return (
        <div className="my-3 whitespace-pre-line rounded-control bg-well px-4 py-3 font-ui text-14 leading-6 text-ink-2">
          <span className="font-semibold text-ink">{b.label}</span>
          {'\n'}
          {b.text}
        </div>
      );
    case 'question':
      return <QuestionBlock b={b} />;
    case 'slide':
      return (
        <div className="avoid-break my-4 overflow-hidden rounded-control shadow-sheet">
          <SlideCanvas slide={{ id: String(b.n), layout: b.layout, title: b.title, bullets: b.bullets, notes: b.notes ?? '' }} lang={lang} footer={b.lesson} />
          {b.notes && <p className="border-t border-rule px-4 py-2 font-ui text-13 text-ink-2">{b.notes}</p>}
        </div>
      );
    case 'answers':
      return (
        <section className="my-6">
          <h3 className="mb-3 text-22 font-semibold">{b.title}</h3>
          <ol className="columns-2 gap-8 font-ui text-14 leading-6">
            {b.items.map((x) => (
              <li key={x.n} className="break-inside-avoid">
                <span className="mr-1.5 font-semibold tabular">{x.n}.</span>
                {x.answer}
              </li>
            ))}
          </ol>
        </section>
      );
    case 'break':
      return <hr className="print-break my-10 border-rule" />;
  }
}

/** A projected material, read-only: the same document every exporter receives. */
export function DocView({ doc, showTitle = true }: { doc: SemanticDoc; showTitle?: boolean }) {
  return (
    <div className="folio-doc" lang={doc.language}>
      {showTitle && <h1 className="mb-6 font-display text-48 leading-none text-ink">{doc.title}</h1>}
      {doc.blocks.map((b, i) => (
        <BlockView key={i} b={b} lang={doc.language} />
      ))}
    </div>
  );
}
