import { enabledKinds, orderedLessons, project, type Course, type MaterialKind } from '@folio/core';
import { Button, Checkbox, SegmentedControl, cx, fieldClass } from '@folio/ui';
import { EyeOff, FileArchive, FileSpreadsheet, FileText, FolderDown, Presentation, Printer, UploadCloud } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useParams } from '@tanstack/react-router';
import { Radio, RadioGroup } from 'react-aria-components';
import { router } from '../../app/router';
import { useT, type Messages } from '../../i18n';
import { download, makeExport } from '../../lib/exporter';
import { exportErrorMessage } from '../../lib/exportErrors';
import { uploadToGoogleDocs } from '../../lib/google';
import { flushNow, useCourse } from '../../state/session';
import { toast } from '../../state/toasts';
import { DocView } from '../DocView';
import { FORMATS, effectiveChoice, googleClientId, initialChoice, kindsFor, lessonIdsFor, type ExportChoice, type FormatChoice } from './exportOptions';

const ICONS: Record<FormatChoice, ReactNode> = {
  docx: <FileText size={18} strokeWidth={1.5} />,
  pdf: <Printer size={18} strokeWidth={1.5} />,
  pptx: <Presentation size={18} strokeWidth={1.5} />,
  xlsx: <FileSpreadsheet size={18} strokeWidth={1.5} />,
  csv: <FileSpreadsheet size={18} strokeWidth={1.5} />,
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
  const t = useT();
  const formats = FORMATS.filter((f) => f !== 'google' || googleClientId());
  return (
    <RadioGroup aria-label={t.export.format} value={value} onChange={(v) => onChange(v as FormatChoice)} className="space-y-1">
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
            <span className="block font-ui text-14 font-medium text-ink">{t.export.formats[f as keyof typeof t.export.formats]}</span>
            <span className="block font-ui text-12 leading-4 text-ink-2">{t.export.formatHints[f as keyof typeof t.export.formatHints]}</span>
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
        <DocView doc={doc} />
      </div>
      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-paper to-transparent" />
    </div>
  );
}

async function runExport(choice: ExportChoice, course: Course, t: Messages): Promise<void> {
  const kinds = kindsFor(course, choice);
  const lessonIds = lessonIdsFor(choice);
  if (choice.format === 'pdf') {
    await flushNow();
    const { href } = router.buildLocation({
      to: '/print/$courseId',
      params: { courseId: course.id },
      search: { kinds, audience: choice.audience, ...(lessonIds ? { lessons: lessonIds } : {}) },
    });
    window.open(href, '_blank', 'noopener');
    return;
  }
  const format = choice.format === 'google' ? 'docx' : choice.format;
  const file = await makeExport({ course, kinds, audience: choice.audience, format, ...(lessonIds ? { lessonIds } : {}) });
  if (choice.format === 'google') {
    const link = await uploadToGoogleDocs(googleClientId(), file.name, file.bytes);
    toast({ message: t.export.uploaded, action: { label: t.export.openInDrive, run: () => window.open(link, '_blank', 'noopener') } });
  } else {
    download(file);
    toast({ message: t.export.done(file.name), duration: 4000 });
  }
}

function WhatField({ choice, set }: { choice: ExportChoice; set: (patch: Partial<ExportChoice>) => void }) {
  const t = useT();
  const course = useCourse();
  return (
    <Field label={t.export.what}>
      <SegmentedControl label={t.export.what} value={choice.scope} onChange={(scope) => set({ scope })} className="w-full" options={[{ id: 'whole', label: t.export.whole }, { id: 'lesson', label: t.export.oneLesson }, { id: 'selected', label: t.export.selected }]} />
      {choice.scope === 'lesson' && (
        <select aria-label={t.export.lessonPick} value={choice.lessonId} onChange={(e) => set({ lessonId: e.target.value })} className={cx(fieldClass, 'h-9')}>
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
        {all ? t.export.clearAll : t.export.selectAll}
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
  const t = useT();
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
    runExport(effectiveChoice(choice), course, t)
      .catch((error: unknown) => toast({ message: exportErrorMessage(error, t), tone: 'critical' }))
      .finally(() => setBusy(false));
  };
  const noSlides = choice.format === 'pptx' && !lessons.some((l) => (choice.scope !== 'lesson' || l.id === choice.lessonId) && l.slides.length);
  const cta = choice.format === 'pdf' ? t.export.print : choice.format === 'google' ? t.export.uploadGoogle : t.export.download(t.export.formats[choice.format as keyof typeof t.export.formats]);
  return (
    <>
      <div className="space-y-6 p-5">
        {backup ? (
          <p className="flex gap-2.5 rounded-control bg-well px-4 py-3 font-ui text-13 leading-relaxed text-ink-2">
            <EyeOff size={15} strokeWidth={1.5} className="mt-0.5 shrink-0" aria-hidden />
            {t.export.folioNote}
          </p>
        ) : (
          <>
            <WhatField choice={choice} set={set} />
            <Field label={t.export.who}>
              <SegmentedControl label={t.export.who} value={choice.audience} onChange={(audience) => set({ audience })} className="w-full" options={[{ id: 'student', label: t.export.student }, { id: 'teacher', label: t.export.teacher }]} />
              {choice.audience === 'teacher' && <p className="font-ui text-12 text-ink-2">{t.export.teacherHint}</p>}
            </Field>
          </>
        )}
        <Field label={t.export.format}>
          <FormatPicker value={choice.format} onChange={(format) => set({ format })} />
        </Field>
        <Field label={t.export.preview}>
          <Preview choice={choice} />
        </Field>
      </div>
      {/* The action stays in view while the choices above scroll; the preview pushed it off a laptop screen. */}
      <div className="sticky bottom-0 space-y-2 border-t border-rule bg-paper p-4">
        {noSlides && <p className="font-ui text-13 text-attention">{t.export.noSlides}</p>}
        <Button variant="primary" size="lg" className="w-full" isDisabled={busy || kinds.length === 0 || noSlides} onPress={run}>
          {busy ? t.export.working : cta}
        </Button>
      </div>
    </>
  );
}
