import { CourseStore, OnlineSchema, hasModulePages, orderedLessons, pageMinutes, textRuns, type Course } from '@folio/core';
import type { Lesson } from '@folio/core';
import { describe, expect, it } from 'vitest';
import { OutlineDraft, checkPicture, fixNotes, courseBackground, courseFromOutline, generateSection, outlinePrompt, picturePlace, sectionPrompt, type NewCourseRequest } from '../src';
import { applyModuleReview } from '../src/moduleReview';
import { filesSoFar } from '../src/earlierFiles';
import { pieceCounts, startPrompt } from '../src/start';
import { checkRunOfShow } from '../src/live';
import { ModuleDraft, checkModule, modulePage } from '../src/online';
import { typesetDraft } from '../src/typeset';
import { fakeInference, planDraft, smallCourse } from './fake';

const online = (): Course => ({ ...smallCourse(), delivery: 'online-async', online: OnlineSchema.parse({ hoursPerWeek: 3 }) });

const draft = (): ModuleDraft =>
  ModuleDraft.parse({
    keyIdeas: ['A script is a component', 'Update runs every frame'],
    intro: 'This week you write your first script.',
    checklist: [
      { label: 'Follow the guided build', activity: 'build', minutes: 60 },
      { label: 'Try the challenge', activity: 'practice', minutes: 45 },
      { label: 'Take the self-check', activity: 'check', minutes: 15 },
      { label: 'Post your clip', activity: 'discuss', minutes: 60, due: 'Thursday' },
    ],
    parts: [
      {
        title: 'Make the cube spin',
        blocks: [
          { type: 'text', text: 'A script tells an object what to do.' },
          { type: 'steps', items: ['In the **Project** window, right-click **Assets**.', 'Choose **Create > Scripting > MonoBehaviour Script**.'], shots: [{ step: 2, shows: 'The Create menu open on Scripting', alt: 'The Create menu with MonoBehaviour Script highlighted', caption: 'The menu path to the new script.' }] },
          { type: 'code', kind: 'csharp', text: 'void Update()\n{\n    transform.Rotate(0f, 90f * Time.deltaTime, 0f); // "spin"\n}' },
          { type: 'video', kind: 'clip', text: 'Your cube should turn like this.', shows: 'The Game view with the cube turning for five seconds', alt: 'The cube turns steadily about its upright axis.', minutes: 0.2 },
          { type: 'callout', kind: 'checkpoint', title: 'Checkpoint', text: 'You should see the cube turning steadily in the Game view.', items: ['It went wrong if the cube stays still or the Console shows a red message.'] },
        ],
      },
      { title: 'Try it yourself', blocks: [{ type: 'text', text: 'Make it spin the other way.' }] },
    ],
    wrapUp: 'You can now write a script.',
    vocabulary: [{ term: 'Component', definition: 'A part of a GameObject that gives it a behaviour.' }],
    facilitation: { announcement: 'Welcome to week 3.', watchFor: ['Scripts named differently from their class', 'Missing semicolons'], feedback: ['Your cube spins: now try a variable for the speed.', 'Check the Console first.'] },
  });

