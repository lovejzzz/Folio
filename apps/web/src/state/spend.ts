import { priceUsage, type Usage } from '@folio/ai';
import { currentMessages } from '../i18n';

/**
 * What writing a course cost. Calls record the tokens they used; when a build
 * ends, they are priced at today's rates. The outline is written before the
 * course exists, so its calls wait here until the build of that course.
 */

const waiting = new Map<string, Usage[]>();

export function recordUsage(courseId: string, usages: readonly Usage[]): void {
  waiting.set(courseId, [...(waiting.get(courseId) ?? []), ...usages]);
}

export function takeUsage(courseId: string): Usage[] {
  const usages = waiting.get(courseId) ?? [];
  waiting.delete(courseId);
  return usages;
}

/** One sentence on what these calls cost, or '' when nothing could be priced. */
export async function costSentence(usages: readonly Usage[]): Promise<string> {
  if (!usages.length) return '';
  const cost = await priceUsage(usages);
  if (cost.unpriced === usages.length) return '';
  const t = currentMessages();
  return t.build.cost(cost.usd, cost.source === 'live');
}
