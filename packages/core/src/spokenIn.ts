/**
 * Whether a piece of text is Spanish rather than English: a course is written in English, and a teacher's
 * Translate puts Spanish into some of its fields. Marked as Spanish, a screen reader reads it in a Spanish voice
 * and the browser checks its spelling as Spanish. Short or mixed text stays English: only clear Spanish counts.
 */

const SPANISH = new Set(['el', 'la', 'los', 'las', 'de', 'del', 'que', 'y', 'en', 'un', 'una', 'por', 'para', 'con', 'es', 'son', 'se', 'su', 'sus', 'al', 'lo', 'como', 'más', 'pero', 'este', 'esta', 'estos', 'cada', 'sobre', 'entre', 'qué', 'cómo', 'cuál', 'también']);
const ENGLISH = new Set(['the', 'and', 'of', 'to', 'is', 'are', 'in', 'that', 'for', 'with', 'on', 'it', 'this', 'as', 'be', 'by', 'from', 'what', 'how', 'which', 'each', 'their', 'they', 'an', 'or']);

export function looksSpanish(text: string): boolean {
  const words = text.toLowerCase().match(/[a-záéíóúüñ]+/g) ?? [];
  if (words.length < 3) return false;
  const es = words.filter((w) => SPANISH.has(w)).length;
  const en = words.filter((w) => ENGLISH.has(w)).length;
  // Spanish-only letters and marks are strong evidence; "en", "a" and "es" alone are not.
  const marks = /[ñ¿¡]|ción\b|[áéíóú]/i.test(text) ? 2 : 0;
  return es + marks >= 2 && es + marks > 2 * en;
}

/** The language to mark a field in: Spanish when it clearly is, otherwise the course's own. */
export function spokenIn(text: string, courseLanguage: string): string {
  return courseLanguage === 'en' && looksSpanish(text) ? 'es' : courseLanguage;
}