describe('an online course with no set meeting time', () => {
  it('asks for a page written to the student, in weeks, not a plan of timed segments', () => {
    const c = online();
    const lesson = orderedLessons(c)[0]!;
    expect(courseBackground(c)).toMatch(/online with no set meeting time/);
    expect(courseBackground(c)).not.toMatch(/Each lesson lasts/);
    const ask = sectionPrompt(c, lesson, 'plan');
    expect(ask).toMatch(/module page: the page the student works through alone/);
    expect(ask).toMatch(/about 180 minutes/);
    expect(ask).not.toMatch(/sequence of segments/);
    // The other materials are asked for as a student alone uses them.
    expect(sectionPrompt(c, lesson, 'discussions')).toMatch(/first post holds, due Thursday/);
    expect(sectionPrompt(c, lesson, 'quiz')).toMatch(/why each wrong choice is wrong/);
    expect(sectionPrompt(smallCourse(), lesson, 'plan')).toMatch(/sequence of segments/);
  });

  it('makes the page from the draft: the checklist, each part under its title, steps with their pictures as slots', () => {
    const page = modulePage(draft(), 'en');
    expect(page.map((b) => b.type)).toEqual(['text', 'checklist', 'heading', 'text', 'steps', 'code', 'video', 'callout', 'heading', 'text', 'heading', 'text']);
    // A callout keeps its text and its items, and loses a title that only repeats its kind.
    expect(page.find((b) => b.type === 'callout')).toMatchObject({ title: '', text: 'You should see the cube turning steadily in the Game view.\n\nIt went wrong if the cube stays still or the Console shows a red message.' });
    expect(page.find((b) => b.type === 'video')).toMatchObject({ clip: true });
    expect(pageMinutes(page)).toBe(180);
    const steps = page.find((b) => b.type === 'steps');
    expect(steps?.type === 'steps' && steps.items[1]?.shot).toMatchObject({ src: '', alt: 'The Create menu with MonoBehaviour Script highlighted' });
    expect(page.at(-2)).toMatchObject({ type: 'heading', level: 2, text: 'Wrap-up' });
  });

  it('checks what can be checked without reading: the hours, media a student cannot see, steps without a checkpoint', () => {
    const c = online();
    expect(checkModule(draft(), c)).toEqual([]);
    const long = { ...draft(), checklist: draft().checklist.map((i) => ({ ...i, minutes: i.minutes * 3 })) };
    expect(JSON.stringify(checkModule(long, c))).toMatch(/adds up to 540 minutes; the week is 180/);
    const bare = draft();
    bare.parts[0]!.blocks.push({ ...bare.parts[0]!.blocks[0]!, type: 'image', alt: '', shows: '' }, { ...bare.parts[0]!.blocks[0]!, type: 'video', shows: 'The cube spinning', minutes: 9, transcript: '' });
    const found = JSON.stringify(checkModule(bare, c));
    for (const text of ['Every image needs \\"alt\\"', 'over six minutes']) expect(found).toContain(text);
    const talk = draft();
    talk.parts[0]!.blocks.push({ ...talk.parts[0]!.blocks[0]!, type: 'video', kind: 'talk', shows: 'The instructor', minutes: 3, transcript: '' });
    expect(JSON.stringify(checkModule(talk, c))).not.toContain('needs its transcript');
    const thin = draft();
    thin.parts[0]!.blocks.push({ ...thin.parts[0]!.blocks[0]!, type: 'callout', kind: 'stuck', text: 'The cube does not turn.' });
    expect(JSON.stringify(checkModule(thin, c))).toMatch(/1 checkpoint or stuck callouts say too little/);
    const unchecked = draft();
    unchecked.parts[1]!.blocks.push({ ...unchecked.parts[0]!.blocks[1]!, items: Array.from({ length: 7 }, (_, i) => `Step ${i}`), shots: [] });
    expect(JSON.stringify(checkModule(unchecked, c))).toMatch(/Try it yourself.*has 7 steps and no checkpoint/);
    expect(JSON.stringify(checkModule(unchecked, c))).toMatch(/has 7 steps and no pictures/);
  });

  it('writes a value the student types with the keyboard hyphen, and asks for a caption under every picture', () => {
    const v = draft();
    v.parts[0]!.blocks.push({ ...v.parts[0]!.blocks[0]!, type: 'steps', text: '', items: ['Set **Position** to 0, \u22120.5, 0.'] }, { ...v.parts[0]!.blocks[0]!, type: 'image', text: '', alt: 'The floor', shows: 'The floor' });
    expect(JSON.stringify(modulePage(v, 'en'))).toContain('0, -0.5, 0');
    expect(JSON.stringify(checkModule(v, online()))).toContain('caption');
  });

  it('tells a later week, in full, what an earlier week left in the student\'s project', () => {
    const c = online();
    const [first, second] = orderedLessons(c);
    const built: Course = { ...c, lessons: { ...c.lessons, [first!.id]: { ...first!, page: modulePage(draft(), 'en'), facilitation: { announcement: 'a', watchFor: [], feedback: [], atRisk: '', toCheck: [], leaves: ['Ramp at 0, 2, -4, tilted 20 degrees', 'Ball at 0, 6, -7 with a Rigidbody'] } } } };
    expect(sectionPrompt(built, built.lessons[second!.id]!, 'plan') + courseBackground(built)).toContain('Ramp at 0, 2, -4, tilted 20 degrees');
  });

  it('tells a later week what the graded work added to the project, and leaves optional work out of the week\'s hours', () => {
    const c = online();
    const [first, second] = orderedLessons(c);
    const task = { id: 't_1', lessonId: first!.id, kind: 'assignment' as const, title: 'Weekly build: a sphere of your own', prompt: 'p', steps: ['Add a Sphere named ScriptStudy at Position 6, 1, 5.'], rubricId: null, objectiveIds: [], flags: [], toward: 'Weekly builds' };
    const built = { ...c, tasks: { t_1: task }, lessons: { ...c.lessons, [first!.id]: { ...first!, page: modulePage(draft(), 'en'), taskIds: ['t_1'] } } } as unknown as Course;
    expect(sectionPrompt(built, built.lessons[second!.id]!, 'plan') + courseBackground(built)).toContain('ScriptStudy at Position 6, 1, 5');
    const v = draft();
    const base = checkModule(v, c).length;
    v.checklist.push({ label: 'Optional challenge: a timer', activity: 'practice', minutes: 600, due: '' });
    expect(checkModule(v, c)).toHaveLength(base);
  });

  it('treats a reading Folio proposed as optional in an online week, and a file\'s label as a name', () => {
    const c = online();
    const [first, second] = orderedLessons(c);
    const withBook = { ...c, lessons: { ...c.lessons, [second!.id]: { ...second!, readings: [], suggestedReadings: ['Swink, S. (2008). Game feel. Morgan Kaufmann'] } } } as Course;
    expect(sectionPrompt(withBook, withBook.lessons[second!.id]!, 'plan')).toMatch(/Further reading Folio suggests[\s\S]*marked optional[\s\S]*Swink/);
    expect(sectionPrompt(withBook, withBook.lessons[first!.id]!, 'plan')).not.toMatch(/Before the next lesson students read/);
    const v = draft();
    v.parts[0]!.blocks.push({ ...v.parts[0]!.blocks[0]!, type: 'file', text: 'The project as it should stand at the start of this week, with everything from last week in place and ready', shows: 'A project' });
    expect(JSON.stringify(checkModule(v, c))).toContain('a name, not a sentence');
  });

  it('sends what the checks find to a mend of the part at fault, and does not ask for the page again', async () => {
    const c = online();
    const second = orderedLessons(c)[1]!;
    const bare = draft();
    bare.parts[0]!.blocks.push({ ...bare.parts[0]!.blocks[0]!, type: 'image', text: '', alt: 'The cube', shows: 'The cube' });
    const mend = { parts: [{ number: 1, ...draft().parts[0]! }], left: [] };
    const model = fakeInference((r) => (r.task === 'folio_module_review' ? { issues: [] } : r.task === 'folio_module_mend' ? mend : bare));
    const result = await generateSection(model, c, second.id, 'plan', undefined, { reviewer: model });
    expect(model.calls.map((call) => call.task)).toEqual(['folio_module', 'folio_module_review', 'folio_module_mend', 'folio_module_review']);
    expect(model.calls[2]!.prompt).toMatch(/Every image and video needs its caption/);
    expect(model.calls[3]!.prompt).toContain('Written again since: Part 1.');
    const fill = result.commands[0]!;
    expect(fill.type === 'section.fill' && fill.payload.flags).toEqual([]);
  });

  it('writes Start here again from the weeks when the last week is written', async () => {
    const c = online();
    const all = orderedLessons(c);
    const page = modulePage(draft(), 'en');
    const lessons = Object.fromEntries(all.map((l, i) => [l.id, i < all.length - 1 ? { ...l, page } : l]));
    const built = { ...c, lessons, pages: [{ id: 'p_1', title: 'Start here', audience: 'student' as const, blocks: [], written: 'outline' as const }] } as Course;
    const start = { welcome: 'Welcome.', firstSteps: ['Install Unity', 'Post an introduction'], rhythm: [{ when: 'Monday', what: 'The week opens' }, { when: 'Sunday', what: 'Work is due' }], need: [], grading: [], help: 'Ask in the Q&A forum.', instructor: ['An announcement each Monday', 'Answers within a day'], toAdd: ['Your name'] };
    const answer = (task: string) => (task === 'folio_module_review' ? { issues: [] } : task === 'folio_start' ? start : draft());
    const model = fakeInference((r) => answer(r.task));
    const result = await generateSection(model, built, all.at(-1)!.id, 'plan', undefined, { reviewer: model });
    const asked = model.calls.find((call) => call.task === 'folio_start');
    expect(asked?.prompt).toMatch(/Every week is now written[\s\S]*The weeks as written, by their checklists/);
    const pages = result.commands.find((x) => x.type === 'pages.set');
    expect(pages?.type === 'pages.set' && pages.payload.pages.every((p) => p.written === 'weeks')).toBe(true);
    // A page a teacher has had rewritten once is left alone.
    const again = fakeInference((r) => answer(r.task));
    await generateSection(again, { ...built, pages: [{ ...built.pages[0]!, written: 'weeks' }] }, all.at(-1)!.id, 'plan', undefined, { reviewer: again });
    expect(again.calls.some((call) => call.task === 'folio_start')).toBe(false);
  });

  it('keeps code as typed, and sets a name the screen shows in bold', () => {
    const set = typesetDraft(draft(), 'en');
    expect(set.parts[0]!.blocks[2]!.text).toContain('// "spin"');
    expect(set.wrapUp).toBe('You can now write a script.');
    expect(textRuns('Click **Add Component**, then type `Rigidbody`.').filter((r) => r.bold || r.code).map((r) => r.text)).toEqual(['Add Component', 'Rigidbody']);
  });

  it('makes a review\'s fix only where its words stand once in the part it names', () => {
    const v = draft();
    const { value, applied, notes } = applyModuleReview(v, [
      { part: 1, kind: 'fact', why: 'The menu is named otherwise', find: 'Create > Scripting > MonoBehaviour Script', replace: 'Create > MonoBehaviour Script' },
      { part: 2, kind: 'missing', why: 'No hint is given', find: '', replace: '' },
      { part: 1, kind: 'fact', why: 'Not there', find: 'no such words', replace: 'x' },
    ]);
    expect(value.parts[0]!.blocks[1]!.items[1]).toBe('Choose **Create > MonoBehaviour Script**.');
    expect([applied.length, notes.length]).toEqual([1, 2]);
  });

  it('writes the page in place of the plan, and reads it a second time as a student would', async () => {
    const c = online();
    const lesson = orderedLessons(c)[0]!;
    const start = { welcome: 'Welcome.', firstSteps: ['Install Unity', 'Post an introduction'], rhythm: [{ when: 'Monday', what: 'The week opens' }, { when: 'Sunday', what: 'Work is due' }], need: [], grading: [], help: 'Ask in the Q&A forum.', instructor: ['An announcement every Monday', 'Answers within one working day'], toAdd: ['Your late-work policy'] };
    const model = fakeInference((req) => (req.task === 'folio_module_review' ? { issues: [{ part: 1, kind: 'fact', why: 'Wrong menu', find: 'Scripting > ', replace: '' }] } : req.task === 'folio_start' ? start : draft()));
    const result = await generateSection(model, c, lesson.id, 'plan', undefined, { reviewer: model });
    // The first week is written with the course's Start here page; the instructor's list is theirs alone.
    expect(model.calls.map((call) => call.task).sort()).toEqual(['folio_module', 'folio_module_review', 'folio_start']);
    const pages = result.commands.find((x) => x.type === 'pages.set');
    expect(pages?.type === 'pages.set' && pages.payload.pages.map((p) => [p.title, p.audience])).toEqual([['Start here', 'student'], ['Before the course opens', 'teacher']]);
    // In an online course the forum is graded by one rule, stated the same every week.
    const forum = await generateSection(fakeInference(() => ({ discussions: [{ prompt: 'Share your cube.', followUps: ['What surprised you?'] }, { prompt: 'Second.', followUps: [] }] })), c, lesson.id, 'discussions');
    const filled = forum.commands[0]!;
    expect(filled.type === 'tasks.fill' && filled.payload.tasks.length === 1 && filled.payload.tasks[0]!.kind === 'discussion' && filled.payload.tasks[0]!.prompt).toMatch(/^Share your cube\.\n\nHow posts are graded, every week/);
    const fill = result.commands[0]!;
    expect(fill.type === 'section.fill' && fill.payload.kind === 'plan' && fill.payload.content.page?.some((b) => b.type === 'steps' && b.items[1]?.text === 'Choose **Create > MonoBehaviour Script**.')).toBe(true);
    expect(fill.type === 'section.fill' && fill.payload.kind === 'plan' && fill.payload.content.facilitation?.announcement).toBe('Welcome to week 3.');
  });
});

