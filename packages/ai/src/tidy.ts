import { docLabels, type Course, type Language, type Lesson } from '@folio/core';
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

/** The points already show a band's floor, so "First (70+)" reads as "First", as other runs wrote it. */
const BAND_RANGE = /\s*[(（]\s*\d+\s*(?:\+|[–—-]\s*\d+)\s*%?\s*[)）]\s*$/;

/** The page numbers the steps, so a number the model wrote in would show twice. */
export function unnumberSteps<T extends { steps: string[] }>(v: T): T {
  return { ...v, steps: v.steps.map((s) => s.replace(/^\s*(?:step\s*\d{1,2}\s*[.:)：]|\d{1,2}(?:[.)]\s|、))\s*/i, '').replace(/^\s*第[一二三四五六七八九十\d]+步\s*[:：、]?\s*/, '')) };
}

export function tidySteps(v: AssignmentDraft): AssignmentDraft {
  return unnumberSteps({
    ...v,
    rubric: { ...v.rubric, levels: v.rubric.levels.map((lv) => ({ ...lv, label: lv.label.replace(BAND_RANGE, '') || lv.label })) },
  });
}

/** "Passage [2].", "(source [1])": pointers into the numbered passages, which the teacher never sees numbered. */
const REFS = String.raw`(?:passages?|sources?)\s*\[\d+\](?:\s*(?:,|and|&|–|-)\s*\[?\d+\]?)*`;
const REF_IN_BRACKETS = new RegExp(String.raw`\s*\((?:see\s+)?${REFS}\)`, 'gi');
const REF_SENTENCE = new RegExp(String.raw`(^|[.!?])[ \t]*(?:see\s+)?${REFS}\.?(?=\s|$)`, 'gim');
/** "Torres's report in passage [6] that…", "her article, passage [6].": the pointer goes, the sentence stays. */
const REF_INLINE = new RegExp(String.raw`(?:,\s*|\s+in\s+|\s+)${REFS}(?=[\s.,:;)]|$)`, 'gi');

/**
 * Folio's own instructions, come back as advice. Told never to restate them, writers still do, in the notes a
 * teacher reads: "write no criteria of your own", "no second set of questions here", "the handout is written
 * separately". A sentence that carries one of these is the writer talking to itself, and goes.
 */
const ECHOES = /\bwrites? no (?:other |separate )?criteria\b|\bno second set of questions\b|\b(?:is|are) written separately\b|\bseparately written\b|\bscored by (?:its |their |the )?points\b|\btakes the place of further practice\b|\bin exactly these words\b|\buse (?:new|different|other) (?:cases|functions|numbers)[^.]*\b(?:not|from) those\b|\bnobody has been told anything yet\b|\b(?:two|three|four|five) bullets at most\b/i;

/** The text without the sentences that only echo an instruction. Lines of code are never touched. */
export function withoutEchoes(text: string): string {
  if (!ECHOES.test(text)) return text;
  const kept = text.split('\n').map((row) => (row.includes('`') ? row : row.split(/(?<=[.!?])\s+/).filter((sentence) => !ECHOES.test(sentence)).join(' ')));
  return kept.filter((row, i) => row.trim() || !text.split('\n')[i]!.trim()).join('\n').trim();
}

export function tidyPlanSources<T extends { segments: { description: string; teacherNotes: string }[] }>(v: T): T {
  const strip = (text: string) => withoutEchoes(text.replace(REF_IN_BRACKETS, '').replace(REF_SENTENCE, '$1').replace(REF_INLINE, '').trim());
  return { ...v, segments: v.segments.map((seg) => ({ ...seg, description: strip(seg.description), teacherNotes: strip(seg.teacherNotes) })) };
}

export const FAQ_ENTRIES = 4;

