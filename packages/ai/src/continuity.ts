import { orderedLessons, type Course, type Lesson } from '@folio/core';

/**
 * What one lesson's materials owe the lessons around it. Each lesson is written in its own call, and a lesson
 * written knowing only the others' titles taught its own version of what they taught: a grade 2 course named a
 * bean plant's stages five ways in one lesson and four in another, and moved the beans students had set
 * sprouting in bags on the window into jars.
 */

/** Room for the earlier lessons in a plan request: a long course keeps the nearest in full. */
const EARLIER_BUDGET = 14000;

const clipNote = (note: string, room = 240) => {
  const flat = note.trim().replace(/\s+/g, ' ');
  return flat.length > room ? `${flat.slice(0, room)}…` : flat;
};

function lessonDigest(lesson: Lesson, course: Course): string {
  const ideas = lesson.keyIdeas.map((k) => `  - ${k}`).join('\n');
  const terms = lesson.vocabulary.map((v) => v.term).join(', ');
  // Whole descriptions, and the start of the notes: a later lesson used a floor number line it couldn't see was
  // marked only in fourths, from notes the digest left out.
  const flow = lesson.segments
    .map((s) => `  - ${s.title}: ${s.description.replace(/\n+/g, ' ')}${s.teacherNotes.trim() ? ` (Notes: ${clipNote(s.teacherNotes)})` : ''}`)
    .join('\n');
  // The homework too: no plan set, collected or used the homework the lesson before had given.
  const homework = lesson.taskIds.map((id) => course.tasks[id]).flatMap((t) => (t?.kind === 'assignment' ? [`"${t.title}": ${clipNote(t.prompt)}`] : []))[0];
  return [`"${lesson.title}"`, ideas && ` Key ideas:\n${ideas}`, terms && ` Terms: ${terms}`, flow && ` What students did:\n${flow}`, homework && ` Homework it set: ${homework}`].filter(Boolean).join('\n');
}

/** The planned lessons before this one, nearest last, within the budget. */
function digests(course: Course, lesson: Lesson, budget: number): string {
  const before = orderedLessons(course).slice(0, course.lessonOrder.indexOf(lesson.id)).filter((l) => l.segments.length);
  const kept: string[] = [];
  let used = 0;
  for (const l of before.reverse()) {
    const digest = lessonDigest(l, course);
    if (used + digest.length > budget) break;
    kept.unshift(digest);
    used += digest.length;
  }
  return kept.join('\n\n');
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
  const kept = digests(course, lesson, EARLIER_BUDGET);
  if (!kept) return '';
  return `The lessons before this one, as already planned:\n${kept}\n\nThis lesson follows them: use the same names, terms, stages, examples and classroom setups, build on what they taught rather than teaching it again differently or presenting it as new, and when something they started goes on in this lesson (an experiment, a project, a class chart), continue it as they set it up and finish what they left for this lesson (a result to measure, homework to collect or use, work to hand back), on a realistic timeline for how often the class meets (seeds take days to sprout, paint hours to dry). Under vocabulary, list only the terms this lesson introduces: the terms above are already taught, and when this lesson uses them it keeps their meaning.`;
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
    .filter((l) => l.homework.kind === 'step' && l.homework.toward.trim() === toward);
  // Told the titles alone, the next step changed its title and asked the same thing.
  const steps = before.flatMap((l) => l.taskIds.map((id) => course.tasks[id]).flatMap((t) => (t?.kind === 'assignment' ? [`"${t.title}": ${clipNote(t.prompt)}`] : [])));
  return steps.length ? `Earlier lessons already set these steps toward it:\n${steps.map((s) => `- ${s}`).join('\n')}\nThis is the next step: it asks for something those did not, and builds on them.` : '';
}

/**
 * A graded component set as an assignment in several lessons is shared between them. Told only its name, each
 * lesson wrote the whole component: the same title twice, each claiming the component's full weight.
 */
