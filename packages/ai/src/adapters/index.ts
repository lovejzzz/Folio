import { InferenceError, type Inference, type ModelSettings } from '../inference';
import { anthropicInference } from './anthropic';
import { googleInference } from './google';
import { openaiInference } from './openai';

export function isConfigured(settings: ModelSettings | null | undefined): settings is ModelSettings {
  if (!settings || !settings.model.trim()) return false;
  if (settings.provider === 'local') return Boolean(settings.baseUrl.trim());
  return Boolean(settings.apiKey.trim());
}

export function createInference(settings: ModelSettings, fetchImpl?: typeof fetch): Inference {
  if (!isConfigured(settings)) throw new InferenceError('config', 'No model is set up yet.');
  switch (settings.provider) {
    case 'anthropic':
      return anthropicInference(settings, fetchImpl);
    case 'google':
      return googleInference(settings, fetchImpl);
    case 'openai':
    case 'local':
      return openaiInference(settings, fetchImpl);
  }
}
