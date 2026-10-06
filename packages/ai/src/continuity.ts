import { hasModulePages, lessonPieces, orderedLessons, type Course, type Lesson } from '@folio/core';
import { filesSoFar } from './earlierFiles';
import { moduleDigest, moduleSummary } from './online';
import { EACH_TIME, otherPieces, workOf } from './workJobs';

/** Whether a lesson holds a piece of this kind for this component, as its main piece or beside it. */
const holds = (l: Lesson, kind: string, toward: string) => lessonPieces(l).some((p) => p.kind === kind && p.toward.trim() === toward);

/**
 * What one lesson's materials owe the lessons around it. Each lesson is written in its own call, and a lesson
 * written knowing only the others' titles taught its own version of what they taught: a grade 2 course named a
 * bean plant's stages five ways in one lesson and four in another, and moved the beans students had set
 * sprouting in bags on the window into jars.
 */

/** Room for the earlier lessons in a plan request: a long course keeps the nearest in full. */
const EARLIER_BUDGET = 14000;
/** A week's page is several plans long: at a plan's budget only the week just before was shown whole. */
const EARLIER_PAGES_BUDGET = 26000;

const clipNote = (note: string, room = 240) => {
  const flat = note.trim().replace(/\s+/g, ' ');
  return flat.length > room ? `${flat.slice(0, room)}…` : flat;
};

function lessonDigest(lesson: Lesson, course: Course, notes = 240): string {
  const ideas = lesson.keyIdeas.map((k) => `  - ${k}`).join('\n');
  const terms = lesson.vocabulary.map((v) => v.term).join(', ');
  // Whole descriptions, and the start of the notes: a later lesson used a floor number line it couldn't see was
  // marked only in fourths, from notes the digest left out.
  const flow = lesson.segments
    .map((s) => `  - ${s.title}: ${s.description.replace(/\n+/g, ' ')}${s.teacherNotes.trim() ? ` (Notes: ${clipNote(s.teacherNotes, notes)})` : ''}`)
    .join('\n');
  // The homework too: no plan set, collected or used the homework the lesson before had given.
  const homework = lesson.taskIds.map((id) => course.tasks[id]).flatMap((t) => (t?.kind === 'assignment' ? [`"${t.title}": ${clipNote(t.prompt)}`] : []))[0];
  return [`"${lesson.title}"`, ideas && ` Key ideas:\n${ideas}`, terms && ` Terms: ${terms}`, flow && ` What students did:\n${flow}`, homework && ` Homework it set: ${homework}`].filter(Boolean).join('\n');
}

/** A lesson too far back to show whole, in a few lines: what it taught, the terms it gave, and what students did in it, by title. */
function briefDigest(lesson: Lesson): string {
  const did = lesson.page?.length ? lesson.page.flatMap((b) => (b.type === 'heading' && b.level === 2 ? [b.text] : [])) : lesson.segments.map((s) => s.title);
  const terms = lesson.vocabulary.map((v) => v.term).join(', ');
  return [`"${lesson.title}"`, lesson.keyIdeas.length ? ` Key ideas: ${lesson.keyIdeas.join(' ')}` : '', terms && ` Terms: ${terms}`, did.length ? ` What students did: ${did.join('; ')}` : ''].filter(Boolean).join('\n');
}

/** How much of a segment's notes the two lessons just before are shown. */
const NEAR_NOTES = 1600;

/** Room for the lessons further back, each in brief. */
const BRIEF_BUDGET = 6000;

/**
 * The planned lessons before this one, nearest last: the nearest whole, within the budget, and those further back
 * in brief. Left out whole, they left a late lesson knowing nothing of what the early ones taught or named.
 */
function digests(course: Course, lesson: Lesson, budget: number): string {
  const before = orderedLessons(course).slice(0, course.lessonOrder.indexOf(lesson.id)).filter((l) => l.segments.length || l.page?.length);
  const kept: string[] = [];
  let used = 0;
  let whole = before.length;
  for (; whole > 0; whole--) {
    const l = before[whole - 1]!;
    // The two lessons just before are shown their notes at length: a model text lives there, and cut at 240 characters
    // it was written again, differently, in each of four lessons.
    const digest = l.page?.length ? moduleDigest(l, course) : lessonDigest(l, course, before.length - whole < 2 ? NEAR_NOTES : 240);
    if (used + digest.length > budget) break;
    kept.unshift(digest);
    used += digest.length;
  }
  const brief: string[] = [];
  let room = BRIEF_BUDGET;
  for (const l of before.slice(0, whole).reverse()) {
    const digest = briefDigest(l);
    if (digest.length > room) break;
    brief.unshift(digest);
    room -= digest.length;
  }
  return [brief.length ? `Further back, in brief:\n${brief.join('\n')}` : '', ...kept].filter(Boolean).join('\n\n');
}

