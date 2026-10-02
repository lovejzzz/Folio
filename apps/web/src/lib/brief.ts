import type { Session, SessionKind } from '@folio/core';

/**
 * Pre-fill the three chips under the brief as the teacher types. These read
 * what the teacher wrote; they never decide what the course contains.
 *
 * This module is on the first-load path, so it imports nothing at runtime
 * from @folio/core (which would pull in Zod).
 */

/** The most lessons a guess may give: SHAPE_LIMITS.lessons.max in @folio/core (a test keeps them equal). */
export const MAX_GUESSED_LESSONS = 40;

const EN_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  single: 1, dozen: 12, 'a dozen': 12,
};
const EN_NUMBER = String.raw`\d{1,2}|a dozen|dozen|${Object.keys(EN_NUMBERS).filter((w) => !['dozen', 'a dozen'].includes(w)).join('|')}`;

const ZH_DIGITS: Record<string, number> = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const ZH_NUMBER = String.raw`\d{1,2}|[零一二两三四五六七八九十]{1,3}`;

/** 十二 → 12, 二十 → 20, 两 → 2, 12 → 12. */
function zhNumber(raw: string): number | null {
  if (/^\d+$/.test(raw)) return Number(raw);
  if (!raw.includes('十')) return raw.length === 1 ? (ZH_DIGITS[raw] ?? null) : null;
  const [tens, ones] = raw.split('十') as [string, string];
  const t = tens === '' ? 1 : ZH_DIGITS[tens];
  const o = ones === '' ? 0 : ZH_DIGITS[ones];
  return t === undefined || o === undefined ? null : t * 10 + o;
}

function enNumber(raw: string): number | null {
  const word = raw.toLowerCase().replace(/\s+/g, ' ');
  return /^\d+$/.test(word) ? Number(word) : (EN_NUMBERS[word] ?? null);
}

const inRange = (n: number | null): number | null => (n !== null && n >= 1 && n <= MAX_GUESSED_LESSONS ? n : null);

// What a lesson is called, and words that may sit between the number and it ("six short lessons", "12 45-minute lessons").
const EN_LESSON = String.raw`(?:lessons?|sessions?|classes|class|periods?|lectures?|seminars?|workshops?)\b`;
// Not people: "a 30-student class" is one class.
const EN_FILLER = String.raw`(?:(?!(?:weeks?|days?|months?|terms?|years?|of|per|a|an|each|every|and|or|with|in|for|on|to|students?|pupils?|learners?|kids|children|people|participants?)\b)[a-z0-9]+(?:-(?!(?:students?|pupils?|learners?|kids|children|people|participants?)\b)[a-z0-9]+)*[\s-]+){0,2}`;
const ZH_LESSON = String.raw`(?:个)?(?:节课|节|课时|次课|堂课|堂|讲|课(?!程|本|文))`;
// A number that is a grade, a lesson's own number or a duration is not a count of lessons.
const EN_NOT_COUNT_BEFORE = String.raw`(?<!\b(?:grade|year|years|age|ages|lesson|unit|chapter|week|level|stage|form|no\.?|number)[\s-]*)`;
const EN_NOT_COUNT_AFTER = String.raw`(?![\s-]*(?:min(?:ute)?s?|hours?|hrs?|h)\b)`;
const EN_COUNT = String.raw`${EN_NOT_COUNT_BEFORE}\b(${EN_NUMBER})${EN_NOT_COUNT_AFTER}`;
// Not an ordinal (第三课), a grade (初二), or a rate: 每周一节 is how often, not how many.
const ZH_NOT_COUNT_BEFORE = String.raw`(?<![第\d零一二两三四五六七八九十高初大])(?<!每周|每星期|一周|每天)`;

/** The first match of any pattern that reads as a lesson count in range (or, `anySize`, as a count at all). */
function firstCount(text: string, patterns: [source: string, read: (m: RegExpMatchArray) => number | null][], anySize = false): number | null {
  for (const [source, read] of patterns) {
    for (const m of text.matchAll(new RegExp(source, 'gi'))) {
      const n = anySize ? read(m) : inRange(read(m));
      if (n !== null) return n;
    }
  }
  return null;
}

const times = (a: number | null, b: number | null): number | null => (a && b ? a * b : null);

