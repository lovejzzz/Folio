import type { Course } from '@folio/core';
import type { Problem } from './jobs';

/**
 * Teaching live online. A live session is not a lesson in a room on camera: nothing happens unless the plan names
 * the tool, attention is shorter, and what a student could take in alone belongs before the session. So the plan
 * of a live session is a run of show, and it is asked for in other words than a plan for a room.
 */

/** Every meeting of the course is live online. */
export const isLiveOnline = (course: { delivery?: string }): boolean => course.delivery === 'online-sync';
/** A weekly module page and one live session beside it. */
export const isMixedOnline = (course: { delivery?: string }): boolean => course.delivery === 'online-mixed';

function tools(course: Course): string {
  const o = course.online;
  const have = ['chat', 'screen sharing', 'live captions', o?.breakouts !== false && 'breakout rooms', o?.polls !== false && 'polls', 'a shared document'].filter(Boolean).join(', ');
  const size = o?.classSize ?? 25;
  // Sixty students got no advice at all, and a plan that had the instructor visit each of twenty rooms for a minute.
  const crowd = size >= 40 ? ` With about ${size} students, use polls and chat in place of open discussion, rooms of three or four (the same size in every material), and hear from a few rooms only: the instructor cannot visit them all, so each room is told how to call for help.` : size < 12 ? ` With about ${size} students, the whole group can talk as one seminar.` : '';
  return `The meeting platform has ${have}; plan with nothing else, and call it "the meeting", never by a product's name.${crowd} There is no co-host: the plan has the instructor pause to read the chat.`;
}

/** What every writer is told about a course taught live online. */
export function liveBackground(course: Course): string {
  if (isMixedOnline(course)) return liveRules(course).join(' ');
  if (!isLiveOnline(course)) return '';
  return [
    'This course is taught live online: every lesson is a video meeting, and no one shares a room. Nothing is handed out, written on a board or collected: files and links are posted before the session, students write in a shared document, and work is submitted online.',
    ...liveRules(course),
  ].join(' ');
}

/** What holds for any live session, in a course taught live and in a week that has one: said to every writer, so no two materials give two rules. */
function liveRules(course: Course): string[] {
  const recorded = course.online?.recorded === false ? 'Sessions are not recorded.' : 'The whole-group parts of a session are recorded for students of the class who miss it; breakout rooms never are.';
  return [
    tools(course),
    recorded,
    'Cameras are invited, never required or graded. Participation is judged by what a student produces in the session (a poll answered, a line in the shared document, an exit ticket), by the same short scale every session. An exit ticket is each student\'s own and answered in private, in the one place the instructor sets up for the term, which every session calls "the exit-ticket form": never in the chat, where answers show. A student who misses a session watches the recording and answers that session\'s exit ticket within a week: every material that speaks of a missed session says exactly this.',
    'Work due at a session is submitted online before it, early enough to be read: the plan never collects it, it uses it (the opening draws on what students wrote). Slides and documents are posted before the session.',
  ];
}

/** How a live session is planned: asked for with the plan of a course taught live, and with the live session of a mixed week. */
export function runOfShow(course: Course): string {
  return [
    'Plan the session as a run of show for a video meeting. Each segment\'s description says what students do and with what: the tool (chat, a poll, breakout rooms, the shared document, screen sharing), how they are grouped, and what they produce that the instructor can see. Its teacher notes give the instructor\'s moves (the exact prompt, what to look for, what to say next) and a fallback that needs only chat or the shared document.',
    'Open with something to do on arrival (a prompt in the chat) and close with an exit ticket of one to three written-out questions and what is due. The instructor never talks for more than 15 minutes at a stretch, or for more than about 40% of the session; every student does something visible at least every ten minutes; a meeting of 90 minutes or more has a break of ten minutes, away from the screen, by the 60-minute mark, as a segment of kind "break", and no more than about an hour passes between one break and the next or the end; a meeting under 90 minutes has no break. The arrival prompt and the exit ticket belong in every live session, whatever was said of school routines. Leave about a tenth of the time loose by marking one segment "cut if short": moving students in and out of rooms takes a minute or two each way.',
    'A poll or a chat question is written out in full with its options, and the notes say what the instructor does when most get it right and when most do not. A breakout has two to five students, roles and how they are chosen, the task in one to three numbered steps (pasted into the chat before the rooms open, since students cannot see the main room from a breakout), where the group writes its answer (its own page of the shared document), the minutes it has with a warning before the end, and how groups report back (a few, not all).',
    'Live time is for what needs other people: working problems, discussing, critiquing, debugging. What a student can take in alone (a reading, a video, a tutorial followed step by step) is pre-work, and the session opens by using it.',
    tools(course),
  ].join(' ');
}