/**
 * What a graded piece of the whole course can draw on. Shown only its own lesson, a final essay asked for
 * "three named documents from the course packet" when no lesson had handed out a packet.
 */
export function courseSoFar(course: Course, lesson: Lesson): string {
  const kept = digests(course, lesson, EARLIER_BUDGET / 2);
  return kept ? `The lessons before this one:\n${kept}\n\nThe assignment draws on what students really did and were given in these lessons, named as the lessons name it, and asks for nothing the course never gave them.` : '';
}

/** The lessons before this one that are already planned, for the plan that follows them. */
export function earlierLessons(course: Course, lesson: Lesson): string {
  // A first lesson planned as any other assumed two chapters read and a discussion leader chosen in advance.
  if (course.lessonOrder[0] === lesson.id) return 'This is the first lesson of the course: nothing has been read, set or chosen before it. It introduces the course, how it is assessed and what students need.';
  const kept = digests(course, lesson, hasModulePages(course) ? EARLIER_PAGES_BUDGET : EARLIER_BUDGET);
  if (!kept) return '';
  const files = filesSoFar(course, lesson);
  return `The lessons before this one, as already planned:\n${kept}\n\n${files ? `${files}\n\n` : ''}This lesson follows them: use the same names, terms, stages, examples and classroom setups, build on what they taught rather than teaching it again differently or presenting it as new, and when something they started goes on in this lesson (an experiment, a project, a class chart), continue it as they set it up and finish what they left for this lesson (a result to measure, homework to collect or use, work to hand back), on a realistic timeline for how often the class meets (seeds take days to sprout, paint hours to dry). Under vocabulary, list only the terms this lesson introduces: the terms above are already taught, and when this lesson uses them it keeps their meaning.`;
}

/**
 * A lesson lists the vocabulary it introduces. Asked for that, plans still listed terms again, and the review
 * spent its notes on them: terms the lessons before this one list are dropped here instead.
 */
export function newVocabulary<T extends { vocabulary: { term: string }[] }>(plan: T, course: Course, lesson: Lesson): T {
  const known = new Set(
    orderedLessons(course)
      .slice(0, Math.max(0, course.lessonOrder.indexOf(lesson.id)))
      .flatMap((l) => l.vocabulary.map((v) => v.term.trim().toLowerCase())),
  );
  return { ...plan, vocabulary: plan.vocabulary.filter((v) => !known.has(v.term.trim().toLowerCase())) };
}

/**
 * The steps toward a larger piece, lesson by lesson, are one path: written each on its own, three lessons of a
 * course set the same step, "Choose a study for your research summary".
 */
export function earlierSteps(course: Course, lesson: Lesson): string {
  const toward = lesson.homework.toward.trim();
  const before = orderedLessons(course)
    .slice(0, course.lessonOrder.indexOf(lesson.id))
    .filter((l) => holds(l, 'step', toward));
  // Told the titles alone, the next step changed its title and asked the same thing.
  const steps = before.flatMap((l) => {
    const t = workOf(course, l, toward);
    return t?.kind === 'assignment' ? [`"${t.title}": ${clipNote(t.prompt)}`] : [];
  });
  return steps.length ? `Earlier lessons already set these steps toward it:\n${steps.map((s) => `- ${s}`).join('\n')}\nThis is the next step: it asks for something those did not, and builds on them.` : '';
}

/**
 * A graded component set as an assignment in several lessons is shared between them. Told only its name, each
 * lesson wrote the whole component: the same title twice, each claiming the component's full weight.
 */
