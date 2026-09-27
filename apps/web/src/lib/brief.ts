import type { Language } from '@folio/core';

/**
 * Pre-fill the three chips under the brief as the teacher types. These read
 * what the teacher wrote; they never decide what the course contains.
 *
 * This module is on the first-load path, so it imports nothing at runtime
 * from @folio/core (which would pull in Zod).
 */

/** The most lessons a guess may give: SHAPE_LIMITS.lessons.max in @folio/core (a test keeps them equal). */
export const MAX_GUESSED_LESSONS = 20;

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
const EN_FILLER = String.raw`(?:(?!(?:weeks?|days?|months?|terms?|years?|of|per|a|an|each|every|and|or|with|in|for|on|to)\b)[a-z0-9]+(?:-[a-z0-9]+)*[\s-]+){0,2}`;
const ZH_LESSON = String.raw`(?:个)?(?:节课|节|课时|次课|堂课|堂|讲|课(?!程|本|文))`;
// A number that is a grade, a lesson's own number or a duration is not a count of lessons.
const EN_NOT_COUNT_BEFORE = String.raw`(?<!\b(?:grade|year|years|age|ages|lesson|unit|chapter|week|level|stage|form|no\.?|number)[\s-]*)`;
const EN_NOT_COUNT_AFTER = String.raw`(?![\s-]*(?:min(?:ute)?s?|hours?|hrs?|h)\b)`;
const EN_COUNT = String.raw`${EN_NOT_COUNT_BEFORE}\b(${EN_NUMBER})${EN_NOT_COUNT_AFTER}`;
const ZH_NOT_COUNT_BEFORE = String.raw`(?<![第\d零一二两三四五六七八九十高初大])`;

/** The first match of any pattern that reads as a lesson count in range. */
function firstCount(text: string, patterns: [source: string, read: (m: RegExpMatchArray) => number | null][]): number | null {
  for (const [source, read] of patterns) {
    for (const m of text.matchAll(new RegExp(source, 'gi'))) {
      const n = inRange(read(m));
      if (n !== null) return n;
    }
  }
  return null;
}

const times = (a: number | null, b: number | null): number | null => (a && b ? a * b : null);

/** "2 lessons a week for 6 weeks" → 12; "每周两节课，共六周" → 12. */
function lessonsFromRate(text: string): number | null {
  return firstCount(text, [
    [String.raw`${EN_COUNT}[\s-]+${EN_FILLER}${EN_LESSON}[\s-]+(?:a|per|each|every)[\s-]+week\b.*?\b(${EN_NUMBER})[\s-]+weeks?\b`, (m) => times(enNumber(m[1]!), enNumber(m[2]!))],
    [String.raw`(?:每周|一周|每星期)(${ZH_NUMBER})\s*${ZH_LESSON}.*?(${ZH_NUMBER})\s*(?:周|个星期|星期)`, (m) => times(zhNumber(m[1]!), zhNumber(m[2]!))],
  ]);
}

/** A number attached to the word for a lesson: "12 lessons", "lessons: 8", "十二节课". Never "lesson 3" or "第三课". */
function lessonsNamed(text: string): number | null {
  return firstCount(text, [
    [String.raw`${EN_COUNT}(?:[\s-]*(?:x|×))?[\s-]+${EN_FILLER}${EN_LESSON}`, (m) => enNumber(m[1]!)],
    [String.raw`\b(?:lessons|sessions|classes)\s*[:：=]\s*(\d{1,2})\b`, (m) => enNumber(m[1]!)],
    [String.raw`${ZH_NOT_COUNT_BEFORE}(${ZH_NUMBER})\s*${ZH_LESSON}`, (m) => zhNumber(m[1]!)],
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
  return lessonsFromRate(text) ?? lessonsNamed(text) ?? lessonsFromWeeks(text);
}

/** US-style grade bands, as the level chip offers them. */
function gradeBand(grade: number): string | null {
  if (grade >= 1 && grade <= 5) return 'Primary';
  if (grade >= 6 && grade <= 8) return 'Middle school';
  if (grade === 9 || grade === 10) return 'Grade 9–10';
  if (grade === 11 || grade === 12) return 'Grade 11–12';
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
  if (ordinal) return gradeBand(ordinal);
  if (/\b(?:high[\s-]school|secondary[\s-]school)\s+(?:juniors?|seniors?)\b|\b(?:juniors?|seniors?)\s+in\s+high[\s-]school\b/i.test(text)) return 'Grade 11–12';
  if (/\b(?:high[\s-]school)\s+(?:freshm[ae]n|sophomores?)\b|\b(?:freshm[ae]n|sophomores?)\s+in\s+high[\s-]school\b/i.test(text)) return 'Grade 9–10';
  if (/\b(?:university|undergrad(?:uate)?s?|college|first-year|freshm[ae]n)\b/i.test(text)) return 'University';
  if (/\b(?:adults?|professionals?|staff|employees)\b/i.test(text)) return 'Adult learners';
  if (/\b(?:primary|elementary)\b/i.test(text)) return 'Primary';
  if (/\b(?:middle[\s-]school)\b/i.test(text)) return 'Middle school';
  if (/\bhigh[\s-]school\b/i.test(text)) return 'Grade 9–10';
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

export function guessLanguage(text: string): Language | null {
  const cjk = text.match(/[㐀-鿿]/g)?.length ?? 0;
  if (text.trim().length < 4) return null;
  return cjk / text.replace(/\s/g, '').length > 0.3 ? 'zh-CN' : 'en';
}

const zhOrDigits = (raw: string): number | null => zhNumber(raw) ?? (/^\d+$/.test(raw) ? Number(raw) : null);
const within = (n: number | null, min: number, max: number): number | null => (n !== null && n >= min && n <= max ? n : null);

/** How long each lesson is: "45-minute lessons", "50 minutes", "an hour", "每节课45分钟", "一小时". */
export function guessMinutes(text: string): number | null {
  const en = text.match(/\b(\d{1,3})[\s-]*(?:min(?:ute)?s?|mins?)\b/i);
  if (en) return within(Number(en[1]), 5, 600);
  const zh = text.match(/(\d{1,3}|[一二两三四五六七八九十]{1,3})\s*分钟/);
  if (zh) return within(zhOrDigits(zh[1]!), 5, 600);
  if (/\b(?:an?|one)[\s-]+hour\b|\bhour[\s-]long\b|\b60[\s-]*min/i.test(text) || /(?:一|1)\s*(?:个)?小时/.test(text)) return 60;
  if (/\bhalf[\s-]an[\s-]hour\b|半小时/.test(text)) return 30;
  if (/\b(?:an?|one)\s+hour\s+and\s+a\s+half\b|一个半小时/.test(text)) return 90;
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
