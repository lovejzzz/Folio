import type { Question } from '@folio/core';

/**
 * Models put the right answer first far more often than chance (in live runs,
 * 22 of 26 multiple-choice questions answered "A"), so a student could learn
 * the pattern instead of the lesson. After generation, each quiz spreads its
 * correct answers evenly over the positions, in a shuffled order.
 */

const LAST = /^(all|none|both|neither) of (the )?(above|these)$|^以上(都|均|皆)?(是|不是|正确|错误|都对|都不对)?$/i;
/** "option B", "(C)", "选项A": text that points at a choice by its place, so the order must stay. */
const BY_LETTER = /\b(option|choice|answer)\s+[A-F]\b|\([A-F]\)|选项\s*[A-F]|[A-F]\s*项/i;
const NUMBER = /^[-−]?\d+(?:[.,]\d+)?\s*[%a-z°]*$/i;

function shuffled<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function numeric(text: string): number {
  return Number(text.replace('−', '-').replace(',', '.').replace(/[^\d.-]/g, ''));
}

/** Put the correct choice at `target`, keeping the other choices in their order. "None of the above" stays last. */
function placeCorrect(q: Question, target: number): Question {
  const right = q.choices.find((c) => c.id === q.correct);
  if (!right) return q;
  const tail = q.choices.filter((c) => c.id !== right.id && LAST.test(c.text.trim()));
  if (tail.length || LAST.test(right.text.trim())) return q;
  const others = q.choices.filter((c) => c.id !== right.id);
  const at = Math.min(target, others.length);
  return { ...q, choices: [...others.slice(0, at), right, ...others.slice(at)] };
}

/** Number choices read in order (2, 4, 6, 8); their position follows from their value. */
function sortNumbers(q: Question): Question | null {
  if (!q.choices.every((c) => NUMBER.test(c.text.trim()))) return null;
  return { ...q, choices: [...q.choices].sort((a, b) => numeric(a.text) - numeric(b.text)) };
}

export function balanceChoices(questions: Question[], random: () => number = Math.random): Question[] {
  const fixed = (q: Question) => BY_LETTER.test(`${q.prompt} ${q.explanation}`);
  const movable = questions.filter((q) => q.format === 'choice' && q.correct && q.choices.length >= 2 && !sortNumbers(q) && !fixed(q));
  // Positions 0..3 in turn, shuffled, so a five-question quiz doesn't lean on one letter.
  const slots = shuffled(
    movable.map((_, i) => i % 4),
    random,
  );
  let next = 0;
  return questions.map((q) => {
    if (q.format !== 'choice' || !q.correct) return q;
    const sorted = sortNumbers(q);
    if (sorted) return sorted;
    if (q.choices.length < 2 || fixed(q)) return q;
    return placeCorrect(q, (slots[next++] ?? 0) % q.choices.length);
  });
}

/** "True or false: plants breathe." → "Plants breathe." The format is already labelled. */
export function stripTrueFalsePrefix(prompt: string): string {
  const stripped = prompt.replace(/^\s*(true\s+or\s+false|t\s*\/\s*f)\s*[:?.,-]\s*/i, '').replace(/^\s*(判断题?|对还是错|是非题)\s*[:：]\s*/, '');
  if (stripped === prompt || !stripped) return prompt;
  return /^[a-z]/.test(stripped) ? stripped[0]!.toUpperCase() + stripped.slice(1) : stripped;
}
