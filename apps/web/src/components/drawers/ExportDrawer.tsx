import { enabledKinds, orderedLessons, project, type Course, type MaterialKind } from '@folio/core';
import { Button, Checkbox, SegmentedControl, cx, fieldClass } from '@folio/ui';
import { EyeOff, FileArchive, FileSpreadsheet, FileText, FolderDown, Presentation, Printer, UploadCloud } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useParams } from '@tanstack/react-router';
import { Radio, RadioGroup } from 'react-aria-components';
import { router } from '../../app/router';
import { useT } from '../../i18n';
import { download, makeExport } from '../../lib/exporter';
import { exportErrorMessage } from '../../lib/exportErrors';
import { GOOGLE_RETURN_PATH } from '../../lib/googlePath';
import { flushNow, useCourse } from '../../state/session';
import { toast } from '../../state/toasts';
import { DocView } from '../DocView';
import { FORMATS, effectiveChoice, googleClientId, initialChoice, kindsFor, lessonIdsFor, type ExportChoice, type FormatChoice } from './exportOptions';
import { exportText } from '../../i18n/exportText';

const ICONS: Record<FormatChoice, ReactNode> = {
  docx: <FileText size={18} strokeWidth={1.5} />,
  pdf: <Printer size={18} strokeWidth={1.5} />,
  pptx: <Presentation size={18} strokeWidth={1.5} />,
  xlsx: <FileSpreadsheet size={18} strokeWidth={1.5} />,
  csv: <FileSpreadsheet size={18} strokeWidth={1.5} />,
  qti: <FileArchive size={18} strokeWidth={1.5} />,
  zip: <FileArchive size={18} strokeWidth={1.5} />,
  folio: <FolderDown size={18} strokeWidth={1.5} />,
  google: <UploadCloud size={18} strokeWidth={1.5} />,
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="font-ui text-13 font-semibold text-ink">{label}</p>
      {children}
    </div>
  );
}

function FormatPicker({ value, onChange }: { value: FormatChoice; onChange: (f: FormatChoice) => void }) {
  const formats = FORMATS.filter((f) => f !== 'google' || googleClientId());
  return (
    <RadioGroup aria-label={exportText.format} value={value} onChange={(v) => onChange(v as FormatChoice)} className="space-y-1">
      {formats.map((f) => (
        <Radio
          key={f}
          value={f}
          className="group flex cursor-default items-start gap-3 rounded-control px-3 py-2 outline-none data-hovered:bg-well data-selected:bg-accent-tint data-focus-visible:ring-2 data-focus-visible:ring-accent"
        >
          <span className="mt-0.5 text-ink-2 group-data-selected:text-accent" aria-hidden>
            {ICONS[f]}
          </span>
          <span>
            <span className="block font-ui text-14 font-medium text-ink">{exportText.formats[f as keyof typeof exportText.formats]}</span>
            <span className="block font-ui text-12 leading-4 text-ink-2">{exportText.formatHints[f as keyof typeof exportText.formatHints]}</span>
          </span>
        </Radio>
      ))}
    </RadioGroup>
  );
}

function Preview({ choice }: { choice: ExportChoice }) {
  const course = useCourse();
  const kinds = kindsFor(course, choice);
  const first = kinds[0];
  if (!first || choice.format === 'folio') return null;
  const lessonIds = lessonIdsFor(choice);
  const doc = project(course, first, { audience: choice.audience, ...(lessonIds ? { lessonIds } : {}) });
  return (
    <div aria-hidden className="relative h-56 overflow-hidden rounded-control bg-paper shadow-sheet">
      <div className="pointer-events-none absolute left-0 top-0 origin-top-left p-12" style={{ width: '250%', transform: 'scale(0.4)' }}>
        <DocView doc={doc} courseId={course.id} />
      </div>
      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-paper to-transparent" />
    </div>
  );
}

async function runExport(choice: ExportChoice, course: Course): Promise<void> {
  const kinds = kindsFor(course, choice);
  const lessonIds = lessonIdsFor(choice);
  const search = { kinds, audience: choice.audience, ...(lessonIds ? { lessons: lessonIds } : {}) };
  // Both open a tab of their own, which reads the course from this browser's storage: it must be saved first.
  if (choice.format === 'pdf' || choice.format === 'google') {
    await flushNow();
    const { href } =
      choice.format === 'pdf'
        ? router.buildLocation({ to: '/print/$courseId', params: { courseId: course.id }, search })
        : router.buildLocation({ to: GOOGLE_RETURN_PATH, search: { course: course.id, ...search } });
    window.open(href, '_blank', 'noopener');
    return;
  }
  const file = await makeExport({ course, kinds, audience: choice.audience, format: choice.format, ...(lessonIds ? { lessonIds } : {}) });
  download(file);
  toast({ message: exportText.done(file.name), duration: 4000 });
}

