import { OnlineSchema, hasModulePages, orderedLessons, pageMinutes, textRuns, type Course } from '@folio/core';
import { describe, expect, it } from 'vitest';
import { OutlineDraft, courseBackground, courseFromOutline, generateSection, outlinePrompt, sectionPrompt, type NewCourseRequest } from '../src';
import { applyModuleReview } from '../src/moduleReview';
import { checkRunOfShow } from '../src/live';
import { ModuleDraft, checkModule, modulePage } from '../src/online';
import { typesetDraft } from '../src/typeset';
import { fakeInference, smallCourse } from './fake';

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
          { type: 'steps', items: ['In the **Project** window, right-click **Assets**.', 'Choose **Create > Scripting > MonoBehaviour Script**.'], shots: [{ step: 2, shows: 'The Create menu open on Scripting', alt: 'The Create menu with MonoBehaviour Script highlighted' }] },
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
    expect(JSON.stringify(checkModule(unchecked, c))).toMatch(/has 7 steps and 0 pictures/);
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
    const built: Course = { ...c, lessons: { ...c.lessons, [first!.id]: { ...first!, page: modulePage(draft(), 'en'), facilitation: { announcement: 'a', watchFor: [], feedback: [], atRisk: '', leaves: ['Ramp at 0, 2, -4, tilted 20 degrees', 'Ball at 0, 6, -7 with a Rigidbody'] } } } };
    expect(sectionPrompt(built, built.lessons[second!.id]!, 'plan') + courseBackground(built)).toContain('Ramp at 0, 2, -4, tilted 20 degrees');
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
});