/** Past four questions, the extras are dropped rather than sent back for a repair. */
export function tidyFaq<T extends { entries: unknown[] }>(v: T): T {
  return { ...v, entries: v.entries.slice(0, FAQ_ENTRIES) };
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

const COUNT = String.raw`(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|\d+)`;
// A time span with a space or a hyphen ("90 minute", "four-week"); a count of parts only hyphenated, so "five topic areas" stays.
const SPAN = new RegExp(String.raw`\b(an?\s+)?${COUNT}(?:[- ](?:week|day|hour|minute)|-(?:session|lesson|lecture|topic|part|unit))(?:-long)?\s+(?=\w)`, 'gi');

/**
 * "A four-week module on regression": the teacher changes the number of
 * lessons and their length on the plan, so the summary would go stale. The
 * span goes and the article follows the next word. Sonnet wrote it twice,
 * against the rule.
 */
export function withoutSpan(text: string): string {
  return text.replace(SPAN, (_, article: string | undefined, at: number, whole: string) => {
    if (!article) return '';
    const next = whole.slice(at + _.length);
    const an = /^[aeiou]/i.test(next) && !/^(?:uni|use|one)/i.test(next);
    const word = an ? 'an' : 'a';
    return `${article[0] === 'A' ? word[0]!.toUpperCase() + word.slice(1) : word} `;
  });
}

export function tidyOutline(v: OutlineDraft): OutlineDraft {
  return {
    ...v,
    title: unquote(v.title),
    summary: withoutSpan(v.summary),
    lessons: v.lessons.map((l) => ({ ...l, title: unquote(l.title), summary: withoutSpan(l.summary) })),
  };
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
      // A question with its lettered options is one thing to look at: split, the poll showed option A and hid B to D.
      const options = s.bullets.filter((b) => /^\(?[A-Ea-e][.):]\s/.test(b.trim())).length >= 2;
      s = { ...s, notes: withoutEchoes(s.notes) };
      if (s.bullets.length <= BULLETS_PER_SLIDE || options) return [s];
      const half = Math.ceil(s.bullets.length / 2);
      return [
        { ...s, bullets: s.bullets.slice(0, half) },
        // The table or chart stays with the first: shown twice, it read as two different figures.
        { ...s, title: continued(s.title), bullets: s.bullets.slice(half), notes: '', table: undefined, chart: undefined },
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

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const WHICH = String.raw`(?:first|second|third|fourth|previous|prior|next|following|earlier|later)`;
const UNIT = String.raw`(?:lesson|class|topic|session)`;

/**
 * "The next lesson", "the first lesson, Evaporation": lessons are named by title, since teachers reorder them.
 * Where the words say which lesson plainly, it is named here, as the model meant it; where they don't ("the
 * last lesson" may be the one before or the final one), they are left for the plan's review.
 */
export function nameLessons(text: string, course: Course, lesson: Lesson): string {
  const order = course.lessonOrder.map((id) => course.lessons[id]?.title ?? '');
  const here = course.lessonOrder.indexOf(lesson.id);
  const quoted = (title: string) => `“${title}”`;
  let out = text;
  // Named anyway: keep only the name.
  for (const title of order.filter(Boolean)) {
    const named = new RegExp(String.raw`\bthe ${WHICH} ${UNIT}(?:,|:| —| –)?\s+(?:“|")?${escape(title)}(?:”|")?`, 'gi');
    out = out.replace(named, quoted(title));
  }
  const byPlace: Record<string, number> = { first: 0, second: 1, third: 2, fourth: 3, previous: here - 1, prior: here - 1, earlier: here - 1, next: here + 1, following: here + 1, later: here + 1 };
  return out.replace(new RegExp(String.raw`\bthe (${WHICH}) ${UNIT}\b`, 'gi'), (whole, which: string) => {
    const title = order[byPlace[which.toLowerCase()] ?? -1];
    return title && title !== lesson.title ? quoted(title) : whole;
  });
}

export function tidyLessonNames<T extends { keyIdeas: string[]; segments: { description: string; teacherNotes: string }[] }>(v: T, course: Course, lesson: Lesson): T {
  const name = (text: string) => nameLessons(text, course, lesson);
  return { ...v, keyIdeas: v.keyIdeas.map(name), segments: v.segments.map((s) => ({ ...s, description: name(s.description), teacherNotes: name(s.teacherNotes) })) };
}
