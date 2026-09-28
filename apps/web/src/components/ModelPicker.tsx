import { DEFAULT_MODELS, listModels, type ModelOption, type ProviderId } from '@folio/ai';
import { TextField, fieldClass, cx } from '@folio/ui';
import { ChevronDown } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { useT } from '../i18n';
import { usePrefs } from '../state/prefs';

type Listing = { state: 'waiting' } | { state: 'loading' } | { state: 'ready'; models: ModelOption[] } | { state: 'failed' };

/** One listing per provider and key, so switching back and forth doesn't ask again. */
const cache = new Map<string, Promise<ModelOption[]>>();

/** The models the teacher's key can use, fetched from the provider once there is a key (or a local address). */
function useModelList(provider: ProviderId): Listing {
  const apiKey = usePrefs((s) => (provider === 'local' ? '' : (s.keys[provider] ?? '')));
  const baseUrl = usePrefs((s) => (provider === 'local' ? s.localUrl.trim() : ''));
  const ready = provider === 'local' ? Boolean(baseUrl) : Boolean(apiKey);
  const key = `${provider}\n${apiKey}\n${baseUrl}`;
  // Each answer remembers which request it belongs to; anything older reads as still loading.
  const [answer, setAnswer] = useState<{ key: string; listing: Listing } | null>(null);
  useEffect(() => {
    if (!ready) return;
    let live = true;
    // Wait for typing to pause before asking, so a half-pasted key isn't sent.
    const timer = setTimeout(() => {
      let request = cache.get(key);
      if (!request) {
        request = listModels({ provider, apiKey, baseUrl });
        cache.set(key, request);
        request.catch(() => cache.delete(key));
      }
      request.then(
        (models) => live && setAnswer({ key, listing: models.length ? { state: 'ready', models } : { state: 'failed' } }),
        () => live && setAnswer({ key, listing: { state: 'failed' } }),
      );
    }, 400);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [provider, apiKey, baseUrl, ready, key]);
  if (!ready) return { state: 'waiting' };
  return answer?.key === key ? answer.listing : { state: 'loading' };
}

/** Choose a model from the provider's own list; an empty choice means Folio's default for that provider. */
export function ModelPicker({ provider }: { provider: ProviderId }) {
  const t = useT();
  const id = useId();
  const saved = usePrefs((s) => s.models[provider] ?? '');
  const set = usePrefs((s) => s.set);
  const listing = useModelList(provider);
  const fallback = DEFAULT_MODELS[provider];
  const save = (model: string) => set({ models: { ...usePrefs.getState().models, [provider]: model === fallback ? '' : model } });
  if (listing.state === 'failed') {
    return <TextField label={t.settings.model} description={t.settings.modelListFailed(fallback)} placeholder={fallback} value={saved} onChange={(v) => save(v.trim())} />;
  }
  const current = saved || fallback;
  const models = listing.state === 'ready' ? listing.models : [];
  const known = models.some((m) => m.id === current);
  const hint = listing.state === 'ready' ? t.settings.modelHint(fallback) : listing.state === 'loading' ? t.settings.modelLoading : t.settings.modelNeedsKey;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block font-ui text-13 font-medium text-ink">
        {t.settings.model}
      </label>
      <span className="relative block">
        <select id={id} value={current} disabled={listing.state !== 'ready'} onChange={(e) => save(e.target.value)} aria-describedby={`${id}-hint`} className={cx(fieldClass, 'h-9 appearance-none pr-8 disabled:opacity-60')}>
          {!known && <option value={current}>{current}</option>}
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.id === fallback ? t.settings.modelRecommended(m.label) : m.label}
            </option>
          ))}
        </select>
        <ChevronDown size={14} strokeWidth={1.75} className="pointer-events-none absolute right-3 top-2.5 text-ink-2" aria-hidden />
      </span>
      <p id={`${id}-hint`} className="mt-1.5 font-ui text-13 text-ink-2">
        {hint}
      </p>
    </div>
  );
}
