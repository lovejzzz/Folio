import { docLabels, type Language } from '@folio/core';
import type { AssignmentDraft, DiscussionsDraft, OutlineDraft, QuestionDraft, SlidesDraft } from './schemas';

/**
 * Small, certain fixes made locally instead of by a repair call, which would
 * resend the whole request and answer. Each one only restates what the model
 * clearly meant; anything unclear is left for the checks to flag.
 */

const TRUE = /^(true|t|yes|correct|正确|对|是)$/i;
const FALSE = /^(false|f|no|incorrect|错误|错|否)$/i;

/** A true/false question's choices are always the course language's two words; the model's answer is mapped onto them. */
export function tidyTrueFalse(q: QuestionDraft, language: Language): QuestionDraft {
  if (q.format !== 'truefalse') return q;
  const answer = q.answer.trim().replace(/[.。]$/, '');
  const truth = TRUE.test(answer) ? true : FALSE.test(answer) ? false : null;
  if (truth === null) return q;
  const { trueWord, falseWord } = docLabels(language);
  return { ...q, choices: [trueWord, falseWord], answer: truth ? trueWord : falseWord };
}

/** The page numbers the steps, so a number the model wrote in would show twice. */
export function tidySteps(v: AssignmentDraft): AssignmentDraft {
  return { ...v, steps: v.steps.map((s) => s.replace(/^\s*(?:step\s*\d{1,2}\s*[.:)：]|\d{1,2}(?:[.)]\s|、))\s*/i, '').replace(/^\s*第[一二三四五六七八九十\d]+步\s*[:：、]?\s*/, '')) };
}

export const FOLLOW_UPS = 3;

/** Follow-ups are optional prompts for the teacher: past three, the extras are dropped. */
export function tidyFollowUps(v: DiscussionsDraft): DiscussionsDraft {
  return { discussions: v.discussions.map((d) => ({ ...d, followUps: d.followUps.slice(0, FOLLOW_UPS) })) };
}

const QUOTE_PAIRS: [string, string][] = [['“', '”'], ['"', '"'], ['「', '」'], ['‘', '’'], ["'", "'"]];

/** A title the model wrapped in quotation marks, “Like this”, loses the marks; quotes inside a title stay. */
export function unquote(title: string): string {
  const t = title.trim();
  for (const [open, close] of QUOTE_PAIRS) {
    const inner = t.slice(open.length, -close.length);
    if (t.length > 2 && t.startsWith(open) && t.endsWith(close) && !inner.includes(open) && !inner.includes(close)) return inner.trim();
  }
  return t;
}

export function tidyOutline(v: OutlineDraft): OutlineDraft {
  return { ...v, title: unquote(v.title), lessons: v.lessons.map((l) => ({ ...l, title: unquote(l.title) })) };
}

export const BULLETS_PER_SLIDE = 5;

/**
 * A slide with more than five bullets becomes two, the second titled
 * "(continued)", so nothing is lost and no slide is crowded. Asked again,
 * a cheap model tends to send the same slide back.
 */
export function tidySlides(v: SlidesDraft, language: Language): SlidesDraft {
  const { continued } = docLabels(language);
  return {
    slides: v.slides.flatMap((s) => {
      if (s.bullets.length <= BULLETS_PER_SLIDE) return [s];
      const half = Math.ceil(s.bullets.length / 2);
      return [
        { ...s, bullets: s.bullets.slice(0, half) },
        { ...s, title: continued(s.title), bullets: s.bullets.slice(half), notes: '' },
      ];
    }),
  };
}

const FENCE = /```(?:[\w+-]*[ \t]*\n)?([\s\S]*?)\n?[ \t]*```/g;

/**
 * Fields are plain text with code marked inline, so a fenced block becomes
 * one marked line per line of code. Blank lines inside it stay blank.
 */
export function unfence(text: string): string {
  if (!text.includes('```')) return text;
  return text.replace(FENCE, (_, body: string) =>
    body
      .split('\n')
      .map((line) => (line.trim() ? `\`${line.replace(/`/g, "'")}\`` : ''))
      .join('\n'),
  );
}

/** Every string in a model's answer, fences undone. */
export function unfenceAll<T>(value: T): T {
  if (typeof value === 'string') return unfence(value) as T;
  if (Array.isArray(value)) return value.map(unfenceAll) as T;
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, unfenceAll(v)])) as T;
  return value;
}
