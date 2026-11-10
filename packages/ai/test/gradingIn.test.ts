import { describe, expect, it } from 'vitest';
import { cardIn, gradingIn } from '../src/gradingIn';

const read = (brief: string) => gradingIn(brief).map((g) => `${g.item} ${g.weight}${g.count ? ` x${g.count}` : ''}`);

describe('the graded components a brief states', () => {
  it('are read by rule, in the brief’s own words, with numbered pieces for "two … each"', () => {
    expect(read('Mechanics. Weekly problem sets 20%, recitation group problems 10%, two midterms 20% each, final exam 30%.')).toEqual(['Weekly problem sets 20', 'Recitation group problems 10', 'Midterm 1 20', 'Midterm 2 20', 'Final exam 30']);
    expect(read('Problem sets every two weeks 20%, two midterms 20% each, a cumulative final exam 30%, and iClicker participation 10%.')).toEqual(['Problem sets 20', 'Midterm 1 20', 'Midterm 2 20', 'Cumulative final exam 30', 'iClicker participation 10']);
    expect(read('Grading: problem sets 40%, two quizzes 20%, final exam 40%.')).toEqual(['Problem sets 40', 'Quizzes 20 x2', 'Final exam 40']);
    expect(read('Weekly lab worksheets 20%, a midterm 25%, a final exam 30%, and a data analysis project with a short report 25%, due in week 12.')).toEqual(['Weekly lab worksheets 20', 'Midterm 25', 'Final exam 30', 'Data analysis project 25']);
    expect(read('Weekly lab assignments in R 25%, a take-home midterm 20%, a final exam 25%, and an analysis of a public dataset such as NHANES with a 3,000-word report 30%.')).toEqual(['Weekly lab assignments 25', 'Take-home midterm 20', 'Final exam 25', 'Analysis of a public dataset 30']);
    expect(read('Section participation 15%, two 1,200-word primary-source analysis papers 20% each, a midterm 20% and a final exam 25% with identifications and an essay.')).toEqual(['Section participation 15', 'Primary-source analysis paper 1 20', 'Primary-source analysis paper 2 20', 'Midterm 20', 'Final exam 25']);
    expect(read('Pre-lab quizzes 15%, lab notebook 20%, five formal lab reports 45%, and a practical exam in the last week 20%.')).toEqual(['Pre-lab quizzes 15', 'Lab notebook 20', 'Formal lab reports 45 x5', 'Practical exam 20']);
    expect(read('Four essays 15%, 20%, 20% and 25%, peer review participation 10%, short in-class writing 10%.')).toEqual(['Essay 1 15', 'Essay 2 20', 'Essay 3 20', 'Essay 4 25', 'Peer review participation 10', 'Short in-class writing 10']);
    expect(read('Online reading quizzes before each lecture 10%, in-class group worksheets 10%, three exams 20% each, a cumulative final 20%.')).toEqual(['Online reading quizzes 10', 'In-class group worksheets 10', 'Exam 1 20', 'Exam 2 20', 'Exam 3 20', 'Cumulative final 20']);
    expect(read('Each student builds a research proposal across the term: an annotated bibliography 15%, a literature review draft 20%, a methods section 20%, peer review of two classmates\' drafts 10%, the final proposal of 4,000 words 25%, and seminar leadership of one week\'s discussion 10%.')).toEqual(['Annotated bibliography 15', 'Literature review draft 20', 'Methods section 20', 'Peer review of two classmates\' drafts 10', 'Final proposal 25', 'Seminar leadership 10']);
    expect(read('Homework problems each week 20%, four in-class quizzes 20%, two exams 20% each, a final exam 20%.')).toEqual(['Homework problems 20', 'In-class quizzes 20 x4', 'Exam 1 20', 'Exam 2 20', 'Final exam 20']);
    expect(read('Reading quizzes at the start of most classes 15%, two short analysis papers 15% each, a midterm 20%, a final exam 25%, participation in discussion 10%.')).toEqual(['Reading quizzes 15', 'Short analysis paper 1 15', 'Short analysis paper 2 15', 'Midterm 20', 'Final exam 25', 'Participation in discussion 10']);
    expect(read('Weekly programming labs 25%, six programming assignments 25%, two midterm exams on paper 15% each, final exam 20%.')).toEqual(['Weekly programming labs 25', 'Programming assignments 25 x6', 'Midterm exam 1 15', 'Midterm exam 2 15', 'Final exam 20']);
  });

  it('keeps what follows a colon in a name, and drops what stands in brackets', () => {
    expect(read('Essay 1: personal narrative 15%, Essay 2: rhetorical analysis 20%, Essay 3: researched argument 25%, a portfolio 20%, participation 20%.')).toEqual(['Essay 1: personal narrative 15', 'Essay 2: rhetorical analysis 20', 'Essay 3: researched argument 25', 'Portfolio 20', 'Participation 20']);
    expect(read('Assessment: homework 40%, a final exam (cumulative) 60%.')).toEqual(['Homework 40', 'Final exam 60']);
  });

  it('reads how each runs from the brief’s own clause for it, and leaves unsaid what the clause does not say', () => {
    const cards = (brief: string) => Object.fromEntries(gradingIn(brief).map((g) => [g.item, cardIn(g.said)]));
    const bio = cards('Online reading quizzes before each lecture 10%, in-class group worksheets 10%, three exams 20% each, a cumulative final 20%.');
    expect([bio['Online reading quizzes']!.handIn, bio['In-class group worksheets']!.who, bio['Exam 1']!.handIn]).toEqual(['online', 'group', 'unsaid']);
    const methods = cards('An annotated bibliography 15%, a literature review draft 20%, a methods section 20%, peer review of two classmates\' drafts 10%, the final proposal of 4,000 words 25%, and seminar leadership of one week\'s discussion 10%.');
    expect([methods['Final proposal']!.length, methods['Seminar leadership']!.prepared, methods['Seminar leadership']!.handIn]).toEqual(['4,000 words', true, 'none']);
    const java = cards('Weekly programming labs 25%, six programming assignments 25%, two midterm exams on paper 15% each, final exam 20%.');
    expect([java['Midterm exam 1']!.handIn, java['Weekly programming labs']!.handIn]).toEqual(['paper', 'unsaid']);
    expect(cards('Homework 40%, a final exam 60% that is closed book with a calculator and one formula sheet.')['Final exam']!.allowed).toBe('closed book, a calculator, one formula sheet');
  });

  it('reads nothing where the weights do not come to 100 or no list is given: the outline’s reading stands', () => {
    expect(read('An introduction to psychology, graded as the attached syllabus says.')).toEqual([]);
    expect(read('Quizzes 30%, lab reports 40%, final exam 20%.')).toEqual([]);
    expect(read('About 20% of the course is lab work and 80% lecture.')).toEqual([]);
  });

  it('reads a weight written in brackets after the name, and leaves out the week it is in', () => {
    expect(read('Weekly problem sets 30% (due before the next lecture), a midterm exam in week 3 (30%), a final exam at the end of week 6 (40%).')).toEqual(['Weekly problem sets 30', 'Midterm exam 30', 'Final exam 40']);
    expect(read('Grading: lab reports 30% (each due at the start of the next lab), two midterm exams in weeks 5 and 9 (15% each), weekly online quizzes 10%, and a final exam after week 12 (30%).')).toEqual(['Lab reports 30', 'Midterm exam 1 15', 'Midterm exam 2 15', 'Weekly online quizzes 10', 'Final exam 30']);
  });
});

