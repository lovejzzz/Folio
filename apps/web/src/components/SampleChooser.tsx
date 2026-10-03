import { Dialog } from '@folio/ui';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useT } from '../i18n';
import { openSample } from '../lib/sample';
import { SAMPLES, SAMPLE_NAMES, type SampleName } from '../lib/samples';
import { useUi } from '../state/ui';

/** The sample courses, one for each stage, as large choices: many teachers will read this on a phone. */
export function SampleChooser() {
  const t = useT();
  const navigate = useNavigate();
  const close = () => useUi.getState().setSamplesOpen(false);
  const [opening, setOpening] = useState<SampleName | null>(null);
  const [failed, setFailed] = useState(false);
  const open = async (name: SampleName) => {
    setOpening(name);
    setFailed(false);
    try {
      await openSample(navigate, name);
      close();
    } catch {
      setFailed(true);
      setOpening(null);
    }
  };
  return (
    <Dialog isOpen onOpenChange={(isOpen) => !isOpen && close()} title={t.samples.title} size="md">
      <div className="px-6 pb-6">
        <p className="mt-1 font-ui text-14 leading-relaxed text-ink-2">{t.samples.lede}</p>
        {failed && (
          <p role="alert" className="mt-4 rounded-control bg-critical-tint px-3 py-2 font-ui text-13 text-critical">
            {t.samples.failed}
          </p>
        )}
        <ul className="mt-5 space-y-3">
          {SAMPLE_NAMES.map((name) => (
            <li key={name}>
              <button
                type="button"
                disabled={opening !== null}
                onClick={() => void open(name)}
                className="block w-full rounded-control border border-rule px-4 py-3 text-left outline-none transition-colors duration-120 hover:border-field hover:bg-well focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60"
              >
                <span className="block font-reading text-18 text-ink">{t.samples[name]}</span>
                <span className="mt-0.5 block font-ui text-14 text-ink-2">{opening === name ? t.samples.opening : SAMPLES[name]}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Dialog>
  );
}
