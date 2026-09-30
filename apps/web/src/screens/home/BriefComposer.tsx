import { Button, IconButton, cx } from '@folio/ui';
import { useNavigate } from '@tanstack/react-router';
import { ArrowRight, FileText, Paperclip, X } from 'lucide-react';
import { lazy, Suspense, useId, useRef, useState, type DragEvent } from 'react';
import { useT } from '../../i18n';
import { setBrief, setFiles, useDraft } from '../../state/draft';
import { hasModel } from '../../state/prefs';
import { toast } from '../../state/toasts';
import { useUi } from '../../state/ui';
import { LessonsChip, LevelChip } from './Chips';
import { asksForSources } from './sourceHint';

/** Only for a teacher writing with Folio credits: loaded apart so the first page stays small. */
const CreditsLeft = lazy(() => import('./CreditsLeft').then((m) => ({ default: m.CreditsLeft })));

function useAttach() {
  return async (files: FileList | File[]) => {
    // Copy first: an input's FileList is emptied when it is reset, and a drop's
    // DataTransfer once the event ends, both before the import below resolves.
    const list = Array.from(files);
    const { FileReadError, readSourceFile, refusalMessage, refusedMessage } = await import('../../lib/readFile');
    const refused: { name: string; reason: 'size' | 'type' | 'empty' }[] = [];
    for (const file of list) {
      try {
        const source = await readSourceFile(file);
        setFiles([...useDraft.getState().files, source]);
      } catch (error) {
        refused.push({ name: file.name, reason: error instanceof FileReadError ? error.reason : 'type' });
      }
    }
    // One message for the whole drop, however many files were refused.
    const [only] = refused;
    if (refused.length === 1 && only) toast({ message: refusalMessage(only.name, only.reason), tone: 'attention' });
    else if (refused.length > 1) toast({ message: refusedMessage(refused.map((r) => r.name)), tone: 'attention' });
  };
}

function AttachedFiles() {
  const t = useT();
  const files = useDraft((s) => s.files);
  if (!files.length) return null;
  return (
    <ul className="flex flex-wrap gap-2 px-5 pb-3 md:px-7" aria-label={t.home.attached(files.length)}>
      {files.map((f, i) => (
        <li key={`${f.title}-${i}`} className="flex h-7 items-center gap-1.5 rounded-full bg-well pl-2.5 pr-1 font-ui text-13 text-ink">
          <FileText size={14} strokeWidth={1.5} className="text-ink-2" aria-hidden />
          <span className="max-w-48 truncate">{f.title}</span>
          <IconButton size="sm" tooltip={false} label={`${t.common.remove} ${f.title}`} onPress={() => setFiles(files.filter((_, j) => j !== i))} className="size-5">
            <X size={12} strokeWidth={1.75} />
          </IconButton>
        </li>
      ))}
    </ul>
  );
}

function ComposerBar({ onPick, onGo }: { onPick: () => void; onGo: () => void }) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-rule px-3 py-3 md:px-5">
      <LevelChip />
      <LessonsChip />
      <IconButton label={t.home.attach} onPress={onPick}>
        <Paperclip size={17} strokeWidth={1.5} />
      </IconButton>
      <div className="ml-auto flex items-center gap-4">
        <Suspense fallback={null}>
          <CreditsLeft />
        </Suspense>
        <Button variant="primary" size="lg" className="h-10 pl-5 pr-4" onPress={onGo}>
          {t.home.continue}
          <ArrowRight size={17} strokeWidth={1.75} aria-hidden />
        </Button>
      </div>
    </div>
  );
}

/** Files dropped anywhere on the composer are attached; it lights up while they hover. */
function useDropZone(onFiles: (files: FileList) => void) {
  const [dragging, setDragging] = useState(false);
  const zone = {
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      setDragging(true);
    },
    onDragLeave: () => setDragging(false),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
    },
  };
  return { dragging, zone };
}

/** One hidden file input, opened from the paperclip and from the sources hint. */
function useFilePicker(onFiles: (files: FileList) => void) {
  const ref = useRef<HTMLInputElement>(null);
  const input = (
    <input
      ref={ref}
      type="file"
      multiple
      accept=".pdf,.docx,.txt,.md,.markdown,application/pdf,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      className="hidden"
      onChange={(e) => {
        if (e.target.files) onFiles(e.target.files);
        e.target.value = '';
      }}
    />
  );
  return { input, pick: () => ref.current?.click() };
}

/** Source work without the sources: the model could only name extracts, so the composer asks for them. */
function SourcesHint({ onPick }: { onPick: () => void }) {
  const t = useT();
  const brief = useDraft((s) => s.brief);
  const files = useDraft((s) => s.files);
  if (files.length || !asksForSources(brief)) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 px-5 pb-3 font-ui text-13 leading-5 text-ink-2 animate-fade-in md:px-7">
      <Paperclip size={14} strokeWidth={1.5} aria-hidden className="shrink-0 text-ink-3" />
      <span>{t.home.sourcesHint}</span>
      <button type="button" onClick={onPick} className="rounded-control font-medium text-accent outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent">
        {t.home.attachSources}
      </button>
    </p>
  );
}

/** One large box: "What do you want to teach?", with three quiet chips and files dropped on it. */
export function BriefComposer() {
  const t = useT();
  const navigate = useNavigate();
  const brief = useDraft((s) => s.brief);
  const attach = useAttach();
  const [error, setError] = useState(false);
  const hintId = useId();
  const picker = useFilePicker((files) => void attach(files));
  const go = () => {
    const { brief: text, files } = useDraft.getState();
    if (!text.trim() && files.length === 0) return setError(true);
    const start = () => void navigate({ to: '/new' });
    if (hasModel()) start();
    else useUi.getState().requireModel(start);
  };
  const { dragging, zone } = useDropZone((files) => void attach(files));
  return (
    <div
      {...zone}
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
      <SourcesHint onPick={picker.pick} />
      <ComposerBar onPick={picker.pick} onGo={go} />
      {picker.input}
      {error && (
        <p id={hintId} role="alert" className="absolute -bottom-8 left-1 font-ui text-13 text-critical">
          {t.home.emptyBrief}
        </p>
      )}
    </div>
  );
}