describe('the meeting a piece is due at', () => {
  it('is read from the brief, and told to the writers where the course has that meeting', async () => {
    const [lab] = gradingIn('Grading: lab reports 30% (each due at the start of the next lab), two midterm exams 15% each, a final exam 40%.');
    expect(cardIn(lab!.said).at).toBe('lab');
    expect(cardIn('weekly problem sets 30% (due before the next lecture)').at).toBe('lecture');
    expect(cardIn('a final paper 40%').at).toBe('');
    const { smallCourse } = await import('./fake');
    const { dueWords } = await import('../src/continuity');
    const base = smallCourse();
    const grading = [{ id: 'g1', item: 'Lab reports', weight: 30, judged: 'levels' as const, card: { who: 'individual' as const, prepared: false, handIn: 'unsaid' as const, allowed: '', length: '', source: '', at: 'lab' as const } }];
    const withSessions = (kinds: ('lecture' | 'lab')[]) => ({ ...base, grading, shape: { ...base.shape, sessions: kinds.map((kind) => ({ kind, minutes: 50 })) } });
    let course = withSessions(['lecture', 'lab']);
    const [a, b] = course.lessonOrder;
    const lesson = { ...course.lessons[a!]!, homework: { kind: 'assignment' as const, toward: 'Lab reports', due: b! } };
    expect(dueWords(course, lesson)).toContain(`"at the start of the lab of ${course.lessons[b!]!.title}"`);
    course = withSessions(['lecture', 'lecture']);
    expect(dueWords(course, lesson)).not.toContain('the lab of');
    // Set in the last lesson, it has no later meeting: the teacher gives the date.
    const end = course.lessonOrder.at(-1)!;
    expect(dueWords(course, { ...course.lessons[end]!, homework: { kind: 'assignment', toward: 'Lab reports', due: '' } })).toContain('on the date your instructor announces');
    expect(dueWords(course, { ...course.lessons[a!]!, homework: { kind: 'assignment', toward: 'Lab reports', due: '' } })).toBe('');
  });
});
