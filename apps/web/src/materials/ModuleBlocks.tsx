import type { PageBlock, Step } from '@folio/core';
import { IconButton } from '@folio/ui';
import { BookOpen, Check, CircleAlert, CircleCheck, CirclePlay, Clapperboard, Copy, Download, Hammer, Image, Info, Lightbulb, MessagesSquare, PencilLine, Tag, TriangleAlert, Upload, Wrench, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { EditableText } from '../components/editing/EditableText';
import { useT } from '../i18n';

type Of<T extends PageBlock['type']> = Extract<PageBlock, { type: T }>;
/** Change one block: the page saves the whole list. */
export type Patch = (block: PageBlock) => void;

const ACTIVITY: Record<Of<'checklist'>['items'][number]['activity'], LucideIcon> = { read: BookOpen, watch: CirclePlay, build: Hammer, practice: PencilLine, check: CircleCheck, discuss: MessagesSquare, submit: Upload };
const CALLOUT: Record<Of<'callout'>['kind'], LucideIcon> = { checkpoint: CircleCheck, stuck: Wrench, why: Lightbulb, tip: Info, warning: TriangleAlert, version: Tag };

/** "9 hours", "1 h 30 min". */
function useDuration(): (minutes: number) => string {
  const t = useT();
  return (minutes) => (minutes >= 60 && minutes % 60 === 0 ? t.module.hours(minutes / 60) : minutes > 90 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : t.module.minutes(minutes));
}

export function Checklist({ block }: { block: Of<'checklist'> }) {
  const t = useT();
  const duration = useDuration();
  const total = block.items.reduce((n, i) => n + i.minutes, 0);
  return (
    <section className="mod-checklist avoid-break" aria-label={t.module.thisWeek}>
      <div className="mod-checklist-head">
        <h4>{t.module.thisWeek}</h4>
        <span>{t.module.total(duration(Math.round(total / 30) * 30))}</span>
      </div>
      <ol>
        {block.items.map((item) => {
          const Icon = ACTIVITY[item.activity];
          return (
            <li key={item.id}>
              <Icon size={16} strokeWidth={1.75} aria-label={t.module.activities[item.activity]} />
              <span>{item.label}</span>
              <span className="mod-checklist-meta">
                {item.due && <span className="mod-due">{t.module.due(item.due)}</span>}
                {duration(item.minutes)}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** A picture or clip; before it is made, the place where it goes and what it must show. */
export function Media({ kind, src, alt, caption, shows, poster, transcript, minutes, clip }: { kind: 'image' | 'video'; src: string; alt: string; caption: string; shows: string; poster?: string; transcript?: string; minutes?: number; clip?: boolean }) {
  const t = useT();
  const Icon = kind === 'image' ? Image : Clapperboard;
  const script = transcript?.trim() ? (
    // Until the video is made, its transcript is the teaching: shown open, not behind a click.
    <details className="mod-transcript" open={!src}>
      <summary>{t.module.transcript}</summary>
      <p>{transcript}</p>
    </details>
  ) : null;
  if (!src) {
    return (
      <div className="mod-slot" data-slot={kind}>
        <Icon size={18} strokeWidth={1.5} aria-hidden />
        <div>
          <strong>
            {kind === 'image' ? t.module.imageSlot : clip ? t.module.clipSlot : t.module.videoSlot}
            {minutes && minutes >= 1 ? ` · ${t.module.videoLength(Math.round(minutes))}` : ''}
          </strong>
          {shows || alt}
          {script}
        </div>
      </div>
    );
  }
  return (
    <figure className="mod-figure avoid-break">
      {kind === 'image' ? (
        // The picture opens at full size: a whole window fitted to the column is too small to read.
        <a href={src} target="_blank" rel="noreferrer" aria-label={t.module.enlarge(alt || caption)}>
          <img src={src} alt={alt} loading="lazy" />
        </a>
      ) : (
        <video src={src} poster={poster || undefined} controls preload="metadata" playsInline muted={clip} loop={clip} aria-label={alt || caption || t.module.videoSlot} />
      )}
      {clip && alt && <p className="sr-only">{alt}</p>}
      {caption && <figcaption>{caption}</figcaption>}
      {script}
    </figure>
  );
}

/** Numbered actions; `start` carries the count on through a part. */
export function Steps({ block, start, patch }: { block: Of<'steps'>; start: number; patch: Patch }) {
  const t = useT();
  const set = (step: Step) => patch({ ...block, items: block.items.map((s) => (s.id === step.id ? step : s)) });
  return (
    <ol className="mod-steps" start={start}>
      {block.items.map((step, i) => (
        <li key={step.id}>
          <span className="mod-step-n" aria-hidden>
            {start + i}
          </span>
          <div className="grid gap-3">
            <EditableText as="p" multiline value={step.text} label={t.module.stepText(start + i)} onCommit={(text) => set({ ...step, text })} />
            {step.shot && <Media kind="image" {...step.shot} />}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function Callout({ block, patch }: { block: Of<'callout'>; patch: Patch }) {
  const t = useT();
  const Icon = block.kind === 'stuck' ? CircleAlert : CALLOUT[block.kind];
  const label = t.module.callouts[block.kind];
  return (
    <aside className="mod-callout avoid-break" data-kind={block.kind} aria-label={block.title ? `${label}: ${block.title}` : label}>
      <div className="mod-callout-head">
        <Icon size={15} strokeWidth={2} aria-hidden />
        {block.title ? `${label}: ${block.title}` : label}
      </div>
      <EditableText as="div" multiline className="mod-callout-body" value={block.text} label={label} onCommit={(text) => patch({ ...block, text })} />
    </aside>
  );
}

export function CodeBlock({ block }: { block: Of<'code'> }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(block.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };
  return (
    <figure className="mod-code avoid-break">
      <div className="mod-code-head">
        <span>{[block.caption, block.language && block.language.toUpperCase()].filter(Boolean).join(' · ') || t.module.code}</span>
        <IconButton size="sm" label={copied ? t.module.copied : t.module.copy} className="no-print" onPress={copy}>
          {copied ? <Check size={14} strokeWidth={1.75} /> : <Copy size={14} strokeWidth={1.5} />}
        </IconButton>
      </div>
      <pre>
        <code>{block.code}</code>
      </pre>
    </figure>
  );
}

export function FileRow({ block }: { block: Of<'file'> }) {
  const t = useT();
  const body = (
    <>
      <Download size={16} strokeWidth={1.5} aria-hidden />
      <span>{block.label}</span>
      <span className="mod-file-role">{block.href ? t.module.fileRoles[block.role] : t.module.fileSlot}</span>
    </>
  );
  return block.href ? (
    // Saved under the name the page calls it by, when that is a file name: the steps say "unzip HopStart.zip".
    <a className="mod-file" href={block.href} download={/\.\w{2,5}$/.test(block.label.trim()) ? block.label.trim() : true}>
      {body}
    </a>
  ) : (
    <div className="mod-file" data-slot="file" title={block.shows}>
      {body}
    </div>
  );
}

export function Terms({ block }: { block: Of<'terms'> }) {
  return (
    <dl className="mod-terms">
      {block.items.map((item) => (
        <div key={item.term}>
          <dt>{item.term}</dt>
          <dd>{item.meaning}</dd>
        </div>
      ))}
    </dl>
  );
}
