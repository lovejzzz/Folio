import { createInference, isConfigured, reviewerSettings, type Inference, type InferenceError, type OnUsage, type ProviderId } from '@folio/ai';
import { currentMessages } from '../i18n';
import { modelSettings, usePrefs } from './prefs';
import { toast } from './toasts';

/** The configured model, or null if none is set up yet. `onUsage` hears the tokens of every call. */
export function currentInference(onUsage?: OnUsage): Inference | null {
  const settings = modelSettings(usePrefs.getState());
  return isConfigured(settings) ? createInference(settings, undefined, onUsage) : null;
}

/** The model that reviews lesson plans with the teacher's key, or null where plans go out as written. */
export function currentReviewer(onUsage?: OnUsage): Inference | null {
  const settings = modelSettings(usePrefs.getState());
  const review = settings && isConfigured(settings) ? reviewerSettings(settings) : null;
  return review ? createInference(review, undefined, onUsage) : null;
}

export function useModelReady(): boolean {
  const settings = usePrefs((s) => modelSettings(s));
  return isConfigured(settings);
}

const isOffline = (): boolean => typeof navigator !== 'undefined' && navigator.onLine === false;

/**
 * A cloud model can't be reached offline. Say so before asking, rather than
 * fail a moment later with a network error. A local server still works.
 */
export function canReach(inference: Pick<Inference, 'provider'>): boolean {
  if (inference.provider === 'local' || !isOffline()) return true;
  toast({ key: 'offline', message: currentMessages().errors.offlineAction, tone: 'attention' });
  return false;
}

/** The teacher-facing sentence for a failed model call, worded for the provider it went to. */
export function errorMessage(error: unknown, provider: ProviderId | null = usePrefs.getState().provider): string {
  const t = currentMessages();
  if (!error || typeof error !== 'object' || !('kind' in error)) return t.errors.generic;
  const kind = (error as InferenceError).kind;
  if (provider === 'local' && (kind === 'auth' || kind === 'network')) return t.errors.local[kind];
  if (kind === 'network' && isOffline()) return t.errors.offlineAction;
  return t.errors[kind] ?? t.errors.generic;
}
