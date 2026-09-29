import { PROVIDERS, type ProviderId } from '@folio/ai';
import { Button, IconButton, TextField, cx } from '@folio/ui';
import { CircleHelp } from 'lucide-react';
import { useEffect } from 'react';
import { Radio, RadioGroup } from 'react-aria-components';
import { readHint, signIn, useAccount } from '../state/account';
import { creditsText, refreshCredits, useCredits } from '../state/credits';
import { useT, type Messages } from '../i18n';
import { usePrefs } from '../state/prefs';
import { ModelPicker } from './ModelPicker';

/** Where each provider makes and lists API keys: the "?" beside the key field goes straight there. */
const KEY_PAGES: Partial<Record<ProviderId, { url: string; company: string }>> = {
  anthropic: { url: 'https://platform.claude.com/settings/keys', company: 'Anthropic' },
  openai: { url: 'https://platform.openai.com/api-keys', company: 'OpenAI' },
  google: { url: 'https://aistudio.google.com/apikey', company: 'Google AI Studio' },
  deepseek: { url: 'https://platform.deepseek.com/api_keys', company: 'DeepSeek' },
};

/** A small "?" that opens the provider's key page in a new tab, and says so on hover or focus. */
function KeyHelp({ provider }: { provider: ProviderId }) {
  const t = useT();
  const page = KEY_PAGES[provider];
  if (!page) return null;
  return (
    <IconButton size="sm" label={t.settings.keyPage(page.company)} onPress={() => window.open(page.url, '_blank', 'noopener,noreferrer')} className="-my-1 size-6 rounded-full data-hovered:text-accent">
      <CircleHelp size={15} strokeWidth={1.75} />
    </IconButton>
  );
}

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
  return provider !== 'local' && provider !== 'folio' && Boolean(usePrefs.getState().keys[provider]?.trim());
}

/** What still has to be filled in before a provider can be tried, or null. */
export function missingSetup(provider: ProviderId, t: Messages): string | null {
  if (provider === 'folio') return readHint() ? null : creditsText.signInFirst;
  if (provider === 'local') return usePrefs.getState().localUrl.trim() ? null : t.settings.addressFirst;
  return hasKey(provider) ? null : t.settings.keyFirst;
}

/** Folio credits: no key, a Google sign-in; then the balance, and how far it goes. */
function FolioFields() {
  const user = useAccount((s) => s.user);
  const { balance, available } = useCredits();
  useEffect(() => {
    if (user) void refreshCredits();
  }, [user]);
  if (!user) {
    return (
      <div className="space-y-3">
        <p className="font-ui text-13 leading-relaxed text-ink-2">{creditsText.signInToStart}</p>
        <Button variant="primary" onPress={signIn}>
          {creditsText.signIn}
        </Button>
      </div>
    );
  }
  if (!available) return <p className="font-ui text-13 text-ink-2">{creditsText.unavailable}</p>;
  return (
    <div className="space-y-2">
      <p className="font-ui text-14 font-medium text-ink">{balance === null ? '…' : creditsText.youHave(balance)}</p>
      <p className="font-ui text-13 leading-relaxed text-ink-2">{creditsText.how}</p>
      <p className="font-ui text-13 text-ink-2">{creditsText.buySoon}</p>
    </div>
  );
}

/** The key (or server address) and model for one provider, saved as you type. */
export function ProviderFields({ provider, showModel = true, onKey }: { provider: ProviderId; showModel?: boolean; onKey?: (key: string) => void }) {
  const t = useT();
  const { keys, localUrl, set } = usePrefs();
  if (provider === 'folio') return <FolioFields />;
  return (
    <div className="space-y-3">
      {provider === 'local' ? (
        <TextField label={t.settings.baseUrl} description={t.settings.baseUrlHint} value={localUrl} onChange={(v) => set({ localUrl: v })} />
      ) : (
        <div>
          <TextField
            label={
              <span className="inline-flex items-center gap-1">
                {t.settings.key}
                <KeyHelp provider={provider} />
              </span>
            }
            type="password"
            autoComplete="off"
            description={t.settings.keyHint}
            value={keys[provider] ?? ''}
            onChange={(v) => {
              set({ keys: { ...usePrefs.getState().keys, [provider]: v.trim() } });
              onKey?.(v.trim());
            }}
          />
        </div>
      )}
      {(showModel || provider === 'local') && <ModelPicker provider={provider} />}
    </div>
  );
}

