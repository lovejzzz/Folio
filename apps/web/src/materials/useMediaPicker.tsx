import { localMediaRef } from '@folio/core';
import { Button } from '@folio/ui';
import { useRef, useState, type ClipboardEvent, type DragEvent, type ReactNode } from 'react';
import { useT, type Messages } from '../i18n';
import { ACCEPT, MediaFileError, prepareMedia, type MediaKind } from '../lib/mediaFile';
import { isQuotaError } from '../state/db';
import { putMedia } from '../state/media';

/** The kinds of place a page has for something the teacher adds. A clip is a video without sound, named apart. */
export type SlotKind = 'image' | 'clip' | 'video' | 'file';

const FILE_KIND: Record<SlotKind, MediaKind> = { image: 'image', clip: 'video', video: 'video', file: 'file' };

/** What was just kept on this device: how the page refers to it, its poster if it is a video, and the file's name. */
export interface AddedMedia {
  ref: string;
  poster: string;
  name: string;
}

function problemText(t: Messages, error: unknown): string {
  if (error instanceof MediaFileError) return error.problem === 'unreadable' ? t.module.mediaErrors.unreadable : t.module.mediaErrors[error.problem][error.kind];
  return isQuotaError(error) ? t.errors.storageFull : t.module.mediaErrors.failed;
}

export interface MediaPicker {
  slot: SlotKind;
  busy: boolean;
  error: string | null;
  take: (file: File | undefined) => void;
  /** For the place itself: a file dropped on it, or a picture pasted while its button has the focus, is taken. */
  target: { onDragOver: (e: DragEvent) => void; onDrop: (e: DragEvent) => void; onPaste: (e: ClipboardEvent) => void };
}

/** Takes a file from the picker, a drop or a paste, keeps it on this device, and says what the page should now point to. */
export function useMediaPicker(courseId: string, slot: SlotKind, onAdded: (added: AddedMedia) => void): MediaPicker {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const store = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const ready = await prepareMedia(FILE_KIND[slot], file);
      const id = await putMedia(courseId, ready.blob, ready.name);
      const poster = ready.poster ? await putMedia(courseId, ready.poster, 'poster.webp') : '';
      onAdded({ ref: localMediaRef(id), poster: poster && localMediaRef(poster), name: ready.name });
    } catch (e) {
      setError(problemText(t, e));
    } finally {
      setBusy(false);
    }
  };
  const take = (file: File | undefined) => {
    if (file && !busy) void store(file);
  };
  const target = {
    onDragOver: (e: DragEvent) => {
      if (e.dataTransfer.types.includes('Files')) e.preventDefault();
    },
    onDrop: (e: DragEvent) => {
      if (!e.dataTransfer.files.length) return;
      e.preventDefault();
      take(e.dataTransfer.files[0]);
    },
    onPaste: (e: ClipboardEvent) => {
      const picture = slot === 'image' ? [...e.clipboardData.files].find((f) => f.type.startsWith('image/')) : undefined;
      if (!picture) return;
      e.preventDefault();
      take(picture);
    },
  };
  return { slot, busy, error, take, target };
}

/** The button that opens the file picker, with the picker itself. `name` is what a screen reader calls the button. */
export function PickButton({ picker, name, children }: { picker: MediaPicker; name: string; children: ReactNode }) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button size="sm" aria-label={picker.busy ? undefined : name} isDisabled={picker.busy} onPress={() => input.current?.click()}>
        {picker.busy ? t.module.addingMedia : children}
      </Button>
      <input
        ref={input}
        type="file"
        hidden
        tabIndex={-1}
        aria-label={t.module.chooseMedia[picker.slot]}
        accept={ACCEPT[FILE_KIND[picker.slot]]}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          picker.take(file);
        }}
      />
    </>
  );
}

/** What went wrong with the last file, said where it was added. */
export function PickError({ picker }: { picker: MediaPicker }) {
  return picker.error ? (
    <p role="alert" className="mod-media-error no-print">
      {picker.error}
    </p>
  ) : null;
}
