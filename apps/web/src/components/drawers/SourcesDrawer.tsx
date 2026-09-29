import { Sep } from '../Sep';
import { cmd, createSource, type Course } from '@folio/core';
import { Button, IconButton, TextArea, TextField } from '@folio/ui';
import { FileText, Paperclip, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { useT } from '../../i18n';
import { FileReadError, readSourceFile, refusalMessage } from '../../lib/readFile';
import { edit } from '../../state/edit';
import { useCourse } from '../../state/session';
import { toast } from '../../state/toasts';

function citations(course: Course, sourceId: string): number {
  return Object.values(course.tasks).filter((task) => task.sourceRefs.some((r) => r.sourceId === sourceId)).length;
}

function AddSource() {
  const t = useT();
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const add = (name: string, body: string) => {
    if (!body.trim()) return;
    edit([cmd('source.add', { source: createSource(name.trim() || body.trim().slice(0, 40), body) })], { key: 'addedSource' });
    setTitle('');
    setText('');
  };
  return (
    <section className="space-y-3 border-t border-rule px-5 py-5">
      <h3 className="font-ui text-13 font-semibold text-ink">{t.sources.add}</h3>
      <TextField label={t.sources.titleLabel} value={title} onChange={setTitle} />
      <TextArea label={t.sources.pasteLabel} value={text} onChange={setText} rows={6} />
      <div className="flex items-center justify-between gap-2">
        <Button variant="quiet" onPress={() => file.current?.click()}>
          <Paperclip size={15} strokeWidth={1.5} aria-hidden />
          {t.sources.upload}
        </Button>
        <input
          ref={file}
          type="file"
          accept=".pdf,.docx,.txt,.md,.markdown"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try {
              const s = await readSourceFile(f);
              add(s.title, s.text);
            } catch (error) {
              toast({ message: refusalMessage(f.name, error instanceof FileReadError ? error.reason : 'type'), tone: 'attention' });
            }
          }}
        />
        <Button variant="primary" isDisabled={!text.trim()} onPress={() => add(title, text)}>
          {t.sources.addButton}
        </Button>
      </div>
    </section>
  );
}

/** Notes, readings and syllabi the course draws on; questions cite their passages. */
export function SourcesDrawer() {
  const t = useT();
  const course = useCourse();
  const sources = course.sourceOrder.map((id) => course.sources[id]).filter((s) => s !== undefined);
  return (
    <div>
      <p className="px-5 pt-5 font-ui text-13 leading-5 text-ink-2">{t.sources.lede}</p>
      <ul className="space-y-2 px-5 py-4">
        {sources.length === 0 && <li className="font-ui text-13 text-ink-2">{t.sources.empty}</li>}
        {sources.map((s) => (
          <li key={s.id} className="group flex items-start gap-3 rounded-control bg-well p-3">
            <FileText size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-ink-2" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate font-ui text-14 font-medium text-ink">{s.title}</p>
              <p className="font-ui text-12 text-ink-2">
                {t.sources.passages(s.passages.length)}
                <Sep />
                {t.sources.cited(citations(course, s.id))}
              </p>
              <p className="mt-1.5 line-clamp-3 font-reading text-14 leading-5 text-ink-2">{s.text}</p>
            </div>
            <IconButton size="sm" label={t.common.labelled(t.sources.remove, s.title)} onPress={() => edit([cmd('source.remove', { sourceId: s.id })], { key: 'removedSource' })}>
              <Trash2 size={14} strokeWidth={1.5} />
            </IconButton>
          </li>
        ))}
      </ul>
      <AddSource />
    </div>
  );
}
