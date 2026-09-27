import { Button, IconButton, cx } from '@folio/ui';
import { useNavigate } from '@tanstack/react-router';
import { ArrowRight, FileText, Paperclip, X } from 'lucide-react';
import { useId, useRef, useState, type DragEvent } from 'react';
import { useT } from '../../i18n';
import { setBrief, useDraft } from '../../state/draft';
import { hasModel } from '../../state/prefs';
import { toast } from '../../state/toasts';
import { useUi } from '../../state/ui';
import { LanguageChip, LessonsChip, LevelChip } from './Chips';

function useAttach() {
  const t = useT();
  return async (files: FileList | File[]) => {
    // Copy first: an input's FileList is emptied when it is reset, and a drop's
    // DataTransfer once the event ends, both before the import below resolves.
    const list = Array.from(files);
    const { FileReadError, readSourceFile } = await import('../../lib/readFile');
    const refused: { name: string; reason: 'size' | 'type' }[] = [];
    for (const file of list) {
      try {
        const source = await readSourceFile(file);
        const { files: current, set } = useDraft.getState();
        set({ files: [...current, source] });
      } catch (error) {
        refused.push({ name: file.name, reason: error instanceof FileReadError ? error.reason : 'type' });
      }
    }
    // One message for the whole drop, however many files were refused.
    const [only] = refused;
    if (refused.length === 1 && only) toast({ message: only.reason === 'size' ? t.home.fileTooBig(only.name) : t.home.fileUnsupported(only.name), tone: 'attention' });
    else if (refused.length > 1) toast({ message: t.home.filesRefused(refused.map((r) => r.name)), tone: 'attention' });
  };
}

function AttachedFiles() {
  const t = useT();
  const { files, set } = useDraft();
  if (!files.length) return null;
  return (
    <ul className="flex flex-wrap gap-2 px-5 pb-3 md:px-7" aria-label={t.home.attached(files.length)}>
      {files.map((f, i) => (
        <li key={`${f.title}-${i}`} className="flex h-7 items-center gap-1.5 rounded-full bg-well pl-2.5 pr-1 font-ui text-13 text-ink">
          <FileText size={14} strokeWidth={1.5} className="text-ink-2" aria-hidden />
          <span className="max-w-48 truncate">{f.title}</span>
          <IconButton size="sm" tooltip={false} label={`${t.common.remove} ${f.title}`} onPress={() => set({ files: files.filter((_, j) => j !== i) })} className="size-5">
            <X size={12} strokeWidth={1.75} />
          </IconButton>
        </li>
      ))}
    </ul>
  );
}

function ComposerBar({ onAttach, onGo }: { onAttach: (files: FileList) => void; onGo: () => void }) {
  const t = useT();
  const fileInput = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-rule px-3 py-3 md:px-5">
      <LevelChip />
      <LessonsChip />
      <LanguageChip />
      <IconButton label={t.home.attach} onPress={() => fileInput.current?.click()}>
        <Paperclip size={17} strokeWidth={1.5} />
      </IconButton>
      <input
        ref={fileInput}
        type="file"
        multiple
        accept=".txt,.md,.markdown,.docx,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={(e) => {
          if (e.target.files) onAttach(e.target.files);
          e.target.value = '';
        }}
      />
      <Button variant="primary" size="lg" className="ml-auto h-10 pl-5 pr-4" onPress={onGo}>
        {t.home.continue}
        <ArrowRight size={17} strokeWidth={1.75} aria-hidden />
      </Button>
    </div>
  );
}

/** One large box: "What do you want to teach?", with three quiet chips and files dropped on it. */
export function BriefComposer() {
  const t = useT();
  const navigate = useNavigate();
  const brief = useDraft((s) => s.brief);
  const attach = useAttach();
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState(false);
  const hintId = useId();
  const go = () => {
    const { brief: text, files } = useDraft.getState();
    if (!text.trim() && files.length === 0) return setError(true);
    const start = () => void navigate({ to: '/new' });
    if (hasModel()) start();
    else useUi.getState().requireModel(start);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) void attach(e.dataTransfer.files);
  };
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cx('relative rounded-sheet bg-paper shadow-sheet transition-shadow duration-200', dragging && 'ring-2 ring-accent ring-offset-4 ring-offset-desk')}
    >
      <label htmlFor="brief" className="sr-only">
        {t.home.inputLabel}
      </label>
      <textarea
        id="brief"
        value={brief}
        rows={4}
        onChange={(e) => {
          setError(false);
          setBrief(e.target.value);
        }}
        onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && go()}
        placeholder={t.home.placeholder}
        aria-describedby={error ? hintId : undefined}
        aria-invalid={error || undefined}
        className="block min-h-36 w-full resize-none bg-transparent px-5 pb-3 pt-5 font-reading text-18 leading-relaxed text-ink outline-none placeholder:text-ink-3 md:px-7 md:pt-6 md:text-22 md:leading-9"
        style={{ fieldSizing: 'content' } as React.CSSProperties}
      />
      {dragging && <p className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-sheet bg-accent-tint font-ui text-16 font-medium text-accent">{t.home.dropHere}</p>}
      <AttachedFiles />
      <ComposerBar onAttach={(files) => void attach(files)} onGo={go} />
      {error && (
        <p id={hintId} role="alert" className="absolute -bottom-8 left-1 font-ui text-13 text-critical">
          {t.home.emptyBrief}
        </p>
      )}
    </div>
  );
}
