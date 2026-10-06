import type { Course } from '@folio/core';
import type { ModuleDraft } from './online';

/**
 * Where a week's page disagrees with itself, found without reading it as a reader would. Each of these was on
 * judged pages again and again, and each is something a student acts on: a checklist that sends them to a part
 * the page does not have, or gives a video three times the minutes it runs.
 */

const norm = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** The names a checklist may rightly quote: the page's own parts and headings, its videos and files, and the graded work by its component. */
function known(v: ModuleDraft, course: Course): string[] {
  const blocks = v.parts.flatMap((p) => p.blocks);
  const own = [...v.parts.map((p) => p.title), ...blocks.filter((b) => b.type === 'heading' || b.type === 'video' || b.type === 'file' || b.type === 'callout').flatMap((b) => [b.text, b.title])];
  return [...own, ...course.grading.map((g) => g.item), 'Stuck?', course.title].map(norm).filter(Boolean);
}

/** What a checklist item sends the student to, when it quotes a name after a verb of doing. */
const SENT_TO = /\b(?:read|watch|work through|do|complete|follow|study|open|see)\b[^"“'‘]{0,40}["“'‘]([^"”'’]{4,80})["”'’]/i;

export function agreementFaults(v: ModuleDraft, course: Course): string[] {
  const faults: string[] = [];
  const names = known(v, course);
  for (const item of v.checklist) {
    const quoted = SENT_TO.exec(item.label)?.[1];
    if (quoted && !names.some((n) => n.includes(norm(quoted)) || norm(quoted).includes(n))) faults.push(`The checklist sends the student to "${quoted.slice(0, 60)}", and nothing on the page is called that: name the part by its own title`);
  }
  const talks = v.parts.flatMap((p) => p.blocks).filter((b) => b.type === 'video' && b.minutes > 0);
  const watching = v.checklist.filter((c) => c.activity === 'watch');
  const [runs, given] = [talks.reduce((n, b) => n + b.minutes, 0), watching.reduce((n, c) => n + c.minutes, 0)];
  if (talks.length && watching.length && given > runs * 2 + 3) faults.push(`The checklist gives ${given} minutes to watching, and the page's videos run ${Math.round(runs)} in all: give each its own length, and put anything else the item asks in an item of its own`);
  return faults;
}
