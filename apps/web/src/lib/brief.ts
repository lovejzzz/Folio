import type { Language } from '@folio/core';

/**
 * Pre-fill the three chips under the brief as the teacher types. These read
 * what the teacher wrote; they never decide what the course contains.
 */

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12,
  一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
};

export function guessLessons(text: string): number | null {
  const m =
    text.match(/(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|twelve)[\s-]*(?:lessons?|sessions?|classes|periods|weeks?)/i) ??
    text.match(/([\d一二两三四五六七八九十]{1,2})\s*(?:节课|节|课时|次课|周)/);
  if (!m?.[1]) return null;
  const raw = m[1].toLowerCase();
  const n = /^\d+$/.test(raw) ? Number(raw) : (WORD_NUMBERS[raw] ?? null);
  return n && n >= 1 && n <= 30 ? n : null;
}

export function guessLevel(text: string): string | null {
  const grade = text.match(/\b(?:grade|year)\s*(\d{1,2})\b/i);
  if (grade) return `${/year/i.test(grade[0]) ? 'Year' : 'Grade'} ${grade[1]}`;
  if (/university|undergrad|college|first-year|freshman/i.test(text)) return 'University';
  if (/adult|professional|staff|employees/i.test(text)) return 'Adult learners';
  if (/primary|elementary/i.test(text)) return 'Primary';
  if (/middle school/i.test(text)) return 'Middle school';
  if (/high school/i.test(text)) return 'Grade 9–10';
  const zh = text.match(/(小学|初中|高中|大学)(?:[一二三四五六]年级)?/);
  if (zh) return zh[0];
  return null;
}

export function guessLanguage(text: string): Language | null {
  const cjk = text.match(/[㐀-鿿]/g)?.length ?? 0;
  if (text.trim().length < 4) return null;
  return cjk / text.replace(/\s/g, '').length > 0.3 ? 'zh-CN' : 'en';
}