export function sharedComponent(course: Course, lesson: Lesson): string {
  const toward = lesson.homework.toward.trim();
  if (!toward) return '';
  const sharing = orderedLessons(course).filter((l) => holds(l, lesson.homework.kind, toward));
  if (sharing.length < 2) return '';
  const place = sharing.findIndex((l) => l.id === lesson.id) + 1;
  if (lesson.homework.kind === 'inclass' && lesson.homework.standing !== false) return `"${toward}" is taken over ${sharing.length} lessons, a group in each: write it once and whole, since the later lessons use it as it stands, with running notes that say who goes in which lesson: so it names nothing only this lesson has (its reading, its case, its volunteer), and what students do each time is left to each lesson's plan.`;
  // Papers of one component (two quizzes) told only "cover the lessons so far" came out alike, title and half the questions.
  if (lesson.homework.kind === 'test') {
    const earlier = workOf(course, sharing[place - 2], toward);
    const before = earlier?.kind === 'assignment' ? ` The paper before it, "${earlier.title}", asked: ${clipNote(earlier.steps.join(' | '), 900)} Repeat none of it.` : '';
    return `"${toward}" is ${sharing.length} papers, and this is number ${place}: title it so (for example "Quiz ${place}" with what it covers), and test what was taught since the paper before it, not the same ground again.${before}`;
  }
  const told = `"${toward}" is set as an assignment in ${sharing.length} lessons, and this is part ${place} of ${sharing.length}: write only the part that belongs to this lesson (when the brief names the component's parts and when each is due, this is the part the brief places here, as the brief describes it, and it may ask for everything taught so far), title it so it can be told apart from the other parts (for example "${toward}: " followed by what this part is), and never say this part alone carries the component's whole weight. Students read it as an assignment in its own right: no "part", "component" or count of parts in its text.`;
  // Written each on its own, weekly responses in one course asked for 300, 400 and 600 words.
  const before = sharing[place - 2];
  const last = workOf(course, before, toward);
  if (!last || last.kind !== 'assignment') return told;
  // Its tasks too: told only the prompt, the fourth problem set repeated a problem from the third.
  const tasks = clipNote(last.steps.join(' | '), 700);
  return `${told} The part before this one, "${last.title}", asked: ${last.prompt}${tasks ? ` Its tasks: ${tasks}` : ''} Keep this part's length, format and demand in line with it, and repeat none of its tasks.`;
}

/**
 * Writing a plan again after its review left notes: the new plan is told what the old one got wrong. Written
 * afresh without them, a plan made the same mistakes again, or new ones as often as not.
 */
export function earlierNotes(lesson: Lesson): string {
  const notes = (lesson.gen.plan?.flags ?? []).flatMap((f) => (f.code === 'reviewNote' ? [`- ${f.values.where}: ${f.values.text}`] : []));
  if (!notes.length) return '';
  return `A review of the previous version of this plan found these problems. Write the plan so that none of them is in it:\n${notes.join('\n')}`;
}

/** What the lesson sets as homework, when it is due and what is handed in today, so its plan and materials agree: untold, each plan guessed. */
/** When the work a lesson sets is handed in, in the words a plan or an assignment can use. */
/** When a piece is due, as a clause: "due at the start of the next lesson". Empty when it is not handed in at a later lesson. */
function dueWhen(course: Course, lesson: Lesson): string {
  const due = lesson.homework.due ? course.lessons[lesson.homework.due] : undefined;
  const gap = due ? course.lessonOrder.indexOf(due.id) - course.lessonOrder.indexOf(lesson.id) : 0;
  if (!due || gap < 1) return '';
  // A week's work is due on its Sunday: told "at the start of the next lesson", an online assignment gave a room course's deadline.
  if (hasModulePages(course)) return `due by Sunday night ${gap === 1 ? 'of next week' : `${gap} weeks from now`}`;
  // One wording, given: named "by what it covers", one paper was due at "the meeting on writing the literature review" in its
  // brief and "the meeting on developing literature review drafts" on the slide, and a student could not tell which meeting.
  // In a lesson of several meetings "next time" is also its own next meeting: a set due "at the start of next time" was announced in the third lecture, before the recitation.
  const met = course.shape.sessions.length > 1;
  if (gap === 1 && met) return 'due at the first meeting of the next lesson (students are told so in those words, with that lesson\'s title, never "next time", which is also this lesson\'s next meeting)';
  return gap === 1 ? 'due at the start of the next lesson' : `due at the start of the lesson ${gap} lessons after this one, "${due.title}" (wherever students are told the deadline it is in these words, "at the start of the class on ${due.title}", never a paraphrase, a count of lessons, or a week or date of your own)`;
}

