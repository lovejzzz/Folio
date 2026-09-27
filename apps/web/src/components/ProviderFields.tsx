import { DEFAULT_MODELS, PROVIDERS, type ProviderId } from '@folio/ai';
import { TextField, cx } from '@folio/ui';
import { ExternalLink } from 'lucide-react';
import { Radio, RadioGroup } from 'react-aria-components';
import { useT, type Messages } from '../i18n';
import { usePrefs } from '../state/prefs';


const KEY_PAGES: Partial<Record<ProviderId, string>> = {
  anthropic: 'https://console.anthropic.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys',
  google: 'https://aistudio.google.com/apikey',
  deepseek: 'https://platform.deepseek.com/api_keys',
};

/** Plain choices, each with a one-line cost and privacy note. */
export function ProviderChoice({ value, onChange, compact }: { value: ProviderId; onChange: (p: ProviderId) => void; compact?: boolean }) {
  const t = useT();
  return (
    <RadioGroup value={value} onChange={(v) => onChange(v as ProviderId)} aria-label={t.connect.step1} className={cx('grid gap-2', !compact && 'sm:grid-cols-2')}>
      {PROVIDERS.map((p) => (
        <Radio
          key={p}
          value={p}
          className={cx(
            'group flex cursor-default gap-3 rounded-sheet border sm:last:odd:col-span-2 border-rule bg-paper p-3 outline-none transition-colors duration-120',
            'data-hovered:border-field data-selected:border-accent data-selected:bg-accent-tint data-focus-visible:ring-2 data-focus-visible:ring-accent',
          )}
        >
          <span aria-hidden className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border border-field bg-paper group-data-selected:border-accent">
            <span className="size-2 rounded-full bg-accent opacity-0 group-data-selected:opacity-100" />
          </span>
          <span className="min-w-0">
            <span className="block font-ui text-14 font-medium text-ink">{t.settings.providers[p].name}</span>
            {!compact && <span className="mt-0.5 block font-ui text-13 leading-snug text-ink-2">{t.settings.providers[p].note}</span>}
          </span>
        </Radio>
      ))}
    </RadioGroup>
  );
}

/** A cloud provider is ready to use once it has a key; a local server once a connection test passes. */
export function hasKey(provider: ProviderId): boolean {
  return provider !== 'local' && Boolean(usePrefs.getState().keys[provider]?.trim());
}

/** What still has to be filled in before a provider can be tried, or null. */
export function missingSetup(provider: ProviderId, t: Messages): string | null {
  if (provider === 'local') return usePrefs.getState().localUrl.trim() ? null : t.settings.addressFirst;
  return hasKey(provider) ? null : t.settings.keyFirst;
}

/** The key (or server address) and model for one provider, saved as you type. */
export function ProviderFields({ provider, showModel = true, onKey }: { provider: ProviderId; showModel?: boolean; onKey?: (key: string) => void }) {
  const t = useT();
  const { keys, models, localUrl, set } = usePrefs();
  const keyPage = KEY_PAGES[provider];
  return (
    <div className="space-y-3">
      {provider === 'local' ? (
        <TextField label={t.settings.baseUrl} description={t.settings.baseUrlHint} value={localUrl} onChange={(v) => set({ localUrl: v })} />
      ) : (
        <div>
          <TextField
            label={t.settings.key}
            type="password"
            autoComplete="off"
            description={t.settings.keyHint}
            value={keys[provider] ?? ''}
            onChange={(v) => {
              set({ keys: { ...usePrefs.getState().keys, [provider]: v.trim() } });
              onKey?.(v.trim());
            }}
          />
          {keyPage && (
            <a
              href={keyPage}
              target="_blank"
              rel="noreferrer"
              className="mt-1.5 inline-flex items-center gap-1 font-ui text-13 text-accent underline-offset-4 hover:underline"
            >
              {t.settings.getKey}
              <ExternalLink size={12} strokeWidth={1.75} aria-hidden />
            </a>
          )}
        </div>
      )}
      {(showModel || provider === 'local') && (
        <TextField
          label={t.settings.model}
          description={t.settings.modelHint(DEFAULT_MODELS[provider])}
          placeholder={DEFAULT_MODELS[provider]}
          value={models[provider] ?? ''}
          onChange={(v) => set({ models: { ...usePrefs.getState().models, [provider]: v.trim() } })}
        />
      )}
    </div>
  );
}