export function sharedComponent(course: Course, lesson: Lesson): string {
  const toward = lesson.homework.toward.trim();
  if (!toward) return '';
  const sharing = orderedLessons(course).filter((l) => l.homework.kind === lesson.homework.kind && l.homework.toward.trim() === toward);
  if (sharing.length < 2) return '';
  const place = sharing.findIndex((l) => l.id === lesson.id) + 1;
  if (lesson.homework.kind === 'inclass') return `"${toward}" is taken over ${sharing.length} lessons, a group in each: write it once and whole, since the later lessons use it as it stands, with running notes that say who goes in which lesson.`;
  // Papers of one component (two quizzes) told only "cover the lessons so far" came out alike, title and half the questions.
  if (lesson.homework.kind === 'test') {
    const earlier = sharing[place - 2]?.taskIds.map((id) => course.tasks[id]).find((t) => t?.kind === 'assignment');
    const before = earlier?.kind === 'assignment' ? ` The paper before it, "${earlier.title}", asked: ${clipNote(earlier.steps.join(' | '), 900)} Repeat none of it.` : '';
    return `"${toward}" is ${sharing.length} papers, and this is number ${place}: title it so (for example "Quiz ${place}" with what it covers), and test what was taught since the paper before it, not the same ground again.${before}`;
  }
  const told = `"${toward}" is set as an assignment in ${sharing.length} lessons, and this is part ${place} of ${sharing.length}: write only the part that belongs to this lesson, title it so it can be told apart from the other parts (for example "${toward}: " followed by this lesson's focus), and never say this part alone carries the component's whole weight. Students read it as an assignment in its own right: no "part", "component" or count of parts in its text.`;
  // Written each on its own, weekly responses in one course asked for 300, 400 and 600 words.
  const before = sharing[place - 2];
  const last = before?.taskIds.map((id) => course.tasks[id]).find((t) => t?.kind === 'assignment');
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
export function dueWords(course: Course, lesson: Lesson): string {
  const due = lesson.homework.due ? course.lessons[lesson.homework.due] : undefined;
  const gap = due ? course.lessonOrder.indexOf(due.id) - course.lessonOrder.indexOf(lesson.id) : 0;
  if (!due || gap < 1) return '';
  return gap === 1 ? 'It is due at the start of the next lesson.' : `It is due at the start of the lesson "${due.title}", ${gap} lessons from now.`;
}

export function homeworkLine(course: Course, lesson: Lesson): string {
  const toward = lesson.homework.toward.trim();
  const collected = orderedLessons(course)
    .filter((l) => l.homework.due === lesson.id && l.id !== lesson.id)
    .map((l) => (l.homework.toward.trim() ? `"${l.homework.toward.trim()}" (set in "${l.title}")` : `the work set in "${l.title}"`));
  // Set, due and collected were three guesses: one piece had two due dates and a close that said "give its due date".
  const due = collected.length ? ` Due at the start of this lesson: ${collected.join('; ')}. The plan collects it.` : '';
  if (lesson.homework.kind === 'none') return `This lesson sets no homework.${due}`;
  const named = toward ? `"${toward}"` : 'a graded piece';
  // The paper and the rubric are their own material: a plan that also wrote them gave the lesson two.
  if (lesson.homework.kind === 'test') return `This lesson holds ${toward ? `the graded test ${named}` : 'a graded test'}, written separately as a paper with its questions, key and points: the plan gives it its time and conditions (or, when the summary says it is sat after the course ends, reviews for it and says when and how it is sat), and writes no questions.${due}`;
  if (lesson.homework.kind === 'inclass') return `This lesson holds ${named}, done and graded in class with a rubric written separately: the plan runs it, with time for every student, and writes no criteria.${due}`;
  const set = `which the plan has the teacher set before students leave, naming it and when it is due, without spelling out its tasks or naming files and handouts it may not have. ${dueWords(course, lesson)}`.trim();
  if (lesson.homework.kind === 'step') return `For homework this lesson sets a short ungraded step${toward ? ` toward "${toward}"` : ''}, ${set}${due}`;
  return `For homework this lesson sets a graded assignment${toward ? ` that counts toward "${toward}"` : ''}, ${set}${due}`;
}

/**
 * What comes next, so the close can prepare students for it: a plan not told sent them home with "no further
 * task" before a lesson that assumed the reading, and no quiz was ever announced the lesson before.
 */
export function nextReading(course: Course, lesson: Lesson): string {
  const next = orderedLessons(course)[course.lessonOrder.indexOf(lesson.id) + 1];
  if (!next) return '';
  const readings = next.readings.map((r) => r.trim()).filter(Boolean);
  return [
    next.summary.trim() ? `Next time: ${next.summary.trim()} The close tells students what to expect, and announces any quiz or test it holds.` : '',
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
  const lines = orderedLessons(course).flatMap((l) => {
    const toward = l.homework.toward.trim();
    if (l.homework.kind !== 'inclass' || !toward || seen.has(toward)) return [];
    seen.add(toward);
    return [`"${toward}" has its brief and rubric written with the lesson "${l.title}"`];
  });
  return lines.length ? `${lines.join('; ')}. A lesson that runs one of these says so and scores with that rubric; it writes no criteria of its own.` : '';
}
