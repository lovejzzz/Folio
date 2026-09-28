import { describe, expect, it } from 'vitest';
import { listModels } from '../src/models';

function answering(body: unknown, seen: { url?: string; headers?: Record<string, string> } = {}): typeof fetch {
  return (async (url: RequestInfo | URL, init?: RequestInit) => {
    seen.url = String(url);
    seen.headers = init?.headers as Record<string, string>;
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
}

describe('listing a provider’s models', () => {
  it('keeps Anthropic’s order and names, and sends the browser header', async () => {
    const seen: { headers?: Record<string, string> } = {};
    const body = { data: [{ id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5' }, { id: 'claude-sonnet-5', display_name: 'Claude Sonnet 5' }] };
    const models = await listModels({ provider: 'anthropic', apiKey: 'k', baseUrl: '' }, answering(body, seen));
    expect(models).toEqual([
      { id: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
      { id: 'claude-sonnet-5', label: 'Claude Sonnet 5' },
    ]);
    expect(seen.headers?.['anthropic-dangerous-direct-browser-access']).toBe('true');
  });

  it('keeps only OpenAI chat models, newest first', async () => {
    const body = {
      data: [
        { id: 'gpt-5', created: 1 },
        { id: 'text-embedding-3-large', created: 5 },
        { id: 'gpt-6-sol', created: 3 },
        { id: 'gpt-4o-realtime-preview', created: 4 },
        { id: 'dall-e-3', created: 2 },
      ],
    };
    const models = await listModels({ provider: 'openai', apiKey: 'k', baseUrl: '' }, answering(body));
    expect(models.map((m) => m.id)).toEqual(['gpt-6-sol', 'gpt-5']);
  });

  it('keeps Gemini text models, highest version first, without the models/ prefix', async () => {
    const body = {
      models: [
        { name: 'models/gemini-2.5-pro', displayName: 'Gemini 2.5 Pro', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-embedding-001', supportedGenerationMethods: ['embedContent'] },
        { name: 'models/gemini-3.8-flash', displayName: 'Gemini 3.8 Flash', supportedGenerationMethods: ['generateContent'] },
      ],
    };
    const models = await listModels({ provider: 'google', apiKey: 'k', baseUrl: '' }, answering(body));
    expect(models.map((m) => m.id)).toEqual(['gemini-3.8-flash', 'gemini-2.5-pro']);
  });

  it('asks a local server at its own address', async () => {
    const seen: { url?: string } = {};
    const models = await listModels({ provider: 'local', apiKey: '', baseUrl: 'http://localhost:11434/v1/' }, answering({ data: [{ id: 'llama3.1' }] }, seen));
    expect(seen.url).toBe('http://localhost:11434/v1/models');
    expect(models).toEqual([{ id: 'llama3.1', label: 'llama3.1' }]);
  });

  it('fails plainly when the provider refuses', async () => {
    const refusing = (async () => new Response('{}', { status: 401 })) as typeof fetch;
    await expect(listModels({ provider: 'deepseek', apiKey: 'bad', baseUrl: '' }, refusing)).rejects.toThrow('401');
  });
});
