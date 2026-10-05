import type { ExhibitBlock, PageBlock } from '@folio/core';
import { Button } from '@folio/ui';
import { useState } from 'react';
import { EditableText } from '../components/editing/EditableText';
import { useT } from '../i18n';
import type { Patch } from './ModuleBlocks';

type Exhibit = Extract<PageBlock, { type: 'exhibit' }>;
type Part = Exhibit['parts'][number];

/** One block of an exhibit, every word of it editable where it stands. */
export function Piece({ block, change }: { block: ExhibitBlock; change: (next: ExhibitBlock) => void }) {
  const t = useT();
  const label = t.module.exhibit.text;
  switch (block.type) {
    case 'heading':
      return <EditableText as="p" className="mod-exhibit-h" value={block.text} label={label} onCommit={(text) => change({ ...block, text })} />;
    case 'para':
      return <EditableText as="p" multiline value={block.text} label={label} onCommit={(text) => change({ ...block, text })} />;
    case 'list':
      return (
        <ul className="mod-list">
          {block.items.map((item, i) => (
            <EditableText key={i} as="li" multiline value={item} label={label} onCommit={(text) => change({ ...block, items: block.items.map((x, n) => (n === i ? text : x)) })} />
          ))}
        </ul>
      );
    case 'field':
      return (
        <p className="mod-exhibit-field">
          <span>{block.label}</span>
          <EditableText as="span" value={block.value} label={block.label || label} placeholder=" " onCommit={(value) => change({ ...block, value })} />
        </p>
      );
    case 'yours':
      return <p className="mod-exhibit-yours">{block.hint}</p>;
    case 'table':
      return <Table block={block} change={change} />;
  }
}

function Table({ block, change }: { block: Extract<ExhibitBlock, { type: 'table' }>; change: (next: ExhibitBlock) => void }) {
  const t = useT();
  const cell = (r: number, c: number, text: string) => change({ ...block, rows: block.rows.map((row, i) => (i === r ? row.map((x, j) => (j === c ? text : x)) : row)) });
  return (
    <div className="mod-exhibit-scroll">
      <table className="mod-exhibit-table">
        {block.caption && <caption>{block.caption}</caption>}
        <thead>
          <tr>
            {block.columns.map((c, i) => (
              <th key={i} scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, r) => (
            <tr key={r}>
              {row.map((value, c) => (
                // The cell stays a cell, with the words to edit inside it: a table read aloud keeps its rows and columns.
                <td key={c}>
                  <EditableText as="div" multiline value={value} label={t.module.exhibit.cell(block.columns[c] ?? '', r + 1)} placeholder=" " onCommit={(text) => cell(r, c, text)} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PartView({ part, change }: { part: Part; change: (next: Part) => void }) {
  return (
    <div className="mod-exhibit-part">
      {part.label && <p className="mod-kicker">{part.label}</p>}
      {part.blocks.map((b, i) => (
        <Piece key={i} block={b} change={(next) => change({ ...part, blocks: part.blocks.map((x, n) => (n === i ? next : x)) })} />
      ))}
    </div>
  );
}

/**
 * Something the course itself wrote, shown as the thing it is: a page of notes, a model document, a table.
 * One that holds what the student is about to write stays closed until they open it; on paper it is always there.
 */
export function ExhibitView({ block, patch }: { block: Exhibit; patch: Patch }) {
  const t = useT();
  const [open, setOpen] = useState(!block.reveal);
  const name = block.title || t.module.exhibit.frames[block.frame];
  return (
    <figure className="mod-exhibit avoid-break" data-frame={block.frame} aria-label={name}>
      <div className="mod-exhibit-head">
        <span>{t.module.exhibit.frames[block.frame]}</span>
        {block.reveal && (
          <Button size="sm" variant="quiet" className="no-print" aria-expanded={open} onPress={() => setOpen(!open)}>
            {open ? t.module.exhibit.hide : t.module.exhibit.show}
          </Button>
        )}
      </div>
      <div className={open ? 'mod-exhibit-body' : 'mod-exhibit-body mod-exhibit-held'}>
        {block.title && <EditableText as="p" className="mod-exhibit-title" value={block.title} label={t.module.exhibit.title} onCommit={(title) => patch({ ...block, title })} />}
        <div className="mod-exhibit-parts" data-parts={block.parts.length}>
          {block.parts.map((part, i) => (
            <PartView key={i} part={part} change={(next) => patch({ ...block, parts: block.parts.map((p, n) => (n === i ? next : p)) })} />
          ))}
        </div>
        {block.marks.length > 0 && (
          <ol className="mod-exhibit-marks">
            {block.marks.map((m, i) => (
              <li key={i}>
                <strong>{m.quote}</strong> {m.note}
              </li>
            ))}
          </ol>
        )}
      </div>
      {!open && <p className="mod-exhibit-wait no-print">{t.module.exhibit.wait}</p>}
      {block.caption && <EditableText as="div" className="mod-exhibit-caption" value={block.caption} label={t.module.exhibit.caption} onCommit={(caption) => patch({ ...block, caption })} />}
    </figure>
  );
}