export function dueWords(course: Course, lesson: Lesson): string {
  const when = dueWhen(course, lesson);
  return when ? `It is ${when}.` : '';
}

/**
 * The lesson a piece is due at, for work the brief has students do to prepare for it. "Online reading quizzes
 * before each lecture" were written on the lecture just given, so the quiz due before a lecture never touched its reading.
 */
export function dueLesson(course: Course, lesson: Lesson): string {
  const due = lesson.homework.due ? course.lessons[lesson.homework.due] : undefined;
  if (!due) return '';
  const works = readBefore(due).works;
  return ` The lesson it is due at is "${due.title}": ${due.summary.trim()}${works.length ? ` Students read for it: ${works.join('; ')}.` : ''}`;
}

/**
 * A piece graded in class that later lessons score again with the rubric written here (participation, a seminar
 * turn): told only of its own lesson, a participation rubric graded "explains the phone-checking behavior", and the
 * next lesson's subfield matching was scored with it.
 */
export function inClassAgain(course: Course, lesson: Lesson): string {
  const toward = lesson.homework.toward.trim();
  const graded = course.grading.some((g) => g.item.trim() === toward);
  const once = orderedLessons(course).filter((l) => holds(l, 'inclass', toward)).length < 2;
  return toward && graded && once ? ` "${toward}" is a share of the course grade earned in other lessons too, and they score with this same brief and rubric: so its steps and criteria hold for any lesson's activity and name nothing of this one's, and the running notes say how it is scored in a lesson and recorded.` : '';
}

/** The brief of a piece graded in class that an earlier lesson already wrote, so a later plan runs it as it was set. */
function briefSoFar(course: Course, lesson: Lesson): string {
  const toward = lesson.homework.toward.trim();
  const first = orderedLessons(course)
    .slice(0, course.lessonOrder.indexOf(lesson.id))
    .find((l) => holds(l, 'inclass', toward));
  const brief = toward ? workOf(course, first, toward) : undefined;
  if (brief?.kind !== 'assignment') return '';
  const rubric = brief.rubricId ? course.rubrics[brief.rubricId] : undefined;
  return ` Its brief is already written, and this lesson runs it as it stands: ${clipNote(brief.steps.join(' | '), 600)}${rubric ? ` It is scored on: ${rubric.criteria.map((c) => c.name).join('; ')}.` : ''}`;
}

