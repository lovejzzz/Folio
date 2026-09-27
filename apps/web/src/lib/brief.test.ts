import { describe, expect, it } from 'vitest';
import { SHAPE_LIMITS } from '@folio/core';
import { en } from '../i18n/en';
import { MAX_GUESSED_LESSONS, guessLanguage, guessLessons, guessLevel, guessMinutes, guessQuizSize, guessSessions } from './brief';

describe('reading the brief for the chips', () => {
  it.each([
    ['A 4-lesson introduction to statistics', 4],
    ['six lessons on the French Revolution', 6],
    ['Photosynthesis for year 7, three lessons', 3],
    ['唐诗入门，四节课，初中二年级', 4],
    ['一个单元，10课时', 10],
    ['statistics for grade 11', null],
  ])('%s → %s lessons', (text, n) => expect(guessLessons(text)).toBe(n));

  it.each([
    // A number named as lessons beats one named as weeks, whichever comes first.
    ['over 3 weeks, 12 lessons', 12],
    ['12 lessons over 3 weeks', 12],
    ['Over three weeks: twelve lessons on fractions', 12],
    ['A 3-week unit with 9 classes', 9],
    ['four weeks of 8 sessions on ecology', 8],
    // Rates multiply out.
    ['2 lessons a week for 6 weeks', 12],
    ['one lesson per week over ten weeks', 10],
    ['three 50-minute classes each week for 4 weeks', 12],
    // Words between the number and "lessons".
    ['six short lessons on volcanoes', 6],
    ['12 45-minute lessons on algebra', 12],
    ['8 x 50-minute lessons', 8],
    ['eight 50 minute sessions', 8],
    ['a dozen lessons on the Tudors', 12],
    ['a single lesson on bees', 1],
    ['five seminars on ethics', 5],
    ['Lessons: 7', 7],
    // Only weeks: a weak hint, one lesson a week.
    ['a 3-week unit on volcanoes', 3],
    ['over five weeks', 5],
    // Numbers that are not lesson counts.
    ['grade 10 history lessons', null],
    ['Year 9 lessons on poetry', null],
    ['45-minute lessons for year 8', null],
    ['in lesson 3 we look at graphs', null],
    ['for 11th graders, 5 lessons', 5],
    ['30 students in 4 classes', 4],
    ['a 30-student class, 6 lessons', 6],
    ['40 lessons', null],
    ['a unit on fractions', null],
  ])('%s → %s lessons', (text, n) => expect(guessLessons(text)).toBe(n));

  it.each([
    ['三周，十二节课', 12],
    ['十二节课，分三周上完', 12],
    ['共8课，讲分数', 8],
    ['二十节课的高中物理', 20],
    ['两节课讲完勾股定理', 2],
    ['五堂课的写作课程', 5],
    ['每周两节课，共六周', 12],
    ['每周一次课，持续十周', 10],
    ['三周的单元', 3],
    ['第三课讲光合作用', null],
    ['高三课程复习', null],
    ['面向七年级学生', null],
  ])('%s → %s lessons', (text, n) => expect(guessLessons(text)).toBe(n));

  it('never guesses more lessons than the plan screen allows', () => {
    expect(MAX_GUESSED_LESSONS).toBe(SHAPE_LIMITS.lessons.max);
    expect(guessLessons('20 lessons')).toBe(20);
    expect(guessLessons('21 lessons')).toBeNull();
  });

  it.each([
    ['intro statistics for grade 11', 'Grade 11'],
    ['Photosynthesis for year 7', 'Year 7'],
    ['a first-year university course', 'University'],
    ['唐诗入门，初中二年级', '初中二年级'],
    ['a course on bees', null],
  ])('%s → level %s', (text, level) => expect(guessLevel(text)).toBe(level));

  it.each([
    ['chemistry for 11th graders', 'Grade 11–12'],
    ['a unit for 12th-grade students', 'Grade 11–12'],
    ['eleventh grade English', 'Grade 11–12'],
    ['9th grade biology', 'Grade 9–10'],
    ['tenth graders', 'Grade 9–10'],
    ['7th grade maths', 'Middle school'],
    ['for 3rd graders', 'Primary'],
    ['high school juniors', 'Grade 11–12'],
    ['seniors in high school', 'Grade 11–12'],
    ['high school sophomores', 'Grade 9–10'],
    ['high school physics', 'Grade 9–10'],
    ['Year 11s revising for exams', 'Year 11'],
    ['grade-8 science', 'Grade 8'],
    ['undergraduates in their first term', 'University'],
    ['college freshmen', 'University'],
    ['Graduate seminar in political philosophy', 'University'],
    ["a master's course in finance", 'University'],
    ['new staff at a hospital', 'Adult learners'],
    ['adult learners of Spanish', 'Adult learners'],
    ['elementary school art', 'Primary'],
    ['middle school maths', 'Middle school'],
    ['first-year chemistry', 'University'],
  ])('%s → level %s', (text, level) => expect(guessLevel(text)).toBe(level));

  it.each([
    ['高二物理', '高二'],
    ['初一数学，四节课', '初一'],
    ['高中三年级的复习课', '高中三年级'],
    ['小学五年级科学', '小学五年级'],
    ['七年级历史', '七年级'],
    ['面向 11 年级的国际学校学生', '11年级'],
    ['大一新生的写作课', '大学'],
    ['研究生统计课', '大学'],
    ['给公司员工的培训', '成人学习者'],
    ['唐诗入门', null],
  ])('%s → level %s', (text, level) => expect(guessLevel(text)).toBe(level));

  it('names ordinal grades with the level chip’s own options', () => {
    for (const text of ['11th graders', '9th grade', '7th grade', '2nd grade']) {
      expect(en.levels).toContain(guessLevel(text));
    }
  });

  it('detects Chinese briefs', () => {
    expect(guessLanguage('唐诗入门，四节课')).toBe('zh-CN');
    expect(guessLanguage('The French Revolution')).toBe('en');
    expect(guessLanguage('ab')).toBeNull();
  });
});