/** "2 lessons a week for 6 weeks" → 12; "每周两节课，共六周" → 12; either way round. */
function lessonsFromRate(text: string, anySize = false): number | null {
  return firstCount(text, [
    [String.raw`${EN_COUNT}[\s-]+${EN_FILLER}${EN_LESSON}[\s-]+(?:a|per|each|every)[\s-]+week\b.*?\b(${EN_NUMBER})[\s-]+weeks?\b`, (m) => times(enNumber(m[1]!), enNumber(m[2]!))],
    [String.raw`\b(${EN_NUMBER})[\s-]+weeks?\b.*?${EN_COUNT}[\s-]+${EN_FILLER}${EN_LESSON}[\s-]+(?:a|per|each|every)[\s-]+week\b`, (m) => times(enNumber(m[2]!), enNumber(m[1]!))],
    [String.raw`(?:每周|一周|每星期)(${ZH_NUMBER})\s*${ZH_LESSON}.*?(${ZH_NUMBER})\s*(?:周|个星期|星期)`, (m) => times(zhNumber(m[1]!), zhNumber(m[2]!))],
    [String.raw`${ZH_NOT_COUNT_BEFORE}(${ZH_NUMBER})\s*(?:周|个星期)[^每]{0,12}(?:每周|每星期)(${ZH_NUMBER})\s*${ZH_LESSON}`, (m) => times(zhNumber(m[2]!), zhNumber(m[1]!))],
  ], anySize);
}

/** A number attached to the word for a lesson: "12 lessons", "lessons: 8", "十二节课". Never "lesson 3" or "第三课". */
function lessonsNamed(text: string): number | null {
  return firstCount(text, [
    // Not a rate: "five periods a week" says how often, not how many.
    [String.raw`${EN_COUNT}(?:[\s-]*(?:x|×))?[\s-]+${EN_FILLER}${EN_LESSON}(?![\s-]+(?:a|per|each|every)[\s-]+(?:week|day)\b)`, (m) => enNumber(m[1]!)],
    [String.raw`\b(?:lessons|sessions|classes)\s*[:：=]\s*(\d{1,2})\b`, (m) => enNumber(m[1]!)],
    [String.raw`${ZH_NOT_COUNT_BEFORE}(${ZH_NUMBER})\s*${ZH_LESSON}`, (m) => zhNumber(m[1]!)],
  ]);
}

/** "Eight lessons", "12 lessons", "十二节课": a total named as lessons, never a length ("a 50-minute lecture"). */
function lessonsNamedPlainly(text: string): number | null {
  return firstCount(text, [
    [String.raw`${EN_COUNT}[\s-]+(?:lessons|classes|sessions)\b`, (m) => enNumber(m[1]!)],
    [String.raw`${ZH_NOT_COUNT_BEFORE}(${ZH_NUMBER})\s*(?:节课|次课|课)(?!程|本|文|堂|时)`, (m) => zhNumber(m[1]!)],
  ]);
}

/** Only weeks: "over 3 weeks" is a weak hint of one lesson a week. */
function lessonsFromWeeks(text: string): number | null {
  return firstCount(text, [
    [String.raw`${EN_COUNT}[\s-]+weeks?\b`, (m) => enNumber(m[1]!)],
    [String.raw`${ZH_NOT_COUNT_BEFORE}(${ZH_NUMBER})\s*(?:周|个星期)`, (m) => zhNumber(m[1]!)],
  ]);
}

/** How many lessons the brief asks for. A number named as lessons beats one named as weeks. */
export function guessLessons(text: string): number | null {
  // "Four weeks, each a lecture and a seminar": a lesson is a week of sessions, so the weeks are the count.
  // A count named as lessons still wins ("Eight lessons over two weeks, each a class and a lab").
  if (guessSessions(text)) {
    const weeks = lessonsNamedPlainly(text) ?? lessonsFromWeeks(text);
    if (weeks) return weeks;
  }
  // A rate too large for one course ("five periods a week for 36 weeks") is no count at all: Folio asks instead.
  if (lessonsFromRate(text, true) !== null) return lessonsFromRate(text);
  return lessonsNamed(text) ?? lessonsFromWeeks(text);
}

/** A US grade, named as the level menu names it. */
const gradeName = (grade: number): string | null => (grade >= 1 && grade <= 12 ? `Grade ${grade}` : null);

