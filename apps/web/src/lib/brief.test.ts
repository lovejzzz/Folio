import { describe, expect, it } from 'vitest';
import { SHAPE_LIMITS } from '@folio/core';
import { en } from '../i18n/en';
import { MAX_GUESSED_LESSONS, guessDelivery, guessLessons, guessLevel, guessMinutes, guessQuizSize, guessSessions } from './brief';

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
    ['Competitive strategy for MBA students: a 10-week quarter, two 90-minute case discussions a week.', 20],
    ['Principles of microeconomics for undergraduates: a 14-week semester, two 75-minute lectures a week.', 28],
    ['A 12-week graduate seminar, one 2.5-hour meeting a week.', 12],
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
    ['41 lessons', null],
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
    expect(guessLessons('40 lessons')).toBe(40);
    expect(guessLessons('41 lessons')).toBeNull();
  });

  it.each([
    ['intro statistics for grade 11', 'Grade 11'],
    ['Photosynthesis for year 7', 'Year 7'],
    ['a first-year university course', 'Undergraduate'],
    ['唐诗入门，初中二年级', '初中二年级'],
    ['a course on bees', null],
  ])('%s → level %s', (text, level) => expect(guessLevel(text)).toBe(level));

  it.each([
    ['chemistry for 11th graders', 'Grade 11'],
    ['a unit for 12th-grade students', 'Grade 12'],
    ['eleventh grade English', 'Grade 11'],
    ['9th grade biology', 'Grade 9'],
    ['tenth graders', 'Grade 10'],
    ['7th grade maths', 'Grade 7'],
    ['for 3rd graders', 'Grade 3'],
    ['high school juniors', 'Grade 11'],
    ['seniors in high school', 'Grade 12'],
    ['high school sophomores', 'Grade 10'],
    ['high school freshmen', 'Grade 9'],
    ['high school physics', 'High school'],
    ['kindergarten phonics', 'Kindergarten'],
    ['Year 11s revising for exams', 'Year 11'],
    ['grade-8 science', 'Grade 8'],
    ['undergraduates in their first term', 'Undergraduate'],
    ['college freshmen', 'Undergraduate'],
    ['Graduate seminar in political philosophy', 'Graduate (master’s)'],
    ["a master's course in finance", 'Graduate (master’s)'],
    ['a PhD seminar on causal inference', 'Doctoral (PhD)'],
    ['doctoral students in education', 'Doctoral (PhD)'],
    ['new staff at a hospital', 'Adult learners'],
    ['adult learners of Spanish', 'Adult learners'],
    ['elementary school art', 'Elementary school'],
    ['middle school maths', 'Middle school'],
    ['first-year chemistry', 'Undergraduate'],
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

  it('names levels with the level menu’s own options', () => {
    const menu = en.levelGroups.flatMap((g) => [g.name, ...g.grades]);
    for (const text of ['11th graders', '9th grade', '7th grade', '2nd grade', 'kindergarten', 'high school chemistry', 'college algebra', 'a master’s seminar', 'PhD students', 'adult learners', 'elementary art', 'middle school band']) {
      expect(menu).toContain(guessLevel(text));
    }
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
    ['a 12-week course, each week a 75-minute lecture and a 50-minute computer lab in R', [{ kind: 'lecture', minutes: 75 }, { kind: 'lab', minutes: 50 }]],
    ['A 60-minute lecture and a 90-minute hands-on workshop each week', [{ kind: 'lecture', minutes: 60 }, { kind: 'problems', minutes: 90 }]],
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

describe('guessSessions and guessLessons on briefs that misled them', () => {
  it.each([
    ['Six 50-minute classes on the Cold War, each ending with a 10-minute discussion.', null],
    ['Six 90-minute lectures on Kant. Each 90-minute lecture ends with questions.', null],
    ['五节40分钟的课堂，每节包含10分钟的讨论课', null],
    ['Two 50-minute lectures and a 50-minute seminar each week.', [{ kind: 'lecture', minutes: 50 }, { kind: 'lecture', minutes: 50 }, { kind: 'seminar', minutes: 50 }]],
    // Found in QA: the lecture was dropped as "a short part" of the lab.
    ['Organic Chemistry I: each week one 75-minute lecture and one 3-hour lab, 14 weeks.', [{ kind: 'lecture', minutes: 75 }, { kind: 'lab', minutes: 180 }]],
  ])('%s', (brief, sessions) => expect(guessSessions(brief)).toEqual(sessions));
  it.each([
    ['Eight lessons over two weeks. Each lesson is a 45-minute class and a 45-minute lab.', 8],
    ['12 lessons over 3 weeks, each a 50-minute lecture and a 50-minute seminar', 12],
    ['Four weeks, each a 50-minute lecture and a 50-minute seminar.', 4],
    ['初二物理：浮力。三周，每周一节40分钟的课堂和一节40分钟的实验课。', 3],
    ['Organic Chemistry I: each week one 75-minute lecture and one 3-hour lab, 14 weeks.', 14],
    // Found in QA: a rate is how often, not how many; 36 × 5 is more than a course holds.
    ['AP US History, full school year, 36 weeks, five 50-minute periods a week.', null],
    ['Two periods a week for 6 weeks', 12],
  ])('%s → %s lessons', (brief, n) => expect(guessLessons(brief)).toBe(n));
});

describe('weeks in a brief', () => {
  it('never takes a week that owns something for the length of the course', () => {
    expect(guessLessons("A 13-week seminar, one 3-hour meeting a week. Each student presents one week's readings.")).toBe(13);
    expect(guessLessons('Two classes a week for six weeks; each week’s quiz is on Friday.')).toBe(12);
  });
});

describe('how the course meets', () => {
  it('reads how an online course meets from the brief, and nothing from "online" alone', () => {
    expect(guessDelivery('A 14-week asynchronous online course for undergraduates')).toBe('online-async');
    expect(guessDelivery('Self-paced online course on statistics, no live sessions')).toBe('online-async');
    expect(guessDelivery('Online course meeting on Zoom twice a week')).toBe('online-sync');
    expect(guessDelivery('A synchronous online graduate seminar, one 150-minute session a week')).toBe('online-sync');
    expect(guessDelivery('Online: an asynchronous module each week plus one live 75-minute session')).toBe('online-mixed');
    expect(guessDelivery('An online course in statistics')).toBe('inperson');
    expect(guessDelivery('Eight 50-minute lessons on ratios')).toBe('inperson');
  });
});