function WhatField({ choice, set }: { choice: ExportChoice; set: (patch: Partial<ExportChoice>) => void }) {
  const t = useT();
  const course = useCourse();
  return (
    <Field label={exportText.what}>
      <SegmentedControl label={exportText.what} value={choice.scope} onChange={(scope) => set({ scope })} className="w-full" options={[{ id: 'whole', label: exportText.whole }, { id: 'lesson', label: exportText.oneLesson }, { id: 'selected', label: exportText.selected }]} />
      {choice.scope === 'lesson' && (
        <select aria-label={exportText.lessonPick} value={choice.lessonId} onChange={(e) => set({ lessonId: e.target.value })} className={cx(fieldClass, 'h-9')}>
          {orderedLessons(course).map((l, i) => (
            <option key={l.id} value={l.id}>
              {t.common.lesson(i + 1)} · {l.title}
            </option>
          ))}
        </select>
      )}
      {choice.scope === 'selected' && <KindPicker choice={choice} set={set} />}
    </Field>
  );
}

/** Which materials to export. Picking two of ten meant unticking eight, so the list can be cleared in one go. */
function KindPicker({ choice, set }: { choice: ExportChoice; set: (patch: Partial<ExportChoice>) => void }) {
  const t = useT();
  const kinds = enabledKinds(useCourse());
  const all = kinds.every((k) => choice.kinds.includes(k));
  return (
    <div className="pt-1">
      <button type="button" onClick={() => set({ kinds: all ? [] : kinds })} className="mb-2 rounded-control font-ui text-13 font-medium text-accent outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent">
        {all ? exportText.clearAll : exportText.selectAll}
      </button>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        {kinds.map((k: MaterialKind) => (
          <Checkbox key={k} isSelected={choice.kinds.includes(k)} onChange={(on) => set({ kinds: on ? [...choice.kinds, k] : choice.kinds.filter((x) => x !== k) })}>
            {t.materials[k]}
          </Checkbox>
        ))}
      </div>
    </div>
  );
}

/** Export: what, for whom, in which format. Sensible defaults make it one click. */
export function ExportDrawer() {
  const course = useCourse();
  const lessons = orderedLessons(course);
  const { lessonId } = useParams({ strict: false });
  const [choice, setChoice] = useState<ExportChoice>(() => initialChoice(course, lessonId));
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<ExportChoice>) => setChoice({ ...choice, ...patch });
  const kinds = kindsFor(course, effectiveChoice(choice));
  const backup = choice.format === 'folio';
  const run = () => {
    setBusy(true);
    runExport(effectiveChoice(choice), course)
      .catch((error: unknown) => toast({ message: exportErrorMessage(error), tone: 'critical' }))
      .finally(() => setBusy(false));
  };
  const noSlides = choice.format === 'pptx' && !lessons.some((l) => (choice.scope !== 'lesson' || l.id === choice.lessonId) && l.slides.length);
  const cta = choice.format === 'pdf' ? exportText.print : choice.format === 'google' ? exportText.uploadGoogle : choice.format === 'folio' ? exportText.downloadBackup : exportText.download(exportText.formats[choice.format as keyof typeof exportText.formats]);
  return (
    <>
      <div className="space-y-6 p-5">
        {backup ? (
          <p className="flex gap-2.5 rounded-control bg-well px-4 py-3 font-ui text-13 leading-relaxed text-ink-2">
            <EyeOff size={15} strokeWidth={1.5} className="mt-0.5 shrink-0" aria-hidden />
            {exportText.folioNote}
          </p>
        ) : (
          <>
            <WhatField choice={choice} set={set} />
            <Field label={exportText.who}>
              <SegmentedControl label={exportText.who} value={choice.audience} onChange={(audience) => set({ audience })} className="w-full" options={[{ id: 'student', label: exportText.student }, { id: 'teacher', label: exportText.teacher }]} />
              {/* Says what's in the copy, and warns plainly when it holds the answers. */}
              <p className={cx('font-ui text-12', choice.audience === 'teacher' ? 'font-medium text-attention' : 'text-ink-2')}>
                {choice.audience === 'teacher' ? exportText.teacherHint : exportText.studentHint}
              </p>
            </Field>
          </>
        )}
        <Field label={exportText.format}>
          <FormatPicker value={choice.format} onChange={(format) => set({ format })} />
        </Field>
        <Field label={exportText.preview}>
          <Preview choice={choice} />
        </Field>
      </div>
      {/* The action stays in view while the choices above scroll; the preview pushed it off a laptop screen. */}
      <div className="sticky bottom-0 space-y-2 border-t border-rule bg-paper p-4">
        {noSlides && <p className="font-ui text-13 text-attention">{exportText.noSlides}</p>}
        <Button variant="primary" size="lg" className="w-full" isDisabled={busy || kinds.length === 0 || noSlides} onPress={run}>
          {busy ? exportText.working : cta}
        </Button>
      </div>
    </>
  );
}