/** What the materials beside the plan are asked for when the course is taught live online. */
/** What the other materials of a week with a live session are asked for, beside what an online week asks. */
export const MIXED_ASKS = {
  slides: "The slides are for the week's live session and follow its run of show, segment by segment, with the same groups, tasks and minutes.",
  quiz: 'In a week with a live session this quiz is taken once, before the session, so the instructor can see what is unclear: say so in place of "as often as they like". When the grading gives it a share, it counts by being completed on time, not by its score.',
  discussions: 'This week\u2019s forum prompt is one preparation post, due the day before the live session, with no replies: say what the post holds and that the session opens from the posts.',
} as const;

/** How a preparation post is graded in a week with a live session, the same words every week. */
export const PREPARATION_GRADING: Record<string, string> = {
  en: 'How posts are graded, every week: full marks for a post, by the day before the live session, that answers the prompt from your own work on this week\u2019s page. Late or one-line posts earn half.',
  'zh-CN': '每周发帖的评分方式相同：在直播课前一天之前发出、结合本周页面上自己的学习来回应题目的帖子得满分；迟交或只有一句话的帖子得一半。',
};

export const LIVE_ASKS = {
  slides: 'The slides are shared on screen in a video meeting: fewer words and larger than for a room, and as many as the session needs, up to ten. Besides the content, give an instruction slide for every activity (the task, the minutes, where the work goes), a slide for each poll with its question and options, a slide for the break with when to return, and one for the exit ticket.',
  discussions: 'These are the breakouts the plan runs, never further ones. Write each as a breakout task card, pasted into the chat and set at the top of each group\'s page: the goal, the task in one to three steps, the roles, what the group writes and where, the minutes, how to call the instructor into the room, and how groups report back. The follow-ups are the instructor\'s questions for the debrief.',
  faq: 'Write questions about this lesson\'s content only: how the meeting works, lost connections and missed sessions are answered once for the course, not in every lesson.',
} as const;

/** What a week's module page gains when the week also has a live session. */
export function mixedAsk(course: Course): string {
  const minutes = course.online?.liveMinutes || 75;
  return [
    `This week also has one live session of ${minutes} minutes in a video meeting. Group the checklist as before the session, in the session and after it: the checklist names the live session and what to have open for it. The parts before the session prepare for it and say so ("you will use this in the session to…"); the self-check is taken before the session, so the instructor can see what is unclear; the forum post, if any, is one preparation post due the day before the session, with no replies, and the session's opening uses the posts and the self-check's results. After the session comes work that extends it (finishing or applying what the rooms began), never only next week's reading. The last guided part before the wrap-up is "If you miss the session": the recording and that session's exit ticket, within a week, and nothing else.`,
    `Under "live", plan that session, with its segments' minutes adding up to ${minutes}. ${runOfShow(course)}`,
  ].join(' ');
}

const said = (text: string): Problem => ({ index: null, flag: { code: 'schemaIssue', values: { path: 'segments', issue: text } } });

/** What a run of show can be held to without reading it: no long stretch of instructor talk, and breaks an hour apart at most. */
export function checkRunOfShow(segments: readonly { kind: string; title: string; minutes: number }[]): Problem[] {
  const problems: Problem[] = [];
  for (const s of segments) if (s.kind === 'teach' && s.minutes > 15) problems.push(said(`"${s.title}" is ${s.minutes} minutes of teaching: split it at 15 with something every student does (a poll, a line in the chat)`));
  // Held to a break only when the meeting is long enough to need one: a 75-minute session was given ten minutes of break every week.
  if (segments.reduce((n, x) => n + x.minutes, 0) < 90) return problems;
  let stretch = 0;
  for (const s of segments) {
    stretch = s.kind === 'break' ? 0 : stretch + s.minutes;
    if (stretch > 70) {
      problems.push(said('More than about an hour passes on screen without a break: add a break of ten minutes'));
      break;
    }
  }
  return problems;
}