describe('lesson length and quiz size from the brief', () => {
  it.each([
    ['Photosynthesis for Year 7, four lessons of 50 minutes.', 50],
    ['six 45-minute lessons on the French Revolution', 45],
    ['Three hour-long workshops', 60],
    ['Two lessons, an hour each', 60],
    ['唐诗入门，三节课，每节课45分钟', 45],
    ['古诗词鉴赏入门，两节课，每节四十分钟', 40],
    ['每节课一小时', 60],
    ['Twelve lessons for grade 11', null],
    ['Graduate seminar. Six two-hour seminars.', 120],
    ['weekly 2-hour lectures', 120],
    ['lectures of 1.5 hours', 90],
    ['an hour and a half each week', 90],
    ['three hours of reading a week, one-hour tutorials', 60],
    ['研究生讨论课，每次两小时', 120],
    ['每次课2学时，共16周', 90],
    ['每节课一个半小时', 90],
  ])('%s → %s minutes', (brief, minutes) => expect(guessMinutes(brief)).toBe(minutes));

  it.each([
    ['a short 10-question quiz each lesson', 10],
    ['quizzes of eight questions', 8],
    ['每课5道题的小测验', 5],
    ['每节课做十道选择题', 10],
    ['Four lessons for grade 9', null],
  ])('%s → %s questions', (brief, size) => expect(guessQuizSize(brief)).toBe(size));
});

describe('guessSessions', () => {
  it.each([
    ['Four weeks, each a 50-minute lecture and a 50-minute seminar.', [{ kind: 'lecture', minutes: 50 }, { kind: 'seminar', minutes: 50 }]],
    ['A one-hour lecture and a two-hour lab every week', [{ kind: 'lecture', minutes: 60 }, { kind: 'lab', minutes: 120 }]],
    ['Weekly: 90 min lectures plus a 45-minute tutorial', [{ kind: 'lecture', minutes: 90 }, { kind: 'seminar', minutes: 45 }]],
    ['每周50分钟讲授加50分钟研讨', [{ kind: 'lecture', minutes: 50 }, { kind: 'seminar', minutes: 50 }]],
    ['每周一次90分钟的理论课和一次两小时的实验课', [{ kind: 'lecture', minutes: 90 }, { kind: 'lab', minutes: 120 }]],
  ])('%s', (brief, sessions) => expect(guessSessions(brief)).toEqual(sessions));

  it.each(['Four 50-minute lessons with practical work in each', 'Weekly 90-minute lectures', 'A 50-minute class'])('none in %s', (brief) => expect(guessSessions(brief)).toBeNull());
});

describe('guessLessons with sessions and rates', () => {
  it.each([
    ['初二物理：浮力。三周，每周一节40分钟的课堂和一节40分钟的实验课。', 3],
    ['Four weeks, each a 50-minute lecture and a 50-minute seminar.', 4],
    ['Ten weeks, one lecture a week.', 10],
    ['六周，每周两节课', 12],
    ['每周一节课', null],
  ])('%s → %s', (brief, n) => expect(guessLessons(brief)).toBe(n));
});
