/**
 * The example card of one chart type, as text, from the kit's examples: what a drawing call starts from. A card
 * runs from its `card({id:'…'` to the next card's; whatever helpers sit between are part of what it is shown.
 */
const MAX = 14_000;

export function exampleCard(examples: string, id: string): string {
  const start = examples.indexOf(`card({id:'${id}'`);
  if (start < 0) return '';
  const next = examples.indexOf("card({id:'", start + 10);
  return examples.slice(start, next < 0 ? undefined : next).trim().slice(0, MAX);
}

/** The ids the type list names, in its order: `| Name | \`id\` | …`. */
export const typeIds = (types: string): string[] => [...types.matchAll(/^\|[^|]+\|\s*`([a-z0-9]+)`\s*\|/gm)].map((m) => m[1]!);