/** Stages past school, as the level menu names them; the most advanced a brief mentions wins. */
function stageAfterSchool(text: string): string | null {
  if (/\b(?:ph\.?d|doctoral|doctorate)\b/i.test(text)) return 'Doctoral (PhD)';
  if (/\b(?:graduate|postgraduate|master'?s|master’s)\b/i.test(text)) return 'Graduate (master’s)';
  if (/\b(?:university|undergrad(?:uate)?s?|college|first-year|freshm[ae]n)\b/i.test(text)) return 'Undergraduate';
  return null;
}

const ORDINALS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12,
};

/** "11th graders", "eleventh-grade", "7th grade" → the grade number. */
function ordinalGrade(text: string): number | null {
  const m = text.match(new RegExp(String.raw`\b(\d{1,2})(?:st|nd|rd|th)[\s-]+grade(?:rs?)?\b|\b(${Object.keys(ORDINALS).join('|')})[\s-]+grade(?:rs?)?\b`, 'i'));
  if (!m) return null;
  return m[1] ? Number(m[1]) : (ORDINALS[m[2]!.toLowerCase()] ?? null);
}

function englishLevel(text: string): string | null {
  const grade = text.match(/\b(grade|year)[\s-]*(\d{1,2})s?\b/i);
  if (grade) return `${/year/i.test(grade[1]!) ? 'Year' : 'Grade'} ${grade[2]}`;
  const ordinal = ordinalGrade(text);
  if (ordinal) return gradeName(ordinal);
  if (/\bkindergart[ae]n\b/i.test(text)) return 'Kindergarten';
  const year = text.match(/\bhigh[\s-]school\s+(freshm[ae]n|sophomores?|juniors?|seniors?)\b|\b(freshm[ae]n|sophomores?|juniors?|seniors?)\s+in\s+high[\s-]school\b/i);
  if (year) return `Grade ${9 + ['fresh', 'sopho', 'junio', 'senio'].indexOf((year[1] ?? year[2]!).toLowerCase().slice(0, 5))}`;
  const after = stageAfterSchool(text);
  if (after) return after;
  if (/\b(?:adults?|professionals?|staff|employees)\b/i.test(text)) return 'Adult learners';
  if (/\b(?:primary|elementary)\b/i.test(text)) return 'Elementary school';
  if (/\b(?:middle[\s-]school)\b/i.test(text)) return 'Middle school';
  if (/\bhigh[\s-]school\b/i.test(text)) return 'High school';
  return null;
}

function chineseLevel(text: string): string | null {
  const stage = text.match(/(小学|初中|高中|大学)(?:[一二三四五六]年级)?/);
  if (stage) return stage[0];
  const short = text.match(/[初高][一二三]/);
  if (short) return short[0];
  const grade = text.match(/(?<![第\d])(\d{1,2}|[一二三四五六七八九十]{1,2})\s*年级/);
  if (grade) return grade[0].replace(/\s+/g, '');
  if (/大[一二三四]|本科|研究生/.test(text)) return '大学';
  if (/成人|职场|员工/.test(text)) return '成人学习者';
  return null;
}

export function guessLevel(text: string): string | null {
  return englishLevel(text) ?? chineseLevel(text);
}

const zhOrDigits = (raw: string): number | null => zhNumber(raw) ?? (/^\d+$/.test(raw) ? Number(raw) : null);
const within = (n: number | null, min: number, max: number): number | null => (n !== null && n >= min && n <= max ? n : null);

const HOUR_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, 'one and a half': 1.5, 'an hour and a half': 1.5 };

/** How long each lesson is: "45-minute lessons", "50 minutes", "two-hour seminars", "1.5 hours", "每节课45分钟", "两小时", "每次2学时". */
export function guessMinutes(text: string): number | null {
  const en = text.match(/\b(\d{1,3})[\s-]*(?:min(?:ute)?s?|mins?)\b/i);
  if (en) return within(Number(en[1]), 5, 600);
  const zh = text.match(/(\d{1,3}|[一二两三四五六七八九十]{1,3})\s*分钟/);
  if (zh) return within(zhOrDigits(zh[1]!), 5, 600);
  if (/\b(?:an?|one)\s+hour\s+and\s+a\s+half\b|\bone\s+and\s+a\s+half[\s-]+hours?\b|一个半(?:小时|钟头)/i.test(text)) return 90;
  // "2-hour", "2 hours" ("three hour-long workshops" are three workshops of an hour), "1.5 hours", "two-hour", "three hours". Not "hours of homework a week".
  const hours = text.match(/\b(\d(?:\.\d)?|one|two|three|four)[\s-]*(?:hours?|hrs?|h)\b(?![\s-]*long\b)(?![\s-]+(?:of|a|per|each)\s+(?:homework|reading|week|study))/i);
  if (hours) {
    const n = /^\d/.test(hours[1]!) ? Number(hours[1]) : HOUR_WORDS[hours[1]!.toLowerCase()]!;
    return within(Math.round(n * 60), 5, 600);
  }
  const zhHours = text.match(/(\d(?:\.\d)?|[一两二三四])\s*(?:个)?(?:小时|钟头)/);
  if (zhHours) return within(Math.round((zhOrDigits(zhHours[1]!) ?? Number(zhHours[1])) * 60), 5, 600);
  // A Chinese class hour (学时) is 45 minutes: "每次课2学时" is a 90-minute class.
  const classHours = text.match(/(?:每(?:次|节|周|讲)(?:课)?|一次)\s*(\d|[一两二三四])\s*(?:个)?学时/);
  if (classHours) return within(zhOrDigits(classHours[1]!)! * 45, 5, 600);
  if (/\b(?:an?|one)[\s-]+hour\b|\bhour[\s-]long\b/i.test(text)) return 60;
  if (/\bhalf[\s-]an[\s-]hour\b|半小时/.test(text)) return 30;
  return null;
}

