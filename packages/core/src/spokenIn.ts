/**
 * Whether a piece of text is Spanish rather than English: a course is written in English, and a teacher's
 * Translate puts Spanish into some of its fields. Marked as Spanish, a screen reader reads it in a Spanish voice
 * and the browser checks its spelling as Spanish. Short or mixed text stays English: only clear Spanish counts.
 */

const SPANISH = new Set(['el', 'la', 'los', 'las', 'de', 'del', 'que', 'y', 'en', 'un', 'una', 'por', 'para', 'con', 'es', 'son', 'se', 'su', 'sus', 'al', 'lo', 'como', 'más', 'pero', 'este', 'esta', 'estos', 'cada', 'sobre', 'entre', 'qué', 'cómo', 'cuál', 'también']);
const ENGLISH = new Set(['the', 'and', 'of', 'to', 'is', 'are', 'in', 'that', 'for', 'with', 'on', 'it', 'this', 'as', 'be', 'by', 'from', 'what', 'how', 'which', 'each', 'their', 'they', 'an', 'or']);

/**
 * Spanish needs Spanish words. An accent alone is a name or a borrowed word ("García Márquez", "résumé",
 * "Pokémon"), and "y" alone is a variable ("find y when y = 2x"): neither makes English text Spanish, where a
 * rewrite would then come back in Spanish.
 */
export function looksSpanish(text: string): boolean {
  const words = text.toLowerCase().match(/[a-záéíóúüñ]+/g) ?? [];
  if (words.length < 3) return false;
  const spanish = words.filter((w) => SPANISH.has(w));
  const distinct = new Set(spanish.filter((w) => w !== 'y')).size;
  const en = words.filter((w) => ENGLISH.has(w)).length;
  // Marks only Spanish writes (ñ, ¿, ¡) or its accents back up one Spanish word; without them it takes two.
  const marked = /[ñ¿¡]|ción\b|[áéíóú]/i.test(text);
  if (distinct < (marked ? 1 : 2)) return false;
  return spanish.length + (marked ? 2 : 0) > 2 * en;
}

/** The language to mark a field in: Spanish when it clearly is, otherwise the course's own. */
export function spokenIn(text: string, courseLanguage: string): string {
  return courseLanguage === 'en' && looksSpanish(text) ? 'es' : courseLanguage;
}
