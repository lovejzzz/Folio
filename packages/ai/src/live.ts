import type { Course } from '@folio/core';

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
  const crowd = size > 60 ? ` With about ${size} students, use polls and chat in place of open discussion, rooms of three or four, and hear from a few rooms only.` : size < 12 ? ` With about ${size} students, the whole group can talk as one seminar.` : '';
  return `The meeting platform has ${have}; plan with nothing else, and call it "the meeting", never by a product's name.${crowd} There is no co-host: the plan has the instructor pause to read the chat.`;
}

/** What every writer is told about a course taught live online. */
export function liveBackground(course: Course): string {
  if (!isLiveOnline(course)) return '';
  const recorded = course.online?.recorded === false ? 'Sessions are not recorded.' : 'The whole-group parts of a session are recorded for students of the class who miss it; breakout rooms never are.';
  return [
    'This course is taught live online: every lesson is a video meeting, and no one shares a room. Nothing is handed out, written on a board or collected: files and links are posted before the session, students write in a shared document, and work is submitted online.',
    tools(course),
    recorded,
    'Cameras are invited, never required or graded. Participation is judged by what a student produces in the session (a poll answered, a line in the shared document, an exit ticket), and a student who misses a session makes it up from the recording and a short task.',
  ].join(' ');
}

/** How a live session is planned: asked for with the plan of a course taught live, and with the live session of a mixed week. */
export function runOfShow(course: Course): string {
  return [
    'Plan the session as a run of show for a video meeting. Each segment\'s description says what students do and with what: the tool (chat, a poll, breakout rooms, the shared document, screen sharing), how they are grouped, and what they produce that the instructor can see. Its teacher notes give the instructor\'s moves (the exact prompt, what to look for, what to say next) and a fallback that needs only chat or the shared document.',
    'Open with something to do on arrival (a prompt in the chat) and close with an exit ticket of one to three written-out questions and what is due. The instructor never talks for more than 15 minutes at a stretch, or for more than about 40% of the session; every student does something visible at least every ten minutes; a meeting of over an hour has a break of ten minutes, away from the screen, by the 60-minute mark, as a segment of kind "break". Leave about a tenth of the time loose by marking one segment "cut if short": moving students in and out of rooms takes a minute or two each way.',
    'A poll or a chat question is written out in full with its options, and the notes say what the instructor does when most get it right and when most do not. A breakout has two to five students, roles and how they are chosen, the task in one to three numbered steps (pasted into the chat before the rooms open, since students cannot see the main room from a breakout), where the group writes its answer (its own page of the shared document), the minutes it has with a warning before the end, and how groups report back (a few, not all).',
    'Live time is for what needs other people: working problems, discussing, critiquing, debugging. What a student can take in alone (a reading, a video, a tutorial followed step by step) is pre-work, and the session opens by using it.',
    tools(course),
  ].join(' ');
}

/** What the materials beside the plan are asked for when the course is taught live online. */
export const LIVE_ASKS = {
  slides: 'The slides are shared on screen in a video meeting: fewer words and larger than for a room. Besides the content, give an instruction slide for every activity (the task, the minutes, where the work goes), a slide for each poll with its question and options, and a slide for the break with when to return.',
  discussions: 'Write each prompt as a breakout task card, pasted into the chat and set at the top of each group\'s page: the goal, the task in one to three steps, the roles, what the group writes and where, the minutes, and how groups report back. The follow-ups are the instructor\'s questions for the debrief.',
  faq: 'Among the questions, answer what students of a live online course ask: what to do when the connection drops or they miss a session.',
} as const;

/** What a week's module page gains when the week also has a live session. */
export function mixedAsk(course: Course): string {
  const minutes = course.online?.liveMinutes || 75;
  return [
    `This week also has one live session of ${minutes} minutes in a video meeting. Group the checklist as before the session, in the session and after it: the checklist names the live session and what to have open for it. The parts before the session prepare for it and say so ("you will use this in the session to…"); the self-check is taken before the session, so the instructor can see what is unclear; the forum post, if any, is one preparation post due before the session, with no replies. The last guided part before the wrap-up is "If you miss the session": the recording, and a short task that stands in for it.`,
    `Under "live", plan that session, with its segments' minutes adding up to ${minutes}. ${runOfShow(course)}`,
  ].join(' ');
}
