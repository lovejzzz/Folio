import { cmd, hasModulePages, newId, orderedLessons, pageMinutes, pageText, type Course, type Lesson, type PageBlock } from '@folio/core';
import { z } from 'zod';
import type { Problem } from './jobs';
import { flagsAt, type SectionJob } from './workJobs';

/**
 * Online courses with no set meeting time. The week's "plan" is a module page written for the student, who
 * works through it alone: so it is written in another voice, with other parts, and checked for other things
 * than a plan a teacher runs in a room.
 */

const line = z.string().min(1);

const BlockDraft = z.object({
  type: z.enum(['heading', 'text', 'list', 'steps', 'callout', 'code', 'image', 'video', 'file', 'terms']),
  text: z.string().default('').describe('heading: its words. text: a paragraph. callout: its whole body. code: the code exactly as typed, with line breaks. image, video: the caption. file: its file name as students see it'),
  items: z.array(z.string()).default([]).describe('list: the items. steps: one action per item, unnumbered. terms: "term: meaning" per item'),
  kind: z.string().default('').describe('callout: checkpoint, stuck, why, tip, warning or version. code: the language. file: starter, checkpoint, solution or resource. video: "clip" for a short silent recording of the screen, "talk" for one with the instructor speaking'),
  title: z.string().default('').describe('callout: a short title, or empty'),
  shots: z
    .array(z.object({ step: z.number().int().min(1), shows: line, alt: line }))
    .default([])
    .describe('steps only: a screenshot under a step, by the step\'s number in this block, where the thing to click is hard to find or the result is worth seeing'),
  shows: z.string().default('').describe('image, video, file: exactly what it must show or hold, written for the person who will make it'),
  alt: z.string().default('').describe('image, clip: what a student who cannot see it needs from it: the names and values visible, what happens'),
  minutes: z.number().min(0).max(60).default(0).describe('video: its length'),
  transcript: z.string().default('').describe('video: what is said, word for word'),
});
type BlockDraft = z.infer<typeof BlockDraft>;

export const ModuleDraft = z.object({
  keyIdeas: z.array(line).min(2).max(5),
  intro: line.describe('Why this week matters, how it follows last week, and what the student will have made or be able to do by the end'),
  checklist: z
    .array(
      z.object({
        label: line.describe('What to do, starting with a verb'),
        activity: z.enum(['read', 'watch', 'build', 'practice', 'check', 'discuss', 'submit']),
        minutes: z.number().int().min(1).max(600),
        due: z.string().default('').describe('The day it is due, when it has a deadline; else empty'),
      }),
    )
    .min(4)
    .max(16),
  parts: z
    .array(z.object({ title: line.describe('Names what the student gets done in this part'), blocks: z.array(BlockDraft).min(1) }))
    .min(2)
    .max(10),
  wrapUp: line.describe('What the student can now do, a question to check themselves against each objective, and what comes next week'),
  vocabulary: z.array(z.object({ term: line, definition: line })).max(12),
  facilitation: z.object({
    announcement: line.describe('The announcement the instructor posts at the start of the week, ready to send'),
    watchFor: z.array(line).min(2).max(6).describe('What students get wrong or stuck on this week, and what to do when the instructor sees it'),
    feedback: z.array(line).min(2).max(8).describe('Comments the instructor can adapt when giving feedback on this week\'s work'),
    atRisk: z.string().default('').describe('Who to contact this week and what to say: students who have not started, posted or submitted'),
  }),
});
export type ModuleDraft = z.infer<typeof ModuleDraft>;

const CALLOUTS = ['checkpoint', 'stuck', 'why', 'tip', 'warning', 'version'] as const;
const ROLES = ['starter', 'checkpoint', 'solution', 'resource'] as const;
const oneOf = <T extends string>(all: readonly T[], value: string, fallback: T): T => all.find((k) => k === value.trim().toLowerCase()) ?? fallback;

/**
 * A callout as the page shows it: its kind is its heading, so a title that only repeats the kind is dropped
 * ("Checkpoint: Checkpoint"), and several problems on single lines are set apart as paragraphs.
 */