export function homeworkLine(course: Course, lesson: Lesson): string {
  const toward = lesson.homework.toward.trim();
  const collected = orderedLessons(course)
    .filter((l) => l.id !== lesson.id)
    .flatMap((l) =>
      lessonPieces(l)
        .filter((p) => p.due === lesson.id)
        .map((p) => {
          // By what was actually set: named by what it counts toward, a step's due day collected the whole paper.
          const set = workOf(course, l, p.toward.trim());
          const what = set?.kind === 'assignment' ? `"${set.title}"` : p.kind === 'step' ? 'the short step' : `"${p.toward.trim() || 'the assignment'}"`;
          // A standing piece is about the lesson it is due at: told where it was set, plans collected papers "on last time's readings".
          if (p.standing) return `${what} (the one written for this lesson, on this lesson's reading or topic)`;
          return `${what} (set in "${l.title}"${p.kind === 'step' ? ', an ungraded step' : ''})`;
        }),
    );
  // Set, due and collected were three guesses: one piece had two due dates and a close that said "give its due date".
  const due = `${otherPieces(lesson, (p) => dueWhen(course, { ...lesson, homework: p }))}${collected.length ? ` Due at the start of this lesson: ${collected.join('; ')}. The plan collects it by name: its tasks were written apart from this plan, so no segment counts on their details (how many items, which terms).` : ''}`;
  // "Sets no homework" beside a standing weekly paper had half the plans run the paper in class instead.
  // A close \"handed out the brief\" of a 20% paper that this lesson did not hold, and no brief existed.
  const only = ' No other graded piece is set, handed out or collected in this lesson than those named here.';
  if (lesson.homework.kind === 'none') return `${(lesson.also ?? []).some((p) => p.kind !== 'none') ? '' : 'This lesson sets no homework.'}${due}${only}`.trim();
  const named = toward ? `"${toward}"` : 'a graded piece';
  // The paper and the rubric are their own material: a plan that also wrote them gave the lesson two.
  if (lesson.homework.kind === 'test') return `This lesson holds ${toward ? `the graded test ${named}` : 'a graded test'}, written separately as a paper with its questions, key and points: the plan gives it its time and conditions (or, when the summary says it is sat after the course ends, reviews for it and says when and how it is sat), and writes no questions.${due}${only}`;
  if (lesson.homework.kind === 'inclass') return `This lesson holds ${named}, done in class and graded with a rubric written separately: the plan runs it, with time for every student to do all of it (when each is heard or scored one by one, the minutes are one student's multiplied by the class the brief describes, with the moves between them: where that does not fit, it is scored from what is handed in or over several lessons), and writes no criteria; written work is handed in and scored after class (only what is performed, a talk or a discussion led, is scored as it happens), with no helpers the brief does not name; its tasks are printed with the piece, so the plan names no other sheet for it; what a student is graded for preparing or deciding (the questions of a discussion they lead, what a talk says) is left to them and never scripted.${lesson.homework.standing ? ` Its${EACH_TIME.slice(5)}.` : ''}${briefSoFar(course, lesson)}${due}${only}`;
  const set = `which the plan has the teacher set before students leave, naming it and when it is due, without spelling out its tasks or naming files and handouts it may not have; work the brief has students do online is handed in online by then, and never collected in class. ${dueWords(course, lesson)}`.trim();
  if (lesson.homework.kind === 'step') return `For homework this lesson sets a short ungraded step${toward ? ` toward "${toward}"` : ''}, ${set}${due}${only}`;
  // A plan gave the first weekly memo a subject of its own ("one page on your team's program") beside a brief that asked for the reading.
  const one = lesson.homework.standing ? ' Its brief is one text for every time it is set, on the reading or topic of the lesson it is due at: the plan gives it no other subject.' : '';
  return `For homework this lesson sets a graded assignment${toward ? ` that counts toward "${toward}" (the plan calls it by that name, not one of its own)` : ''}, ${set}${one}${due}${only}`;
}

/** A reading that names no work: "Journal articles by Putnam", "selected readings on the topic". */
const VAGUE = /^(journal |selected |assorted |various |recent |key )?(articles?|papers?|readings?|essays?|selections?|excerpts?|chapters?)\b/i;

/**
 * What students read before a lesson. The brief's own readings come first; the works Folio proposed stand in
 * when the brief gave none for the lesson, or gave only a description of them: a seminar planned from "Kim's
 * assigned articles" never opened one, and no close ever told students what to read. Where the brief asked for
 * no reading at all they are further reading and nothing more: assigned as they stood, a course with no textbook
 * was given a different one each lesson, and a quiz on "the assigned reading" in a book nobody was told to get.
 */
export function readBefore(lesson: Lesson): { works: string[]; proposed: boolean; optional: boolean } {
  const given = lesson.readings.map((r) => r.trim()).filter(Boolean);
  const proposed = lesson.suggestedReadings.map((r) => r.trim()).filter(Boolean);
  const named = given.filter((r) => !(VAGUE.test(r) && !/\d{4}/.test(r)));
  if (named.length === given.length && given.length) return { works: given, proposed: false, optional: false };
  return { works: [...named, ...proposed], proposed: proposed.length > 0, optional: proposed.length > 0 && !given.length };
}

/** How a lesson's readings are introduced: assigned by the teacher, standing in for ones they described, or only suggested. */
export function readingsLead(course: Course, before: ReturnType<typeof readBefore>): string {
  if (before.proposed && hasModulePages(course)) return 'Further reading Folio suggests, which students may not be able to get: the page may point to it, marked optional and outside the week\'s hours, and never depends on it';
  if (before.optional) return 'Further reading Folio suggests, which the teacher did not ask for and students may not have: nothing in the lesson assigns it, tests it or depends on having read it, and no other book is named as the course\'s text; a guide or a close may name it once as optional further reading';
  return `Students read before this lesson${before.proposed ? ' (plan from these, naming them in full)' : ''}`;
}

/**
 * What the next lesson holds that students must hear of now. Only its main piece was looked at: a midterm held beside
 * other work opened a class that nobody had announced it to, and the first student to lead a graded seminar saw the
 * brief and the rubric an hour before being scored on them.
 */