/** How many quiz questions: "a 10-question quiz", "quizzes of 8 questions", "每课5道题". */
export function guessQuizSize(text: string): number | null {
  const en = text.match(new RegExp(String.raw`\b(${EN_NUMBER})[\s-]+(?:multiple[\s-]choice[\s-]+)?questions?\b`, 'i'));
  if (en) return within(enNumber(en[1]!), 1, 30);
  const zh = text.match(new RegExp(String.raw`(${ZH_NUMBER})\s*(?:道|个)(?:测验|选择|练习)?题`));
  if (zh) return within(zhNumber(zh[1]!), 1, 30);
  return null;
}

const SESSION_WORDS: [RegExp, SessionKind][] = [
  [/^(?:lectures?|讲座|讲授|理论课)$/i, 'lecture'],
  [/^(?:seminars?|tutorials?|discussion(?: sections?)?|研讨课?|讨论课)$/i, 'seminar'],
  [/^(?:labs?|laborator(?:y|ies)|practicals?|实验课?)$/i, 'lab'],
  [/^(?:problem class(?:es)?|recitations?|workshops?|习题课)$/i, 'problems'],
  [/^(?:class(?:es)?|课堂)$/i, 'class'],
];
// "Two 50-minute lectures": an optional count, the length, the kind. "Discussion" alone is usually a part of a lesson, not a meeting.
const EN_SESSION = /\b(?:(two|three|2|3)\s+)?(\d{1,3}|an?|one|two|three)[\s-]*(minutes?|mins?|hours?|hrs?)(?:[\s-]+long)?[\s-]+(lectures?|seminars?|tutorials?|discussion sections?|labs?|laborator(?:y|ies)|practicals?|problem class(?:es)?|recitations?|workshops?|class(?:es)?)\b/gi;
const ZH_SESSION = /(?:([两二三])(?:节|次))?(\d{1,3}|[一二两三四五六七八九十]{1,3})\s*(分钟|小时)\s*的?\s*(讲座|讲授|理论课|研讨课?|讨论课|实验课?|习题课|课堂)/g;

/**
 * The sessions of each lesson when the brief names more than one kind of
 * meeting with its length: "a 50-minute lecture and a 50-minute seminar",
 * "每周50分钟讲授加50分钟研讨". Null when it names fewer than two kinds.
 * The same meeting named twice ("90-minute lectures… each 90-minute lecture")
 * counts once, and a short part of a lesson ("ending with a 10-minute
 * discussion") isn't a meeting of its own.
 */
export function guessSessions(text: string): Session[] | null {
  const found: Session[] = [];
  const add = (times: string | undefined, count: string, unit: string, word: string) => {
    const kind = SESSION_WORDS.find(([re]) => re.test(word.trim()))?.[1];
    const n = /^\d/.test(count) ? Number(count) : /^an?$/i.test(count) ? 1 : (HOUR_WORDS[count.toLowerCase()] ?? zhOrDigits(count) ?? 0);
    const minutes = /^(?:hours?|hrs?|小时)$/i.test(unit) ? n * 60 : n;
    if (!kind || minutes < 5 || minutes > 300) return;
    const repeat = times ? (enNumber(times) ?? zhOrDigits(times) ?? 1) : 1;
    if (!times && found.some((s) => s.kind === kind && s.minutes === minutes)) return;
    for (let i = 0; i < repeat; i++) found.push({ kind, minutes });
  };
  const all: [number, RegExpMatchArray][] = [...[...text.matchAll(EN_SESSION)].map((m) => [m.index, m] as [number, RegExpMatchArray]), ...[...text.matchAll(ZH_SESSION)].map((m) => [m.index, m] as [number, RegExpMatchArray])];
  for (const [, m] of all.sort((a, b) => a[0] - b[0])) add(m[1], m[2]!, m[3]!, m[4]!);
  const longest = Math.max(0, ...found.map((s) => s.minutes));
  // A 75-minute lecture beside a 3-hour lab is a meeting; a 10-minute discussion at the end of one isn't.
  const meetings = found.filter((s) => s.minutes >= 25 && (s.minutes >= 45 || s.minutes * 2 >= longest)).slice(0, 3);
  return meetings.length > 1 && new Set(meetings.map((s) => s.kind)).size > 1 ? meetings : null;
}
