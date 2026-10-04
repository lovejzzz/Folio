import { isFileName, type PageBlock } from '@folio/core';
import { Button } from '@folio/ui';
import { Clapperboard, Download, Image, Paperclip, Upload, type LucideIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { EditableText } from '../components/editing/EditableText';
import { useT } from '../i18n';
import { useMediaUrl } from '../state/mediaUrl';
import { checkPictureAt } from '../state/pictureCheck';
import { PickButton, PickError, useMediaPicker, type AddedMedia, type SlotKind } from './useMediaPicker';

/** A picture or clip as a page holds it, under a step or on its own. */
export interface MediaValue {
  src: string;
  alt: string;
  caption: string;
  shows: string;
  poster?: string;
  transcript?: string;
  minutes?: number;
  clip?: boolean;
  check?: { problems: string[]; personal: string[] } | undefined;
}

/** Where a picture sits, for looking at it beside its step: the lesson, and its block's or its step's id. */
export interface PicturePlaceId {
  lessonId: string;
  id: string;
}

/** How a place is changed. Without it the page is only read: no buttons, no fields. */
interface MediaEdit<T> {
  courseId: string;
  onChange: (next: Partial<T>) => void;
}

const editOf = <T,>(courseId: string | undefined, onChange: ((next: Partial<T>) => void) | undefined): MediaEdit<T> | undefined => (courseId && onChange ? { courseId, onChange } : undefined);

type Target = ReturnType<typeof useMediaPicker>['target'];

const ICONS: Record<SlotKind, LucideIcon> = { image: Image, clip: Clapperboard, video: Clapperboard, file: Paperclip };

/** Replace and Remove, under what is there. Removing leaves the bytes on the device, so undo brings the picture back. */
function Actions({ slot, courseId, onAdded, onRemove, at }: { slot: SlotKind; courseId: string; onAdded: (added: AddedMedia) => void; onRemove: () => void; at?: PicturePlaceId | undefined }) {
  const t = useT();
  const picker = useMediaPicker(courseId, slot, onAdded);
  const [checking, setChecking] = useState(false);
  const check = async (place: PicturePlaceId) => {
    setChecking(true);
    await checkPictureAt(place.lessonId, place.id);
    setChecking(false);
  };
  return (
    <>
      <div className="mod-media-actions no-print">
        {at && slot === 'image' && (
          <Button size="sm" variant="quiet" aria-label={t.module.checkPictureLabel} isDisabled={checking} onPress={() => void check(at)}>
            {checking ? t.module.checkingPicture : t.module.checkPicture}
          </Button>
        )}
        <PickButton picker={picker} name={t.module.replaceMedia[slot]}>
          {t.module.replace}
        </PickButton>
        <Button size="sm" variant="quiet" aria-label={t.module.removeMedia[slot]} onPress={onRemove}>
          {t.module.remove}
        </Button>
      </div>
      <PickError picker={picker} />
    </>
  );
}

interface SlotProps {
  slot: SlotKind;
  title: string;
  /** The course names something this device does not have. */
  elsewhere: boolean;
  /** The course to add to; none where the page is only read. */
  courseId: string | undefined;
  onAdded: (added: AddedMedia) => void;
  children: ReactNode;
}

function AddButton({ slot, courseId, onAdded, children }: { slot: SlotKind; courseId: string; onAdded: (added: AddedMedia) => void; children: (target: Target | undefined, button: ReactNode) => ReactNode }) {
  const t = useT();
  const picker = useMediaPicker(courseId, slot, onAdded);
  return children(
    picker.target,
    <div className="mod-media-add no-print">
      <PickButton picker={picker} name={t.module.addMedia[slot]}>
        <Upload size={14} strokeWidth={1.5} aria-hidden />
        {t.module.addMedia[slot]}
      </PickButton>
      <PickError picker={picker} />
    </div>,
  );
}

/** The place where a picture or clip goes, saying what it must show, and the way to put one there. */
function Slot({ slot, title, elsewhere, courseId, onAdded, children }: SlotProps) {
  const t = useT();
  const Icon = ICONS[slot];
  const box = (target: Target | undefined, button: ReactNode) => (
    <div className="mod-slot" data-slot={slot === 'image' ? 'image' : 'video'} {...target}>
      <Icon size={18} strokeWidth={1.5} aria-hidden />
      <div>
        <strong>{title}</strong>
        {children}
        {elsewhere && <p className="mod-slot-note">{t.module.addedElsewhere}</p>}
        {button}
      </div>
    </div>
  );
  return courseId ? (
    <AddButton slot={slot} courseId={courseId} onAdded={onAdded}>
      {box}
    </AddButton>
  ) : (
    box(undefined, null)
  );
}

/** The caption and, for the teacher alone, the words a student who can't see the picture is given. */
function Words({ media, edit }: { media: MediaValue; edit: MediaEdit<MediaValue> | undefined }) {
  const t = useT();
  if (!edit) return media.caption ? <figcaption>{media.caption}</figcaption> : null;
  return (
    <>
      <figcaption className={media.caption ? undefined : 'no-print'}>
        <EditableText value={media.caption} label={t.module.caption} onCommit={(caption) => edit.onChange({ caption })} />
      </figcaption>
      <div className="mod-media-alt no-print">
        <span aria-hidden>{t.module.altLabel}</span>
        <EditableText multiline value={media.alt} label={t.module.altLabel} placeholder="…" onCommit={(alt) => edit.onChange({ alt })} />
      </div>
    </>
  );
}

/** What looking at the picture beside its step found, for the teacher alone. */
function Checked({ check, onClear }: { check: NonNullable<MediaValue['check']>; onClear: () => void }) {
  const t = useT();
  const found = [...check.problems, ...check.personal.map((p) => `${t.module.checkPersonal} ${p}`)];
  if (!found.length) return <p className="mod-media-checked no-print">{t.module.checkFits}</p>;
  return (
    <div role="note" className="mod-media-check no-print">
      <ul>
        {found.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
      <Button size="sm" variant="quiet" onPress={onClear}>
        {t.changes.resolve}
      </Button>
    </div>
  );
}

interface MediaProps {
  kind: 'image' | 'video';
  media: MediaValue;
  /** The course the page belongs to: what its own pictures are looked up under. */
  courseId?: string | undefined;
  /** Given where the page can be changed. Without it there are no buttons and no fields. */
  onChange?: ((next: Partial<MediaValue>) => void) | undefined;
  /** Where the picture sits, where it can be looked at beside its step. */
  at?: PicturePlaceId | undefined;
}

/** A picture or clip; before it is made, the place where it goes and what it must show. */
export function Media({ kind, media, courseId, onChange, at }: MediaProps) {
  const t = useT();
  const edit = editOf(courseId, onChange);
  const { src, alt, caption, shows, transcript, minutes, clip } = media;
  const slot: SlotKind = kind === 'image' ? 'image' : clip ? 'clip' : 'video';
  const found = useMediaUrl(courseId, src);
  const poster = useMediaUrl(courseId, media.poster ?? '');
  // Another picture is another thing to look at: what was found in the last one goes with it.
  const onAdded = (added: AddedMedia) => edit?.onChange(kind === 'video' ? { src: added.ref, poster: added.poster } : { src: added.ref, check: undefined });
  const script = transcript?.trim() ? (
    // Until the video is made, its transcript is the teaching: shown open, not behind a click.
    <details className="mod-transcript" open={!src}>
      <summary>{t.module.transcript}</summary>
      <p>{transcript}</p>
    </details>
  ) : null;
  if (!src || found.state === 'missing') {
    const title = kind === 'image' ? t.module.imageSlot : clip ? t.module.clipSlot : t.module.videoSlot;
    return (
      <Slot slot={slot} title={`${title}${minutes && minutes >= 1 ? ` · ${t.module.videoLength(Math.round(minutes))}` : ''}`} elsewhere={Boolean(src)} courseId={edit?.courseId} onAdded={onAdded}>
        {shows || alt}
        {script}
      </Slot>
    );
  }
  if (!found.url) return <div className="mod-media-wait" data-media-pending aria-busy="true" aria-label={t.module.loadingMedia} role="img" />;
  return (
    <figure className="mod-figure avoid-break">
      {kind === 'image' ? (
        // The picture opens at full size: a whole window fitted to the column is too small to read.
        <a href={found.url} target="_blank" rel="noreferrer" aria-label={t.module.enlarge(alt || caption)}>
          <img src={found.url} alt={alt} loading="lazy" />
        </a>
      ) : (
        <video src={found.url} poster={poster.url} controls preload="metadata" playsInline muted={clip} loop={clip} aria-label={alt || caption || t.module.videoSlot} />
      )}
      {clip && alt && <p className="sr-only">{alt}</p>}
      <Words media={media} edit={edit} />
      {edit && media.check && <Checked check={media.check} onClear={() => edit.onChange({ check: undefined })} />}
      {edit && <Actions slot={slot} courseId={edit.courseId} at={at} onAdded={onAdded} onRemove={() => edit.onChange(kind === 'video' ? { src: '', poster: '' } : { src: '', check: undefined })} />}
      {script}
    </figure>
  );
}

type FileBlock = Extract<PageBlock, { type: 'file' }>;

/** A file to download; before it is attached, the place where it goes. */
export function FileRow({ block, courseId, onChange }: { block: FileBlock; courseId?: string | undefined; onChange?: ((next: Partial<FileBlock>) => void) | undefined }) {
  const t = useT();
  const edit = editOf(courseId, onChange);
  const found = useMediaUrl(courseId, block.href);
  // An attached file whose label says nothing takes the file's own name.
  const onAdded = (added: AddedMedia) => edit?.onChange({ href: added.ref, label: block.label.trim() ? block.label : added.name });
  const body = (
    <>
      <Download size={16} strokeWidth={1.5} aria-hidden />
      <span>{block.label}</span>
      <span className="mod-file-role">{found.url ? t.module.fileRoles[block.role] : found.state === 'loading' ? t.module.loadingMedia : t.module.fileSlot}</span>
    </>
  );
  if (found.url) {
    // Saved under the name the page calls it by, when that is a file name: the steps say "unzip HopStart.zip".
    const name = isFileName(block.label) ? block.label.trim() : (found.name ?? true);
    return (
      <div className="mod-file-row">
        <a className="mod-file" href={found.url} download={name}>
          {body}
        </a>
        {edit && <Actions slot="file" courseId={edit.courseId} onAdded={onAdded} onRemove={() => edit.onChange({ href: '' })} />}
      </div>
    );
  }
  const row = (target: Target | undefined, button: ReactNode) => (
    <div className="mod-file-row" {...target}>
      <div className="mod-file" data-slot="file" title={block.shows}>
        {body}
      </div>
      {block.href && found.state === 'missing' && <p className="mod-slot-note">{t.module.addedElsewhere}</p>}
      {button}
    </div>
  );
  return edit && found.state !== 'loading' ? (
    <AddButton slot="file" courseId={edit.courseId} onAdded={onAdded}>
      {row}
    </AddButton>
  ) : (
    row(undefined, null)
  );
}
