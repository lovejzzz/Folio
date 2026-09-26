import { createInference, isConfigured, type Inference, type InferenceError } from '@folio/ai';
import { currentMessages } from '../i18n';
import { modelSettings, usePrefs } from './prefs';

/** The configured model, or null if none is set up yet. */
export function currentInference(): Inference | null {
  const settings = modelSettings(usePrefs.getState());
  return isConfigured(settings) ? createInference(settings) : null;
}

export function useModelReady(): boolean {
  const settings = usePrefs((s) => modelSettings(s));
  return isConfigured(settings);
}

export function errorMessage(error: unknown): string {
  const t = currentMessages();
  if (error && typeof error === 'object' && 'kind' in error) {
    const kind = (error as InferenceError).kind;
    return t.errors[kind] ?? t.errors.generic;
  }
  return t.errors.generic;
}
