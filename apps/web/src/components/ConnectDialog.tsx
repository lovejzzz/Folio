import { createInference, type ProviderId } from '@folio/ai';
import { Button, Dialog } from '@folio/ui';
import { useState } from 'react';
import { useT } from '../i18n';
import { errorMessage } from '../state/model';
import { modelSettings, usePrefs } from '../state/prefs';
import { useUi } from '../state/ui';
import { ProviderChoice, ProviderFields, missingSetup } from './ProviderFields';
import { z } from 'zod';
import { settingsText } from '../i18n/settingsText';

const ProbeSchema = z.object({ ok: z.boolean() });

/** Ask the model for a one-field JSON answer: proves the key, model and schema path all work. */
export async function probeModel(provider: ProviderId): Promise<void> {
  const settings = modelSettings(usePrefs.getState(), provider);
  if (!settings) throw new Error('No provider');
  const inference = createInference(settings);
  const out = await inference.complete({
    task: 'folio_probe',
    system: 'Reply with JSON only.',
    prompt: 'Return {"ok": true}.',
    schema: ProbeSchema,
    maxTokens: 2000,
  });
  ProbeSchema.parse(out);
}

/** Check the chosen provider works, make it the one Folio uses, and carry on with what was waiting. */
function useConnect(provider: ProviderId, then: (() => void) | null, close: () => void) {
  const [state, setState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  const connect = async () => {
    const missing = missingSetup(provider);
    if (missing) return setState({ busy: false, error: missing });
    setState({ busy: true, error: null });
    try {
      // Folio credits need no test call: the sign-in is the setup, and a test would spend the teacher's credits.
      if (provider !== 'folio') await probeModel(provider);
      // An empty model field means "the default", so it is left empty rather than filled in here.
      usePrefs.getState().set({ provider });
      const run = then;
      close();
      setState({ busy: false, error: null });
      run?.();
    } catch (error) {
      setState({ busy: false, error: errorMessage(error, provider) });
    }
  };
  return { state, connect };
}

/** A three-step guided setup: choose a provider, paste a key, check it works. */
export function ConnectDialog() {
  const t = useT();
  const then = useUi((s) => s.connectThen);
  const close = useUi((s) => s.closeConnect);
  const [provider, setProvider] = useState<ProviderId>(() => usePrefs.getState().provider ?? 'folio');
  const { state, connect } = useConnect(provider, then, close);

  return (
    <Dialog isOpen={then !== null} onOpenChange={(open) => !open && close()} title={t.connect.title} size="md">
      <div className="px-6 pb-6">
        <p className="mt-1 font-ui text-14 leading-relaxed text-ink-2">{t.connect.lede}</p>
        <ol className="mt-5 space-y-5">
          <li>
            <StepLabel n={1}>{t.connect.step1}</StepLabel>
            <ProviderChoice value={provider} onChange={setProvider} compact />
          </li>
          <li>
            <StepLabel n={2}>{provider === 'local' ? t.connect.step2Local : provider === 'folio' ? t.connect.step2Folio : t.connect.step2}</StepLabel>
            <ProviderFields provider={provider} showModel={false} />
          </li>
          <li>
            <StepLabel n={3}>{t.connect.step3}</StepLabel>
            {state.error && (
              <p role="alert" className="mb-3 rounded-control bg-critical-tint px-3 py-2 font-ui text-13 text-critical">
                {state.error}
              </p>
            )}
            <Button variant="primary" size="lg" className="w-full" isDisabled={state.busy} onPress={() => void connect()}>
              {state.busy ? settingsText.testing : t.connect.connectAndContinue}
            </Button>
          </li>
        </ol>
        <button
          type="button"
          onClick={() => {
            close();
            useUi.getState().setSamplesOpen(true);
          }}
          className="mt-5 w-full rounded-control py-1 text-center font-ui text-13 text-ink-2 underline-offset-4 outline-none hover:text-ink hover:underline focus-visible:ring-2 focus-visible:ring-accent"
        >
          {t.connect.orSample}
        </button>
      </div>
    </Dialog>
  );
}

function StepLabel({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <p className="mb-2 flex items-center gap-2 font-ui text-13 font-medium text-ink">
      <span className="flex size-5 items-center justify-center rounded-full bg-well font-mono text-12 text-ink-2">{n}</span>
      {children}
    </p>
  );
}
