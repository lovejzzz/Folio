/**
 * The graded components a brief states with their weights, read by rule. Read by the model, one brief's "weekly problem
 * sets 20%, two midterms 20% each" came back as "Problem sets" in two runs and "Weekly problem sets" in a third, "Midterm 1"
 * and "Midterm exam 1": every piece of work in the course is tied to these names, so the same brief gave courses whose
 * work did not line up. Where a brief lists its components with percentages that come to 100, the names and weights are
 * the brief's own words, the same every time; where it does not, nothing is read here and the outline's reading stands.
 */

export interface StatedItem {
  item: string;
  weight: number;
  /** How many pieces the brief says it has ("six programming assignments"), when it says. */
  count?: number;
}

const COUNTS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const COUNT = new RegExp(`^(?:(${Object.keys(COUNTS).join('|')}|\\d{1,2})\\s+)`, 'i');
/** Where the name of a component ends and what is said about it begins. */
const QUALIFIER = /\s+(?:with\b|such as\b|of (?:one|\d)|in the (?:last|first|final)\b|at the (?:start|end)\b|before each\b|every\b|each\b|that\b|which\b|due\b|on paper\b|in R\b).*$/i;
const PERCENT = /(\d{1,3}(?:\.\d+)?)\s*%(\s+each)?/g;

/** "midterms" → "midterm", "quizzes" → "quiz", "analysis papers" → "analysis paper"; a word that is not a plural is left. */
function singular(name: string): string {
  return name.replace(/(\w+)$/, (word) => (/(?:zz|ss|x|ch|sh)es$/i.test(word) ? word.replace(/(?<=zz|ss|x|ch|sh)es$/i, '').replace(/zz$/i, 'z') : /ies$/i.test(word) ? word.replace(/ies$/i, 'y') : /[^s]s$/i.test(word) && !/(?:sis|us|is)$/i.test(word) ? word.slice(0, -1) : word));
}

const tidy = (name: string) => name.replace(/^(?:and|plus)\s+/i, '').replace(/^(?:an?|the)\s+/i, '').replace(/^\d[\d,]*-word\s+/i, '').replace(QUALIFIER, '').replace(/\s+/g, ' ').trim();
/** The first letter raised, unless the word has its own capitals ("iClicker"). */
const capital = (name: string) => (/^[a-z][A-Z]/.test(name) ? name : name.charAt(0).toUpperCase() + name.slice(1));

/** One clause of the list ("two midterms 20% each", "four essays 15%, 20%, 20% and 25%") as its components. */
function clause(words: string, weights: number[], each: boolean): StatedItem[] {
  const said = COUNT.exec(words.replace(/^(?:and|plus)\s+/i, '').replace(/^(?:an?|the)\s+/i, ''));
  const count = said ? (COUNTS[said[1]!.toLowerCase()] ?? Number(said[1])) : undefined;
  const name = tidy(words.replace(/^(?:and|plus)\s+/i, '').replace(/^(?:an?|the)\s+/i, '').replace(COUNT, ''));
  if (!name || name.split(' ').length > 8) return [];
  // "two midterms 20% each", or "four essays 15%, 20%, 20% and 25%": each is a component of its own, numbered.
  if (count && count > 1 && (each || weights.length === count)) return Array.from({ length: count }, (_, i) => ({ item: `${capital(singular(name))} ${i + 1}`, weight: weights[each ? 0 : i]! }));
  if (weights.length !== 1) return [];
  return [{ item: capital(name), weight: weights[0]!, ...(count && count > 1 ? { count } : {}) }];
}

/** The components of the sentence that lists them, or none when no sentence's weights come to 100. */
export function gradingIn(brief: string): StatedItem[] {
  for (const sentence of brief.split(/(?<=[.;])\s+|\n+/)) {
    if ((sentence.match(/%/g) ?? []).length < 2) continue;
    const text = sentence.replace(/^[^:]{0,80}:\s*/, '').replace(/[.;]\s*$/, '');
    const items: StatedItem[] = [];
    let from = 0;
    let failed = false;
    const marks = [...text.matchAll(PERCENT)];
    for (let i = 0; i < marks.length && !failed; i++) {
      const m = marks[i]!;
      const words = text.slice(from, m.index).replace(/^[\s,]+/, '').trim();
      // Weights that follow one another with nothing named between them belong to the clause before: "15%, 20%, 20% and 25%".
      const weights = [Number(m[1])];
      let last = m;
      while (marks[i + 1] && /^[\s,]*(?:and\s+)?$/.test(text.slice(last.index + last[0].length, marks[i + 1]!.index))) weights.push(Number((last = marks[++i]!)[1]));
      const got = words ? clause(words, weights, Boolean(m[2])) : [];
      if (!got.length) failed = true;
      items.push(...got);
      // What trails a weight up to the next comma is said about the component, not the name of the next one.
      const rest = text.slice(last.index + last[0].length);
      const comma = rest.search(/,|\band\b(?=\s+(?:an?|the|\w+\s)[^,%]*\d\s*%)/);
      from = last.index + last[0].length + (comma < 0 ? rest.length : comma);
    }
    const total = Math.round(items.reduce((n, g) => n + g.weight, 0) * 10) / 10;
    if (!failed && items.length >= 2 && total === 100 && new Set(items.map((g) => g.item.toLowerCase())).size === items.length) return items;
  }
  return [];
}
