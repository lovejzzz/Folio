import { InferenceError, isConfigured, type Inference, type ModelSettings } from '../inference';
import { anthropicInference } from './anthropic';
import { googleInference } from './google';
import { openaiInference } from './openai';

export function createInference(settings: ModelSettings, fetchImpl?: typeof fetch): Inference {
  if (!isConfigured(settings)) throw new InferenceError('config', 'No model is set up yet.');
  switch (settings.provider) {
    case 'anthropic':
      return anthropicInference(settings, fetchImpl);
    case 'google':
      return googleInference(settings, fetchImpl);
    case 'openai':
    case 'deepseek':
    case 'local':
      return openaiInference(settings, fetchImpl);
  }
}