describe('the outline of an online course', () => {
  const req: NewCourseRequest = { brief: 'Unity for beginners, asynchronous online, 14 weeks.', lessonCount: 2, minutesPerLesson: 0, quizSize: 5, level: 'Undergraduate', language: 'en', materials: ['map', 'syllabus', 'plan', 'slides', 'assignments', 'rubrics', 'discussions', 'quiz', 'study', 'faq'], delivery: 'online-async', sources: [] };
  const lessons = [
    { title: 'Getting set up', summary: 'Install Unity and build a first scene.', objectives: ['Create a project'] },
    { title: 'Objects and physics', summary: 'Make a ball roll.', objectives: ['Add a Rigidbody'] },
  ];

  it('is planned in weeks of student work, with no deck', () => {
    expect(outlinePrompt({ ...req, lessonCount: 14 })).toMatch(/Plan exactly 14 lessons for Undergraduate, one for each week\.[\s\S]*each lesson is one week's module/);
    const course = courseFromOutline(req, OutlineDraft.parse({ title: 'Unity', summary: 'S.', subject: 'Game development', level: 'Undergraduate', lessons }));
    expect(hasModulePages(course)).toBe(true);
    expect(course.shape.minutesPerLesson).toBe(540);
    expect(course.materials.slides.enabled).toBe(false);
    expect(course.materials.plan.enabled).toBe(true);
  });
});

describe('a course taught live online, or with a live session beside its weekly page', () => {
  it('plans a live session as a run of show, with what the platform has', () => {
    const c: Course = { ...smallCourse(), delivery: 'online-sync', online: OnlineSchema.parse({ polls: false, classSize: 80 }) };
    const lesson = orderedLessons(c)[0]!;
    expect(courseBackground(c)).toMatch(/taught live online: every lesson is a video meeting/);
    const ask = sectionPrompt(c, lesson, 'plan');
    expect(ask).toMatch(/sequence of segments[\s\S]*run of show for a video meeting/);
    expect(ask).toMatch(/chat, screen sharing, live captions, breakout rooms, a shared document; plan with nothing else/);
    expect(ask).toMatch(/With about 80 students, use polls and chat in place of open discussion/);
    expect(sectionPrompt(c, lesson, 'slides')).toMatch(/an instruction slide for every activity/);
    expect(sectionPrompt(smallCourse(), lesson, 'plan')).not.toMatch(/run of show/);
  });

  it('holds a run of show to its limits: no long stretch of talk, breaks an hour apart at most', () => {
    const seg = (kind: string, minutes: number) => ({ kind, title: kind, minutes });
    expect(checkRunOfShow([seg('warmup', 10), seg('teach', 15), seg('practice', 30), seg('break', 10), seg('discuss', 60), seg('close', 10)])).toEqual([]);
    const found = JSON.stringify(checkRunOfShow([seg('warmup', 8), seg('teach', 22), seg('practice', 24), seg('break', 10), seg('practice', 48), seg('discuss', 30), seg('close', 8)]));
    expect(found).toMatch(/22 minutes of teaching/);
    expect(found).toMatch(/without a break/);
  });

  it('writes the week\'s page and the live session together, the session timed against its length', () => {
    const c: Course = { ...smallCourse(), delivery: 'online-mixed', online: OnlineSchema.parse({ hoursPerWeek: 3, liveSessions: 1, liveMinutes: 60 }) };
    const lesson = orderedLessons(c)[0]!;
    expect(sectionPrompt(c, lesson, 'plan')).toMatch(/one live session of 60 minutes[\s\S]*Under "live", plan that session/);
    const live = [{ kind: 'warmup' as const, title: 'Arrival', minutes: 10, description: 'Answer in the chat.', teacherNotes: '' }, { kind: 'practice' as const, title: 'Pairs', minutes: 40, description: 'Debug in breakout rooms.', teacherNotes: '' }];
    expect(JSON.stringify(checkModule({ ...draft(), live }, c))).toMatch(/add up to 50 minutes; the session is 60/);
  });

  it('tells every writer of a week with a live session the same rules, and asks for one preparation post', () => {
    const c: Course = { ...smallCourse(), delivery: 'online-mixed', online: OnlineSchema.parse({ hoursPerWeek: 3, liveSessions: 1, liveMinutes: 75, classSize: 60 }) };
    const lesson = orderedLessons(c)[0]!;
    const background = courseBackground(c);
    expect(background).toMatch(/Cameras are invited, never required/);
    expect(background).toMatch(/one forum post before the live session/);
    expect(background).toMatch(/With about 60 students/);
    const forum = sectionPrompt(c, lesson, 'discussions');
    expect(forum).toMatch(/one preparation post, due the day before the live session, with no replies/);
    expect(forum).not.toMatch(/two replies/);
    expect(sectionPrompt(c, lesson, 'slides')).toMatch(/follow its run of show/);
    expect(sectionPrompt(c, lesson, 'quiz')).toMatch(/taken once, before the session/);
    expect(startPrompt(c)).toMatch(/one forum post before the live session[\s\S]*time zone of the live session/);
    expect(startPrompt(c)).not.toMatch(/first forum post by Thursday/);
    // A session under 90 minutes is never held to a break.
    expect(checkRunOfShow([{ kind: 'practice', title: 'Rooms', minutes: 40 }, { kind: 'discuss', title: 'Debrief', minutes: 35 }])).toEqual([]);
  });
});

describe('the Start here page', () => {
  it('is told which weeks set each graded piece, not only how many', () => {
    const c = online();
    const lessons = orderedLessons(c).map((l, i) => ({ ...l, homework: { ...l.homework, kind: i === 0 ? ('assignment' as const) : ('none' as const), toward: i === 0 ? 'Project' : '' } }));
    const course = { ...c, lessons: Object.fromEntries(lessons.map((l) => [l.id, l])) };
    expect(pieceCounts(course)).toMatch(/"Project" 1 \(week 1\)\. Use these counts and weeks\./);
  });
});

describe('a file block named by a sentence', () => {
  it('becomes an unnamed file with the sentence as the paragraph under it', () => {
    const d = draft();
    const sentence = 'Use this only if your own project will not open. Unzip it into Documents, never inside a project folder.';
    const file = { ...d.parts[0]!.blocks[0]!, type: 'file' as const, text: sentence, kind: 'starter', shows: '' };
    const page = modulePage({ ...d, parts: [{ ...d.parts[0]!, blocks: [file] }, ...d.parts.slice(1)] }, 'en');
    const at = page.findIndex((b) => b.type === 'file');
    expect(page[at]).toMatchObject({ type: 'file', label: '', role: 'starter', shows: sentence });
    expect(page[at + 1]).toMatchObject({ type: 'text', text: sentence });
  });
});

describe('an optional item on the checklist', () => {
  it('has no due day', () => {
    const d = draft();
    const page = modulePage({ ...d, checklist: [{ ...d.checklist[0]!, label: 'Optional reading for next week', due: 'Sunday night' }, ...d.checklist.slice(1)] }, 'en');
    const list = page.find((b) => b.type === 'checklist');
    expect(list?.type === 'checklist' && list.items[0]!.due).toBe('');
  });
});

describe('how a graded component is judged', () => {
  it('is one fact every writer is given, and says nothing for a course outlined before it was recorded', () => {
    const c = online();
    const graded = { ...c, grading: [{ id: 'g_1', item: 'Weekly builds', weight: 40, judged: 'complete' as const }, { id: 'g_2', item: 'Final project', weight: 60, judged: 'levels' as const }] };
    expect(courseBackground(graded)).toMatch(/Graded complete or incomplete: "Weekly builds"; complete means every criterion of its rubric at the second-highest level or above\. Every other component is scored/);
    expect(courseBackground(graded)).toMatch(/Pieces of one component count equally/);
    expect(courseBackground({ ...c, grading: [{ id: 'g_1', item: 'Weekly builds', weight: 100 }] })).not.toMatch(/complete or incomplete: "/);
  });
});

describe('a note fixed at the teacher\'s word', () => {
  it('writes again only the part at fault, and keeps the other parts\' blocks and the pictures already made', async () => {
    const c = online();
    const first = orderedLessons(c)[0]!;
    const v = draft();
    v.parts[1]!.blocks.push({ ...v.parts[0]!.blocks[0]!, type: 'image', text: 'Compare the cube.', alt: 'The cube', shows: 'The cube after the challenge' });
    const page = modulePage(v, 'en').map((b) => (b.type === 'image' ? { ...b, src: 'media:m_1' } : b.type === 'video' ? { ...b, src: 'media:m_2', poster: 'media:m_3' } : b));
    const note = { code: 'reviewNote' as const, values: { where: `Part 2, ${v.parts[1]!.title}`, text: 'The challenge gives no hint.' } };
    const kept = { code: 'reviewNote' as const, values: { where: 'Part 1', text: 'Another note.' } };
    const built = { ...c, lessons: { ...c.lessons, [first.id]: { ...first, keyIdeas: v.keyIdeas, page, facilitation: { ...v.facilitation, toCheck: [] }, gen: { plan: { basis: {}, at: '', edited: false, flags: [note, kept] } } } } } as unknown as Course;
    const again = { number: 2, title: v.parts[1]!.title, blocks: [...v.parts[1]!.blocks, { ...v.parts[0]!.blocks[0]!, type: 'callout', kind: 'tip', text: 'Start from the Rotate line and change one number.' }] };
    const model = fakeInference(() => ({ parts: [again], left: [] }));
    const fix = await fixNotes(model, built, first.id, [note], [kept], 'Give them a hint.');
    expect(model.calls[0]!.task).toBe('folio_module_mend');
    expect(model.calls[0]!.prompt).toContain('The challenge gives no hint. The teacher has decided: Give them a hint.');
    const fill = fix.commands[0]!;
    if (fill.type !== 'section.fill' || fill.payload.kind !== 'plan') throw new Error('no fill');
    const now = fill.payload.content.page!;
    expect(fill.payload.flags).toEqual([kept]);
    // Part 1 is the very blocks it was; part 2 has its new hint and the picture made for it.
    const cut = page.findIndex((b) => b.type === 'heading' && b.text === v.parts[1]!.title);
    expect(now.slice(0, cut)).toEqual(page.slice(0, cut));
    expect(now.some((b) => b.type === 'callout' && b.text.includes('change one number'))).toBe(true);
    expect(now.filter((b) => b.type === 'image').map((b) => b.type === 'image' && b.src)).toEqual(['media:m_1']);
    expect(now.at(-1)).toEqual(page.at(-1));
  });

  it('leaves the page alone and says why when the writer holds it is right', async () => {
    const c = online();
    const first = orderedLessons(c)[0]!;
    const built = { ...c, lessons: { ...c.lessons, [first.id]: { ...first, page: modulePage(draft(), 'en') } } } as Course;
    const note = { code: 'reviewNote' as const, values: { where: 'The page', text: 'The total is wrong.' } };
    const fix = await fixNotes(fakeInference(() => ({ parts: [], left: [{ note: 1, reason: 'mistaken', why: 'The checklist adds up to 180.' }] })), built, first.id, [note], []);
    expect(fix).toEqual({ commands: [], left: [{ note: 1, reason: 'mistaken', why: 'The checklist adds up to 180.' }] });
  });

  it('mends a lesson plan the same way, keeping the segments it did not touch', async () => {
    const store = new CourseStore(smallCourse());
    const first = orderedLessons(store.getState())[0]!;
    store.apply((await generateSection(fakeInference(() => planDraft), store.getState(), first.id, 'plan')).commands, { label: { key: 'b' }, source: 'ai' });
    const before = store.getState().lessons[first.id]!;
    const note = { code: 'reviewNote' as const, values: { where: 'Segment 1, Leaf in the dark', text: 'The leaves need a week in the dark first.' } };
    const fix = await fixNotes(fakeInference(() => ({ segments: [{ number: 1, ...planDraft.segments[0]!, description: 'Use leaves kept dark for a week.' }], left: [] })), store.getState(), first.id, [note], []);
    store.apply(fix.commands, { label: { key: 'b' }, source: 'ai' });
    const after = store.getState().lessons[first.id]!;
    expect(after.segments[0]).toMatchObject({ id: before.segments[0]!.id, description: 'Use leaves kept dark for a week.' });
    expect(after.segments.slice(1)).toEqual(before.segments.slice(1));
    expect(after.gen.plan?.flags).toEqual([]);
  });
});

describe('a picture looked at beside its step', () => {
  it('is shown the part it is in and the steps up to its own, and no step after', async () => {
    const c = online();
    const lesson = orderedLessons(c)[0]!;
    const shot = { src: '', alt: 'The Create menu', caption: 'Compare the menu.', shows: 'The Create menu with MonoBehaviour Script highlighted' };
    const page = [
      { id: 'x_h', type: 'heading' as const, level: 2 as const, text: 'Write a script' },
      { id: 'x_t', type: 'text' as const, text: 'A script is a component you write.' },
      { id: 'x_s', type: 'steps' as const, items: [{ id: 'x_1', text: 'Open the Assets menu.' }, { id: 'x_2', text: 'Choose Create > MonoBehaviour Script.', shot }, { id: 'x_3', text: 'Name it Spinner.' }] },
    ];
    const place = picturePlace(page, 'x_2')!;
    expect(place).toMatchObject({ part: 'Write a script', shows: shot.shows, caption: shot.caption });
    expect(place.before).toContain('A script is a component you write.');
    expect(place.before).toContain('Choose Create > MonoBehaviour Script.');
    expect(place.before).not.toContain('Name it Spinner.');
    const model = fakeInference(() => ({ shows: 'The Create menu', problems: ['The picture shows "C# Script"; the step says "MonoBehaviour Script".'], personal: [] }));
    const found = await checkPicture(model, c, lesson, place, { type: 'image/png', data: 'AAAA' });
    expect(found.problems).toHaveLength(1);
    expect(model.calls[0]!.images).toEqual([{ type: 'image/png', data: 'AAAA' }]);
    expect(model.calls[0]!.prompt).toContain(`It is in the part "${place.part}"`);
    expect(picturePlace(page, 'x_none')).toBeNull();
  });
});

describe('the files earlier weeks wrote', () => {
  it('are shown whole to a later week, the last version of each, and lines added inside a file are not taken for the file', () => {
    const c = online();
    const [first, second] = orderedLessons(c) as [Lesson, Lesson];
    const code = (caption: string, body: string) => ({ id: `x_${caption.length}${body.length}`, type: 'code' as const, language: 'csharp', code: body, caption });
    const page = [code('Assets/Scripts/Patrol.cs', 'float speed = 2f; // old'), code('Assets/Scripts/Patrol.cs', '[SerializeField] float speed = 3f;'), code('Patrol.cs, inside Update', 'speed++;')];
    const course = { ...c, lessons: { ...c.lessons, [first.id]: { ...first, page } } };
    const shown = filesSoFar(course, second);
    expect(shown).toMatch(/Patrol\.cs, as week 1 wrote it:\n\[SerializeField\] float speed = 3f;/);
    expect(shown).not.toMatch(/2f|speed\+\+/);
    expect(filesSoFar(course, first)).toBe('');
  });

  it('carry what a later block put into them, and weeks too far back to show whole are kept in brief', () => {
    const c = online();
    const [first, second] = orderedLessons(c) as [Lesson, Lesson];
    const code = (caption: string, body: string) => ({ id: `x_${caption.length}${body.length}`, type: 'code' as const, language: 'csharp', code: body, caption });
    const added = { ...c, lessons: { ...c.lessons, [first.id]: { ...first, page: [code('GameManager.cs', 'int lives = 3;'), code('New fields in GameManager.cs', 'bool gameEnded;')] } } };
    expect(filesSoFar(added, second)).toMatch(/GameManager\.cs, as week 1 wrote it:\nint lives = 3;\nThen week 1 put in \("New fields in GameManager\.cs"\):\nbool gameEnded;/);
    // A first week longer than the room for whole weeks is still told of: its ideas, terms and what students did.
    const page = Array.from({ length: 40 }, (_, i) => [{ id: `x_h${i}`, type: 'heading' as const, level: 2 as const, text: `Part ${i}` }, { id: `x_t${i}`, type: 'text' as const, text: 'word '.repeat(300) }]).flat();
    const far = { ...c, lessons: { ...c.lessons, [first.id]: { ...first, keyIdeas: ['A script is a component.'], page } } } as Course;
    const prompt = sectionPrompt(far, far.lessons[second.id]!, 'plan');
    expect(prompt).toMatch(/Further back, in brief:\n"[^"]+"\n Key ideas: A script is a component\.\n What students did: Part 0; Part 1;/);
    expect(prompt).not.toContain('word word word');
  });
});
