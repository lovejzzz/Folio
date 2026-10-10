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
  /** The brief's whole clause for it, with what it says about the component after its name. */
  said: string;
}

/**
 * How a component runs, as far as the brief's own clause for it says: read by rule, so the same brief gives the same card.
 * Read by the model, three outlines of one brief had a quiz handed in "on paper" once and unsaid twice, and a length of
 * "3,000 words" and "3,000-word report". What the clause does not say is left unsaid.
 */
export function cardIn(said: string): { who: 'individual' | 'pair' | 'group'; groupSize?: number; prepared: boolean; handIn: 'paper' | 'online' | 'none' | 'unsaid'; points?: number; allowed: string; length: string; source: string } {
  const size = /\bgroups? of (\d{1,2}|two|three|four|five|six)\b/i.exec(said)?.[1];
  const words = /\b(\d[\d,]*)(?:-| )words?\b/i.exec(said)?.[1];
  const pages = /\b(\d{1,2}(?:\s*(?:-|–|to)\s*\d{1,2})?)(?:-| )pages?\b/i.exec(said)?.[1];
  const allowed = [...said.matchAll(/\b(closed[- ]book|open[- ]book|open[- ]notes?|(?:a |one |no )?calculators?(?: allowed)?|(?:a |one )?formula sheet|(?:a |one )?(?:page|sheet) of notes)\b/gi)].map((m) => m[1]!.toLowerCase());
  return {
    who: /\bgroups?\b|\bteams?\b/i.test(said) ? 'group' : /\bpairs?\b|\bpartners?\b/i.test(said) ? 'pair' : 'individual',
    ...(size ? { groupSize: COUNTS[size.toLowerCase()] ?? Number(size) } : {}),
    prepared: /\bpresentations?\b|\bleadership\b|\bleads?\b|\bleading\b|\bdebates?\b/i.test(said),
    handIn: /\bonline\b|\buploaded?\b|\bsubmitted (?:through|on|to)\b/i.test(said) ? 'online' : /\bon paper\b|\bhanded in\b|\bhard copy\b/i.test(said) ? 'paper' : /\bparticipation\b|\bclicker\b|\bpresentations?\b|\bleadership\b|\battendance\b/i.test(said) ? 'none' : 'unsaid',
    ...(/\b(\d{1,3}) points\b/i.test(said) ? { points: Number(/\b(\d{1,3}) points\b/i.exec(said)![1]) } : {}),
    allowed: [...new Set(allowed)].join(', '),
    length: words ? `${words} words` : pages ? `${pages} pages` : '',
    source: '',
  };
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
  if (count && count > 1 && (each || weights.length === count)) return Array.from({ length: count }, (_, i) => ({ item: `${capital(singular(name))} ${i + 1}`, weight: weights[each ? 0 : i]!, said: words }));
  if (weights.length !== 1) return [];
  return [{ item: capital(name), weight: weights[0]!, ...(count && count > 1 ? { count } : {}), said: words }];
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
      // What trails a weight up to the next comma is said about the component, not the name of the next one.
      const rest = text.slice(last.index + last[0].length);
      const comma = rest.search(/,|\band\b(?=\s+(?:an?|the|\w+\s)[^,%]*\d\s*%)/);
      const tail = rest.slice(0, comma < 0 ? rest.length : comma).trim();
      items.push(...got.map((g) => ({ ...g, said: `${g.said} ${tail}`.trim() })));
      from = last.index + last[0].length + (comma < 0 ? rest.length : comma);
    }
    const total = Math.round(items.reduce((n, g) => n + g.weight, 0) * 10) / 10;
    if (!failed && items.length >= 2 && total === 100 && new Set(items.map((g) => g.item.toLowerCase())).size === items.length) return items;
  }
  return [];
}
