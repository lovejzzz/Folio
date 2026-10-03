import { Dialog } from '@folio/ui';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useT } from '../i18n';
import { openSample } from '../lib/sample';
import { SAMPLES, SAMPLE_NAMES, STAGES, type SampleName } from '../lib/samples';
import { useUi } from '../state/ui';

/** The sample courses under their stages, as large choices: many teachers will read this on a phone. */
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
    <Dialog isOpen onOpenChange={(isOpen) => !isOpen && close()} title={t.samples.title} size="lg">
      <div className="px-6 pb-6">
        <p className="mt-1 font-ui text-14 leading-relaxed text-ink-2">{t.samples.lede}</p>
        {failed && (
          <p role="alert" className="mt-4 rounded-control bg-critical-tint px-3 py-2 font-ui text-13 text-critical">
            {t.samples.failed}
          </p>
        )}
        {STAGES.map((stage) => (
          <section key={stage} className="mt-5">
            <h3 className="font-ui text-12 font-medium uppercase tracking-wide text-ink-2">{t.samples.stages[stage]}</h3>
            <ul className="mt-2 grid gap-3 sm:grid-cols-2">
              {SAMPLE_NAMES.filter((name) => SAMPLES[name].stage === stage).map((name) => (
                <li key={name}>
                  <button
                    type="button"
                    disabled={opening !== null}
                    onClick={() => void open(name)}
                    className="flex h-full w-full flex-col items-start justify-start rounded-control border border-rule px-4 py-3 text-left outline-none transition-colors duration-120 hover:border-field hover:bg-well focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60"
                  >
                    <span className="block font-reading text-17 text-ink">{SAMPLES[name].title}</span>
                    <span className="mt-0.5 block font-ui text-13 text-ink-2">{opening === name ? t.samples.opening : SAMPLES[name].detail}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Dialog>
  );
}