function calloutBlock(id: string, b: BlockDraft): PageBlock {
  const kind = oneOf(CALLOUTS, b.kind, 'tip');
  // Both: a model put the symptom under "text" and its causes under "items", and the causes were dropped.
  const text = [b.text, ...b.items].filter((t) => t.trim()).join('\n');
  const title = b.title.trim();
  const echo = /^(checkpoint|stuck|if it did(?: not|n['’]t) work|why(?: this works)?|tip|warning|careful|version)$/i.test(title);
  return { id, type: 'callout', kind, title: echo ? '' : title, text: text.includes('\n\n') ? text : text.replace(/\n/g, '\n\n') };
}

function toBlock(b: BlockDraft): PageBlock {
  const id = newId('x');
  switch (b.type) {
    case 'heading':
      return { id, type: 'heading', level: 3, text: b.text };
    case 'text':
      return { id, type: 'text', text: b.text };
    case 'list':
      return { id, type: 'list', ordered: false, items: b.items };
    case 'steps':
      return {
        id,
        type: 'steps',
        items: b.items.map((text, i) => {
          const shot = b.shots.find((s) => s.step === i + 1);
          return { id: newId('x'), text, ...(shot ? { shot: { src: '', alt: shot.alt, caption: '', shows: shot.shows } } : {}) };
        }),
      };
    case 'callout':
      return calloutBlock(id, b);
    case 'code':
      return { id, type: 'code', language: b.kind.trim().toLowerCase(), code: b.text, caption: b.title };
    case 'image':
      return { id, type: 'image', src: '', alt: b.alt, caption: b.text, shows: b.shows };
    case 'video':
      return { id, type: 'video', src: '', poster: '', alt: b.alt, caption: b.text, shows: b.shows, minutes: b.minutes, transcript: b.transcript, clip: isClip(b) };
    case 'file':
      return { id, type: 'file', href: '', label: b.text, role: oneOf(ROLES, b.kind, 'resource'), shows: b.shows };
    case 'terms':
      return { id, type: 'terms', items: b.items.map((t) => ({ term: t.split(':')[0]!.trim(), meaning: t.split(':').slice(1).join(':').trim() })) };
  }
}

/** A silent recording of the screen, as against the instructor talking. */
const isClip = (b: BlockDraft) => b.type === 'video' && (b.kind.trim().toLowerCase() === 'clip' || !b.transcript.trim());

const WRAP_UP: Record<string, string> = { en: 'Wrap-up', 'zh-CN': '本周小结' };

/** The page a student sees, from the draft: the introduction, the week's checklist, each part under its title, the wrap-up. */
export function modulePage(v: ModuleDraft, language: string): PageBlock[] {
  return [
    { id: newId('x'), type: 'text', text: v.intro },
    { id: newId('x'), type: 'checklist', items: v.checklist.map((c) => ({ id: newId('x'), ...c })) },
    ...v.parts.flatMap((p): PageBlock[] => [{ id: newId('x'), type: 'heading', level: 2, text: p.title }, ...p.blocks.map(toBlock)]),
    { id: newId('x'), type: 'heading', level: 2, text: WRAP_UP[language] ?? WRAP_UP.en! },
    { id: newId('x'), type: 'text', text: v.wrapUp },
  ];
}

const issue = (text: string): Problem => ({ index: null, flag: { code: 'schemaIssue', values: { path: 'module', issue: text } } });

/** How far the week's checklist may be from the hours the course promises. */
const HOURS_SLACK = 0.25;

/** What can be checked without reading: the week's hours, media a student can't see or hear, steps without a checkpoint. */
export function checkModule(v: ModuleDraft, course: Course): Problem[] {
  const problems: Problem[] = [];
  const want = (course.online?.hoursPerWeek ?? 9) * 60;
  const got = v.checklist.reduce((n, c) => n + c.minutes, 0);
  if (Math.abs(got - want) > want * HOURS_SLACK) problems.push(issue(`The checklist adds up to ${got} minutes; the week is ${want} minutes of student work. Change the work or the estimates so they agree`));
  const blocks = v.parts.flatMap((p) => p.blocks);
  if (blocks.some((b) => b.type === 'image' && !b.alt.trim())) problems.push(issue('Every image needs "alt": what a student who cannot see it needs to know'));
  if (blocks.some((b) => (b.type === 'image' || b.type === 'video') && !b.shows.trim())) problems.push(issue('Every image and video needs "shows": what it must show, for the person who makes it'));
  if (blocks.some((b) => b.type === 'video' && !isClip(b) && !b.transcript.trim())) problems.push(issue('Every video in which someone speaks needs its transcript'));
  if (blocks.some((b) => b.type === 'video' && isClip(b) && !b.alt.trim())) problems.push(issue('Every clip needs "alt": what happens in it, for a student who cannot see it'));
  if (blocks.some((b) => b.type === 'video' && b.minutes > 6)) problems.push(issue('No video runs over six minutes: split it'));
  if (blocks.some((b) => b.type === 'file' && (!b.text.trim() || !b.shows.trim()))) problems.push(issue('Every file needs its name under "text" and what it holds under "shows"'));
  const thin = blocks.filter((b) => b.type === 'callout' && ['stuck', 'checkpoint'].includes(b.kind.trim().toLowerCase()) && [b.text, ...b.items].join(' ').trim().length < 80);
  if (thin.length) problems.push(issue(`${thin.length} checkpoint or stuck callouts say too little: a checkpoint says what the student should see and what wrong looks like; a stuck callout gives each likely cause with its fix`));
  const pictures = (bs: typeof blocks) => bs.reduce((n, b) => n + (b.type === 'image' || b.type === 'video' ? 1 : 0) + b.shots.length, 0);
  for (const part of v.parts) {
    const steps = part.blocks.reduce((n, b) => n + (b.type === 'steps' ? b.items.length : 0), 0);
    const checked = part.blocks.some((b) => b.type === 'callout' && b.kind.trim().toLowerCase() === 'checkpoint');
    if (steps > 6 && !checked) problems.push(issue(`"${part.title}" has ${steps} steps and no checkpoint: say what the student should see`));
    // A beginner checks their screen against the page: a long run of steps with nothing to check against loses them.
    if (steps >= 5 && pictures(part.blocks) < 2) problems.push(issue(`"${part.title}" has ${steps} steps and ${pictures(part.blocks)} pictures: ask for a screenshot where the thing to click is hard to find and one of the result`));
  }
  if (blocks.some((b) => b.type === 'steps') && !blocks.some((b) => b.type === 'video' && isClip(b))) problems.push(issue('The week has steps to follow and no clip: ask for a short silent recording where something moves or runs'));
  return problems;
}

/** The job that writes a week's module page in place of a lesson plan. */
export const moduleJob: SectionJob<ModuleDraft> = {
  schema: ModuleDraft,
  check: (v, course) => checkModule(v, course),
  toCommands: (v, problems, course, lesson) => [
    cmd('section.fill', {
      lessonId: lesson.id,
      kind: 'plan',
      flags: flagsAt(problems, null),
      content: {
        keyIdeas: v.keyIdeas,
        segments: [],
        vocabulary: v.vocabulary.map((t) => ({ ...t, id: newId('x') })),
        page: modulePage(v, course.language),
        facilitation: v.facilitation,
      },
    }),
  ],
};

/** What every writer of an online course is told about it, in the course background. */
export function onlineBackground(course: Course): string {
  if (!hasModulePages(course)) return '';
  const hours = course.online?.hoursPerWeek ?? 9;
  return [
    'This course is taught online with no set meeting time. Each lesson is one week\'s module: students work through it alone, when they can, and no teacher is present while they do. Everything is written to the student as "you", in a warm, plain voice, and must be enough on its own: a student who follows the page gets there without asking anyone.',
    `A week is about ${hours} hours of student work, everything counted. The week has one rhythm all term: a first forum post by Thursday, replies and all other work by Sunday night.`,
    'Say "this week", "last week" and "next week" where a course in a room says "this lesson" or "last time".',
    'The instructor does not lecture: they post an announcement, answer in the forum, and give feedback on work. Nothing is collected, handed out or said aloud; work is submitted online, files are downloaded from the page.',
  ].join(' ');
}

/** The work a week sets, in an online course: nothing is "handed in at the start of a lesson". */
export function onlineHomeworkLine(course: Course, lesson: Lesson): string {
  const toward = lesson.homework.toward.trim();
  const named = toward ? `"${toward}"` : 'a graded piece';
  const due = lesson.homework.due && lesson.homework.due !== lesson.id ? course.lessons[lesson.homework.due] : undefined;
  const gap = due ? course.lessonOrder.indexOf(due.id) - course.lessonOrder.indexOf(lesson.id) : 0;
  const when = gap > 0 ? `by Sunday night ${gap === 1 ? 'of next week' : `${gap} weeks from now`}` : 'by Sunday night of this week';
  switch (lesson.homework.kind) {
    case 'none':
      return 'This week sets no graded work.';
    case 'test':
      return `This week holds ${toward ? `the graded test ${named}` : 'a graded test'}, written separately with its questions, key and points: taken online, open book, in one sitting within the week. The page says when it opens and closes, how long it runs and what it covers, and writes no questions.`;
    case 'inclass':
      return `This week holds ${named}, presented online (a recording, a post or a shared build) and graded with a rubric written separately: the page says what to prepare, how to present it and how to respond to classmates, and writes no criteria.`;
    case 'step':
      return `This week sets a short ungraded step${toward ? ` toward "${toward}"` : ''}, submitted ${when}. It is written separately: the page names it in the checklist and says where it fits, without spelling out its tasks.`;
    default:
      return `This week sets a graded assignment${toward ? ` that counts toward "${toward}" (the page calls it by that name)` : ''}, submitted ${when}. It is written separately: the page names it in the checklist and says where it fits, without spelling out its tasks.`;
  }
}

/** Is the week mostly about using a tool or writing code? Then its parts are tutorials. */
const HANDS_ON = [
  'When the week teaches a tool, software or code, the parts are a tutorial the student follows on their own computer: each part is titled with what gets done ("Make the player move"), opens with one sentence of why, then gives numbered steps of one action each. A scene, file or object the student makes is given a name when it is made, and called by it afterwards. A step says where before what ("In the Hierarchy window, right-click…"), names every button, menu and field in bold exactly as the screen shows it (**Add Component**), gives menu paths with ">", and gives exact values. Every part ends with a "checkpoint" callout: what the student should now see, and what it looks like when it went wrong. After a part where things commonly fail, a "stuck" callout lists the two or three likely causes, with the exact error text when there is one, and the fix. A short "why" callout may explain what a step did; the steps themselves stay bare.',
  'Code longer than one line goes in a block of type "code": the whole file when it is new, or the lines to add with a line of the file above and below them, exactly as typed, with comments a beginner can read. Explain new code after the block, line by line where it is the first time. Inline backticks are for names and single lines.',
  'The page is rich in pictures: a beginner checks their screen against them. Ask for a screenshot ("shots" on a steps block, or an "image" block) wherever the thing to click is hard to find, a window or setting must look a certain way, or a result can be seen: usually two to four in a part, and one of the result at every checkpoint. Where something moves or runs (pressing Play, a drag, flying the view), ask for a "video" of kind "clip": a silent recording of the screen under a minute, with "alt" saying what happens in it; and open the week with a picture or clip of what will be built. Under "shows", write for the person who captures it: which one window, in what state, with which names and values visible, what to outline, and on which system when Windows and Mac differ. Under "alt", give what a student needs from the picture (the names and values in it), never "a screenshot of…". Never refer to a picture as if the student could not go on without it: the words carry the step.',
  'Names of buttons, menus, fields and windows are taken from the teacher\'s sources when they give them, exactly, and never from memory where the two differ; what a new project or a window holds is described as the sources describe it. Never identify something by its colour alone ("the green arrow, which points up"), and give the menu or keyboard way beside a drag or a right-click where there is one. Anything done outside the tool itself (taking a screenshot, recording the screen, finding or zipping a folder) is given in full for Windows and for Mac the first time it is needed.',
  'Name the exact version and template the page is written for in a "version" callout in the first part, with what to do when the student\'s differs. Give a "file" block for what the student starts from (starter) and for the project as it should stand at the end of the week (checkpoint), so one failure does not block the week.',
  'After the guided parts, a part with a challenge the student does without steps: one a little beyond the tutorial and one further, marked optional, each stated as what the result does and tried out in your head against what the student has built, with a hint in a "tip" callout.',
].join(' ');

/** The ask for a week's module page. */
export function moduleAsk(course: Course, lesson: Lesson): string {
  const hours = course.online?.hoursPerWeek ?? 9;
  const enabled = (k: 'quiz' | 'discussions' | 'assignments' | 'faq' | 'study') => course.materials[k].enabled;
  const others = [enabled('quiz') && 'a self-check quiz', enabled('discussions') && 'the forum prompt', enabled('assignments') && lesson.homework.kind !== 'none' && 'the graded work', enabled('faq') && 'a "Stuck?" list', enabled('study') && 'a recap'].filter(Boolean).join(', ');
  return [
    'Write this week\'s module page: the page the student works through alone. It teaches; it is not a plan of what a teacher will do.',
    'Under "intro", 60 to 120 words: why this week matters, how it follows last week, and what the student will have made or be able to do by Sunday.',
    `Under "checklist", everything the student does this week in order, each with the kind of activity, an honest estimate in minutes and the day it is due when it has a deadline. The estimates add up to about ${hours * 60} minutes. No item runs over 60 minutes: split it.${others ? ` It includes, by name, the other materials of the week, which are written separately from this page: ${others}.` : ''}`,
    'Under "parts", the teaching itself, in the order the student does it: two to eight parts, each a chunk a student can finish in one sitting, built from blocks. Explain ideas in short paragraphs with an example each; use a list only for things that are a list. Where a short video of the instructor explaining would help, give a "video" block with its full transcript (under six minutes, about 130 words a minute) and say under "shows" what is on screen; the page must still teach a student who only reads the transcript. Where students read something, name it exactly and say what to read it for. Every part says why the student is doing it.',
    HANDS_ON,
    'Under "wrapUp", 80 to 120 words: what the student can now do, one question to test themselves on each objective, and a look ahead to next week.',
    'Under "vocabulary", the terms this week introduces, each in one plain sentence.',
    'Under "facilitation", the instructor\'s part of the week, never shown to students: the announcement to post on Monday (what the week is, the one thing to get right, the deadlines), what to watch for in the forum and in submitted work and what to do about it, comments to adapt when giving feedback, and whom to contact by midweek.',
    'A term is explained in a sentence where it first appears. The graded work and the forum prompt are written separately and shown to the student with this page: the page names each once, in the checklist, with its deadline, and says nothing of what they ask, how they are submitted or how they are graded.',
    'Never write a placeholder for the instructor to fill in, and never promise a file, link, video or reading that the page does not give as a block.',
  ].join(' ');
}

/** The week's page as the materials written from it see it. */
export function moduleSummary(lesson: Lesson): string {
  if (!lesson.page?.length) return '';
  const ideas = lesson.keyIdeas.map((k) => `- ${k}`).join('\n');
  return `The week's key ideas:\n${ideas}\n\nThe week's module page, as the student reads it:\n${pageText(lesson.page)}`;
}

const clip = (text: string, room: number) => (text.length > room ? `${text.slice(0, room)}…` : text);

/** An earlier week, for the page that follows it: its parts, what was built and the names it gave things. */
export function moduleDigest(lesson: Lesson): string {
  const page = lesson.page ?? [];
  const parts = page.flatMap((b, i) => {
    if (b.type !== 'heading' || b.level !== 2) return [];
    const end = page.findIndex((o, j) => j > i && o.type === 'heading' && o.level === 2);
    const body = pageText(page.slice(i + 1, end < 0 ? undefined : end)).replace(/\n+/g, ' ');
    return [`  - ${b.text}: ${clip(body, 900)}`];
  });
  const terms = lesson.vocabulary.map((v) => v.term).join(', ');
  return [`"${lesson.title}" (${Math.round(pageMinutes(page) / 60)} h)`, lesson.keyIdeas.length ? ` Key ideas:\n${lesson.keyIdeas.map((k) => `  - ${k}`).join('\n')}` : '', terms && ` Terms: ${terms}`, parts.length ? ` What students did:\n${parts.join('\n')}` : ''].filter(Boolean).join('\n');
}

/** What the other materials of an online week are asked for, in place of what a room course asks. */
export const ONLINE_ASKS = {
  quiz: 'This is the week\'s self-check: students take it alone, as often as they like, and it does not count toward the grade unless the grading says so. Under "explanation", say why the right answer is right and, for a choice question, why each wrong choice is wrong, so a student learns from a miss; point to the part of the page to go back to.',
  discussions:
    'Write one prompt for the week\'s discussion forum, addressed to the students. It is open enough that no two posts can be the same: each student brings something of their own (what they made, a choice they took and why, where they got stuck). Say what the first post holds, due Thursday, and what the two replies do, due Sunday (for work that can be shared: try a classmate\'s, and say one thing that works and one to change). Do not say how posts are graded: Folio adds that, the same every week. Under "followUps", two or three things the instructor can ask in the thread to push it further.',
  assignments:
    'Students do this alone and submit it online. Write "prompt" in three short paragraphs: why they are doing it, what to do, and how it is judged. Say exactly what to submit, in the form the grading or the brief gives (a screenshot, a short screen recording, a link), in any common file type, the same for Windows and Mac. It asks only for what the page has taught, the capture and upload included, and for a guided build it asks for something of the student\'s own on top (a change, an addition, a choice explained), so that no two submissions are alike. Say what help is allowed, AI tools included, as the class policies say; when they say nothing, ask students to note any help they used.',
  faq: 'Write the week\'s "Stuck?" list: three to five problems students most often hit this week, each as the question they would ask, with what they see (the exact error text when there is one), and the fix in order. Add where to ask when the fix does not work: the course\'s Q&A forum.',
  study: 'This is the week\'s recap, the page a student rereads before next week or before a test: say what they can now do, not what the page covered.',
} as const;

/** The rules an outline follows when the course is online with no set meeting time. */
export function onlineOutlineRules(hoursPerWeek: number): string {
  return [
    `This course is taught online with no set meeting time: each lesson is one week's module that students work through alone, about ${hoursPerWeek} hours a week. Title each lesson for what students make or learn that week.`,
    'The course opens by getting students set up (what to install, how the course works, introducing themselves) alongside a first small success, and ends with a week that brings the work together: a showcase or reflection, and what to learn next.',
    'When the course builds a skill, students make something every week, and a larger project of their own grows through the term in milestones; say in each summary what is made that week. Graded work is submitted online by Sunday night of its week: under "homeworkDue", give the lesson in whose week it is submitted, which for weekly work is the same lesson. A "test" is taken online within its week; "inclass" is a piece presented online (a recording, a post, a shared build) and graded with a rubric.',
    'A discussion forum runs every week (a first post by Thursday, replies by Sunday); when the brief does not say how the course is graded, grade it by weekly work, forum participation and the project. Forum participation is graded from the weekly posts by the same criteria all term, which each week\'s prompt states: whatever was said above about participation, it is never a lesson\'s "homework". Every week\'s homework is what is made and submitted that week, the first week included. Each summary names what is made and the one thing submitted for a grade that week ("a screen recording of the ball rolling off the ramp"): the page and the graded work are written separately, and both follow the summary.',
  ].join(' ');
}

/** The planned weeks before this one, nearest last, within the budget. */
export function earlierModules(course: Course, lesson: Lesson, budget: number): string {
  const before = orderedLessons(course).slice(0, course.lessonOrder.indexOf(lesson.id)).filter((l) => l.page?.length);
  const kept: string[] = [];
  let used = 0;
  for (const l of before.reverse()) {
    const digest = moduleDigest(l);
    if (used + digest.length > budget) break;
    kept.unshift(digest);
    used += digest.length;
  }
  return kept.join('\n\n');
}

/** How forum posts are graded, the same words every week: said by Folio, so no two weeks give two rules. */
export const FORUM_GRADING: Record<string, string> = {
  en: 'How posts are graded, every week: full marks for a first post by Thursday that is about your own work and answers the prompt, and two replies by Sunday that each help a classmate go further (say what worked for you, suggest one change, or ask a real question). Late or one-line posts earn half.',
  'zh-CN': '每周发帖的评分方式相同：周四前发出结合自己作品、回应题目的首帖，周日前给两位同学各写一条有帮助的回复，即得满分；迟交或只有一句话的帖子得一半。',
};
