import type { ModelSettings } from './inference';

/** One model a provider offers, as its API names it. */
export interface ModelOption {
  id: string;
  label: string;
}

type Lister = (settings: Pick<ModelSettings, 'apiKey' | 'baseUrl'>, fetchImpl: typeof fetch) => Promise<ModelOption[]>;

async function getJson(fetchImpl: typeof fetch, url: string, headers: Record<string, string>): Promise<unknown> {
  const response = await fetchImpl(url, { headers });
  if (!response.ok) throw new Error(`Listing models failed (${response.status}).`);
  return response.json();
}

interface ListedModel {
  id?: string;
  name?: string;
  display_name?: string;
  displayName?: string;
  created?: number;
  supportedGenerationMethods?: string[];
}

const rows = (body: unknown, key: 'data' | 'models'): ListedModel[] => {
  const list = (body as Record<string, unknown> | null)?.[key];
  return Array.isArray(list) ? (list as ListedModel[]) : [];
};

/** Chat models only: OpenAI also lists embeddings, speech, image and realtime models. */
const OPENAI_CHAT = /^(gpt-|o\d|chatgpt-)/;
const OPENAI_OTHER = /(audio|realtime|tts|transcribe|image|search|embedding|instruct|moderation|dall-e|whisper|codex)/;

/** Gemini models that write text; the list also has embedding, speech and image models. */
const GEMINI_OTHER = /(embedding|tts|image|live|aqa|veo|imagen)/;

/** Gemini lists by name; a higher version number is the newer model. */
const newestName = (a: ModelOption, b: ModelOption): number => b.id.localeCompare(a.id, 'en', { numeric: true });

const listers: Record<ModelSettings['provider'], Lister> = {
  // Anthropic lists newest first.
  anthropic: async ({ apiKey }, f) =>
    rows(
      await getJson(f, 'https://api.anthropic.com/v1/models?limit=100', {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      }),
      'data',
    ).flatMap((m) => (m.id ? [{ id: m.id, label: m.display_name || m.id }] : [])),
  openai: async ({ apiKey }, f) =>
    rows(await getJson(f, 'https://api.openai.com/v1/models', { authorization: `Bearer ${apiKey}` }), 'data')
      .filter((m) => m.id && OPENAI_CHAT.test(m.id) && !OPENAI_OTHER.test(m.id))
      .sort((a, b) => (b.created ?? 0) - (a.created ?? 0))
      .map((m) => ({ id: m.id!, label: m.id! })),
  google: async ({ apiKey }, f) =>
    rows(await getJson(f, 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', { 'x-goog-api-key': apiKey }), 'models')
      .filter((m) => m.name?.startsWith('models/gemini') && m.supportedGenerationMethods?.includes('generateContent') && !GEMINI_OTHER.test(m.name!))
      .map((m) => ({ id: m.name!.replace(/^models\//, ''), label: m.displayName || m.name!.replace(/^models\//, '') }))
      .sort(newestName),
  deepseek: async ({ apiKey }, f) =>
    rows(await getJson(f, 'https://api.deepseek.com/models', { authorization: `Bearer ${apiKey}` }), 'data').flatMap((m) => (m.id ? [{ id: m.id, label: m.id }] : [])),
  local: async ({ apiKey, baseUrl }, f) =>
    rows(await getJson(f, `${baseUrl.replace(/\/+$/, '')}/models`, apiKey ? { authorization: `Bearer ${apiKey}` } : {}), 'data').flatMap((m) =>
      m.id ? [{ id: m.id, label: m.id }] : [],
    ),
};

/** The models a provider offers right now, newest first where the provider says which is newest. */
export async function listModels(settings: Pick<ModelSettings, 'provider' | 'apiKey' | 'baseUrl'>, fetchImpl: typeof fetch = fetch): Promise<ModelOption[]> {
  const models = await listers[settings.provider](settings, fetchImpl);
  const seen = new Set<string>();
  return models.filter((m) => !seen.has(m.id) && seen.add(m.id));
}