function ahead(course: Course, next: Lesson): string {
  const named = (p: Lesson['homework']) => (p.toward.trim() ? ` ("${p.toward.trim()}")` : '');
  const pieces = lessonPieces(next);
  const tests = pieces.filter((p) => p.kind === 'test');
  const before = orderedLessons(course).slice(0, course.lessonOrder.indexOf(next.id));
  const firstTurns = pieces.filter((p) => p.kind === 'inclass' && p.toward.trim() && !before.some((l) => holds(l, 'inclass', p.toward.trim())));
  return [
    tests.length ? `, and announces the test it holds${named(tests[0]!)}, what it covers and what to bring` : '',
    firstTurns.length ? `, and prepares the work graded in class there for the first time${named(firstTurns[0]!)}: what students will be asked to do and how it is scored is said now, in general terms, and whoever goes first is settled now, since its brief is written with that lesson and nobody can prepare for a brief they have not seen` : '',
  ].join('');
}

/**
 * What comes next, so the close can prepare students for it: a plan not told sent them home with "no further
 * task" before a lesson that assumed the reading, and no quiz was ever announced the lesson before.
 */
export function nextReading(course: Course, lesson: Lesson): string {
  const next = orderedLessons(course)[course.lessonOrder.indexOf(lesson.id) + 1];
  if (!next) return '';
  // In an online course Folio's own suggestions are optional reading: no close sends students to a book they may not have.
  const before = readBefore(next);
  const readings = before.optional || (hasModulePages(course) && before.proposed) ? [] : before.works;
  return [
    // Told to announce a quiz "if it holds one", nine plans in thirteen announced that none was held: the test is named only when there is one.
    next.summary.trim() ? `Next time: ${next.summary.trim()} The close tells students what to expect${ahead(course, next)}.` : '',
    readings.length ? `Before the next lesson students read: ${readings.join('; ')}. The plan tells them so before they leave.` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * The plan as the materials built on it see it. The teacher notes go too: they hold the expected answers and the
 * misconceptions to watch for, and a study guide written without them stated one of those misconceptions as fact.
 */
export function planSummary(lesson: Lesson): string {
  if (lesson.page?.length) return moduleSummary(lesson);
  if (!lesson.segments.length) return '';
  const ideas = lesson.keyIdeas.map((k) => `- ${k}`).join('\n');
  const flow = lesson.segments
    .map((s) => `- ${s.title} (${s.minutes} min): ${s.description}${s.teacherNotes.trim() ? `\n  Teacher notes: ${s.teacherNotes.trim()}` : ''}`)
    .join('\n');
  return `The lesson plan's key ideas:\n${ideas}\n\nThe lesson runs like this:\n${flow}`;
}

/** A graded piece of its own (a paper, a project, a test, a performance), not one of a run of weekly sets. */
export function ownPiece(course: Course, lesson: Lesson): boolean {
  const { kind, toward } = lesson.homework;
  if (kind === 'test' || kind === 'inclass') return true;
  return kind === 'assignment' && Boolean(toward.trim()) && !sharedComponent(course, lesson);
}

/**
 * Work graded in class with a rubric is written once, in the lesson that holds it. A piece that goes on
 * through the term (leading a seminar, presenting in rotation) is run by many lessons: each is told where its
 * brief and rubric are, so none writes criteria of its own or cites a rubric that isn't there.
 */
export function inClassPieces(course: Course): string {
  const seen = new Set<string>();
  const lines = orderedLessons(course).flatMap((l) =>
    lessonPieces(l).flatMap((p) => {
      const toward = p.toward.trim();
      if (p.kind !== 'inclass' || !toward || seen.has(toward)) return [];
      seen.add(toward);
      // Told only where the rubric was, a later lesson ran a five-minute "peer review" that two of its three criteria could not score.
      const brief = workOf(course, l, toward);
      const rubric = brief?.kind === 'assignment' && brief.rubricId ? course.rubrics[brief.rubricId] : undefined;
      return [`"${toward}" has its brief and rubric written with the lesson "${l.title}"${rubric ? ` (scored on: ${rubric.criteria.map((c) => c.name).join('; ')})` : ''}`];
    }),
  );
  return lines.length ? `${lines.join('; ')}. A lesson that runs one of these says so and scores with that rubric; it writes no criteria of its own, gives students a task in which every criterion has something to show, and puts the brief and rubric before them again (on the screen or as copies).` : '';
}
