// The sample courses on the home page, written the way Folio writes any course: the brief read as the home page
// reads it, an outline, then every lesson built by the build queue with Folio credits' mix of models (Claude
// Sonnet writes, GPT-6 Luna writes quizzes and assignments, GPT-6.1 Sol checks each plan). The models answer
// through the local `claude` and `codex` CLIs instead of the APIs, so a run costs no API money.
//   pnpm --filter @folio/web exec tsx scripts/make-samples.ts [--polish] [elementary|middle|university ...]
// A sample is shown as Folio's best work, so after the build every part a check flagged is written again
// (--polish does only that, on samples already written).
// Writes apps/web/public/samples/<name>.json; logs every call to apps/web/scripts/.samples-log.jsonl.
// A quality check-up runs other briefs the same way and keeps the course exactly as a teacher would get it:
//   ... make-samples.ts --briefs <file.json> --out <dir> [names]
// where the file is [{ "name", "brief", "attach"?: [absolute paths], "syllabus"?: title of the attached file that
// is the syllabus, "policies"? }]; nothing is written again.
import { MATERIAL_KINDS, CourseStore, OnlineSchema, cmd, orderedLessons, parseCourse, type Course, type Delivery, type GeneratedKind, type Online } from '@folio/core';
import { BUILT_ON_PLAN, briefWithAnswers, clarifyCourse, costOf, courseFromOutline, createInference, lessonsToPlan, minutesToPlan, generateOutline, missingTargets, runBuild, type BuildHost, type BuildTarget, type NewCourseRequest, type Usage } from '@folio/ai';
import { AsyncLocalStorage } from 'node:async_hooks';
import { spawn } from 'node:child_process';
import { nodeRunner } from '@folio/run/node';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { guessLessons, guessLevel, guessMinutes, guessQuizSize, guessSessions } from '../src/lib/brief';
import type { SampleName } from '../src/lib/samples';

const WEB = new URL('..', import.meta.url).pathname;
const ARGS = process.argv.slice(2);
const option = (flag: string): string | undefined => {
  const i = ARGS.indexOf(flag);
  return i >= 0 ? ARGS[i + 1] : undefined;
};
const OUT = option('--out') ?? join(WEB, 'public/samples');
const LOG = join(WEB, 'scripts/.samples-log.jsonl');
mkdirSync(OUT, { recursive: true });
/** An empty folder for the CLIs to run in: they read nothing of this repository. */
const CWD = mkdtempSync(join(tmpdir(), 'folio-samples-'));


/** Each sample's brief, written as a teacher there would: a unit for school, a semester for university. */
export const BRIEFS: Record<SampleName, string> = {
  elementary:
    'Life cycles of plants and animals for grade 2 science: a two-week unit of ten 40-minute lessons. Students observe and compare the life cycles of a bean plant, a butterfly and a frog, put the stages in order, and notice what all living things share: they are born, grow, reproduce and die. Start a bean-sprouting observation in the first lesson that students record in an observation journal through the unit, use picture cards for sequencing, and read aloud a picture book where it helps. Short check-ins along the way are practice and are not graded. The only graded work is the final drawing-and-labeling assessment of one life cycle, done in the last lesson and scored with a simple rubric: it is 100% of the unit grade.',
  middle:
    'Writing argumentative essays for grade 8 English language arts: a three-week unit of fifteen 45-minute lessons. Students learn to state a clear claim, support it with reasons and evidence from two short articles, explain how the evidence supports the claim, answer a counterclaim, and organize a five-paragraph essay with an introduction and a conclusion. The topic is one they care about: should school start later? Use the two attached opinion articles, one for and one against, as the evidence students read, mark up and cite. Build the essay in steps across the unit: a planning organizer, model paragraphs, drafting in class, a peer review session and revision. Grading: the final essay 60% with a rubric, the organizer and drafts 25%, and short quizzes on the terms of argument 15%.',
  university:
    'Introduction to ethics for first-year university students: a 14-week semester, each week a 75-minute lecture and a 50-minute seminar. The textbook is James Rachels and Stuart Rachels, The Elements of Moral Philosophy, with primary readings each week. Week 1, what morality is (Rachels, chapter 1). Week 2, how to argue about ethics (Anthony Weston, A Rulebook for Arguments). Week 3, cultural relativism (Rachels, chapter 2). Week 4, utilitarianism (John Stuart Mill, Utilitarianism, chapter 2; Rachels, chapters 7 and 8). Week 5, Kant (Immanuel Kant, Groundwork of the Metaphysics of Morals, section II; Rachels, chapters 9 and 10). Week 6, virtue ethics (Aristotle, Nicomachean Ethics, book II; Rachels, chapter 12). Week 7, social contract theory (Thomas Hobbes, Leviathan, chapters 13 to 15; Rachels, chapter 6). Week 8, the theories tested on hard cases (Judith Jarvis Thomson, "The Trolley Problem"). Weeks 9 and 10, what we owe distant strangers (Peter Singer, "Famine, Affluence, and Morality"; Thomas Nagel, "The Problem of Global Justice"). Week 11, the moral status of animals (Peter Singer, "All Animals Are Equal"; Carl Cohen, "The Case for the Use of Animals in Biomedical Research"). Week 12, who is responsible when an AI system causes harm (Andreas Matthias, "The responsibility gap"; Robert Sparrow, "Killer Robots"). Week 13, from a case to an argument: writing the final paper. Week 14, review for the exam. Students prepare the seminar discussion questions in advance. Grading: weekly reading responses of 400 to 500 words 20%, seminar participation 10%, a 1,200-word paper defending one theory, due in week 7, 20%, a 2,000-word argumentative paper on one of the applied questions, due in week 13, 25%, and a final exam 25%, with rubrics for the papers.',
  'water-cycle':
    'The water cycle for grade 5 science: five 50-minute lessons. Follow my attached notes. Students explain evaporation, condensation, precipitation and collection, build a water cycle model, and finish with a labeled diagram and a paragraph tracing one water drop. Grading: the diagram and paragraph 70%, lesson quizzes 30%. Support my two below-grade readers and the Spanish-speaking newcomer in every lesson with picture word banks, sentence frames and the key terms in Spanish.',
  ratios:
    'Ratios and rates for grade 6 math: eight 50-minute lessons. Ratio language, ratio tables, tape diagrams, unit rates and percent as a rate per 100. No homework: the unit is assessed by two in-class quizzes (40%) and an end-of-unit test (60%).',
  chemistry:
    'Stoichiometry for grade 10 chemistry: ten 55-minute lessons on the mole, molar mass, balancing equations, mole ratios, limiting reactants and percent yield. Two labs: a baking soda and vinegar reaction to find the mass of carbon dioxide released, and a copper chloride and aluminum foil reaction to find the limiting reactant, each with a lab report. Problem sets twice a week. Grading: lab reports 30%, problem sets 20%, unit test 50%.',
  // The online sample: taught on the students' own time, from the teacher's notes on the tool's version.
  unity:
    'Game development with Unity for complete beginners: a 14-week asynchronous online course for undergraduates, 3 credits, about 9 hours of work a week. Students have never written code and never made a game. They work alone on their own Windows or Mac computer; there are no live sessions, and a student who follows the week\'s page with nobody to ask must be able to finish the week. Software, all free: Unity 6.6 (editor 6000.6) installed through Unity Hub with a Unity Personal license, and Visual Studio Code with the Unity extension for writing C#. Projects start from the Universal 3D template, except the 2D game, which starts from the Universal 2D template. Version facts every page must respect: new projects use the Input System package only, so the old Input class (Input.GetAxis, Input.GetKey) throws an error and input is read with Keyboard.current or an InputAction; a Rigidbody\'s velocity is linearVelocity; on-screen text is TextMeshPro; an object is found with FindAnyObjectByType. My attached version notes list the exact menu names and code for this version: follow them. Students build three small games by following along, then one of their own. Game 1, Orb Collector (weeks 2 to 5): roll a ball around an arena, collect spinning pickups, show a score and a win message. Game 2, Dodge (weeks 6 to 9): move a player to avoid hazards that spawn faster and faster, with lives, game over and restart, sound, particles, and a start menu. Game 3, Hop (weeks 10 and 11): a 2D platformer with a tilemap level, jumping, sprite animation and collectibles. Weeks 12 to 14: each student designs, builds, playtests and shares a small game of their own. Week by week: 1, setting up Unity and a tour of the Editor, building a small scene from primitive shapes; 2, GameObjects and components, materials and light, physics with Rigidbody and colliders; 3, the first C# script: variables, Start and Update, the Console and how to read an error; 4, input and movement: vectors, forces, FixedUpdate, a camera that follows; 5, collisions, triggers and scoring: if statements, tags, counting, text on screen, winning; 6, prefabs and spawning: Instantiate, random positions, timers, destroying objects; 7, game state and UI: lives, game over, restart, methods, buttons; 8, sound, particles and game feel; 9, menus and scenes, building the game so a classmate can run it on Windows or Mac, then finishing and playtesting Dodge with a twist of your own; 10, 2D: sprites, tilemaps, 2D physics, running and jumping; 11, 2D animation, collectibles and a camera that follows, and the proposal for your own game; 12, scoping and prototyping your own game, and how to debug; 13, playtesting with classmates, iterating and polishing; 14, showcase, reflection, and what to learn next. Every week has the same shape: a guided build that leaves something working on screen, a challenge without steps, a self-check quiz, a forum post that shares a screenshot or short clip of the build (and replies after trying two classmates\' ideas), and something to submit. Grading: weekly builds 40% (submitted as a short screen recording and a screenshot), forum participation 15%, the Dodge game with your own twist, due in week 9, 15%, and the final game project 30% (proposal in week 11, playable prototype in week 12, final build and showcase post in week 14), with rubrics for the two games.',
  reconstruction:
    'Reconstruction for grade 11 US history: eight 50-minute lessons from the end of the Civil War to the Compromise of 1877: Lincoln\'s and Johnson\'s plans, the Freedmen\'s Bureau, the 13th, 14th and 15th Amendments, Black Codes, Radical Reconstruction, the rise of the Ku Klux Klan and the end of Reconstruction. Use short primary-source excerpts in every lesson, a Socratic seminar on whether Reconstruction failed, and a document-based essay at the end (50%). Seminar 20%, lesson exit tickets 30%.',
};

function run(cmd: string, args: string[], input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: CWD, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} exited ${code}: ${err.slice(-300)}`))));
    child.stdin.end(input);
  });
}

const textOf = (content: unknown): string =>
  typeof content === 'string' ? content : (content as { text?: string }[]).map((b) => b.text ?? '').join('\n\n');
const jsonIn = (text: string) => text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
const schemaNote = (schema: unknown) => `\n\nAnswer with one JSON object that matches this JSON Schema, and nothing else:\n${JSON.stringify(schema)}`;

/** An Anthropic Messages request, answered by `claude -p` with the model and effort it names. */
async function viaClaude(body: Record<string, unknown>): Promise<string> {
  const system = textOf(body.system ?? '');
  const prompt = (body.messages as { content: unknown }[]).map((m) => textOf(m.content)).join('\n\n');
  const config = body.output_config as { effort?: string; format?: { schema?: unknown } } | undefined;
  const args = ['-p', '--model', String(body.model), '--output-format', 'json', '--tools', '', '--no-session-persistence', '--max-turns', '1'];
  args.push('--system-prompt', system + (config?.format?.schema ? schemaNote(config.format.schema) : ''));
  if (config?.effort) args.push('--effort', config.effort);
  const out = JSON.parse(await run('claude', args, prompt)) as { result?: string; is_error?: boolean };
  if (out.is_error || !out.result) throw new Error('claude gave no answer');
  return jsonIn(out.result);
}

/** An OpenAI chat request, answered by `codex exec` with the model and reasoning effort it names. */
async function viaCodex(body: Record<string, unknown>): Promise<string> {
  const messages = body.messages as { role: string; content: unknown }[];
  const schema = (body.response_format as { json_schema?: { schema?: unknown } } | undefined)?.json_schema?.schema;
  const prompt = messages.map((m) => `${m.role === 'system' ? 'Instructions' : 'Request'}:\n${textOf(m.content)}`).join('\n\n') + (schema ? schemaNote(schema) : '');
  const file = join(CWD, `codex-${Math.random().toString(36).slice(2)}.txt`);
  await run('codex', ['exec', '-m', String(body.model), '-c', `model_reasoning_effort=${String(body.reasoning_effort ?? 'medium')}`, '--skip-git-repo-check', '-s', 'read-only', '-o', file, '-'], prompt);
  return jsonIn(readFileSync(file, 'utf8'));
}

const anthropicAnswer = (body: Record<string, unknown>, text: string) => ({
  id: `msg_${Date.now()}`,
  type: 'message',
  role: 'assistant',
  model: body.model,
  content: [{ type: 'text', text }],
  stop_reason: 'end_turn',
  stop_sequence: null,
  usage: { input_tokens: 0, output_tokens: 0 },
});

/** The same answer as a stream, for a request that asked for one (a long answer). */
function anthropicStream(body: Record<string, unknown>, text: string): string {
  const message = { ...anthropicAnswer(body, ''), content: [] };
  const events: [string, unknown][] = [
    ['message_start', { type: 'message_start', message }],
    ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
    ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }],
    ['content_block_stop', { type: 'content_block_stop', index: 0 }],
    ['message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 0 } }],
    ['message_stop', { type: 'message_stop' }],
  ];
  return events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('');
}

/** What Folio credits send to Folio's server, answered by the CLIs instead. */
const cliFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
  const openai = url.includes('/openai/v1/chat/completions');
  const started = Date.now();
  try {
    const text = openai ? await viaCodex(body) : await viaClaude(body);
    appendFileSync(LOG, `${JSON.stringify({ at: new Date().toISOString(), model: body.model, ms: Date.now() - started, chars: text.length })}\n`);
    if (openai) return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }], usage: { prompt_tokens: 0, completion_tokens: 0 } });
    if (body.stream) return new Response(anthropicStream(body, text), { headers: { 'content-type': 'text/event-stream' } });
    return Response.json(anthropicAnswer(body, text));
  } catch (error) {
    appendFileSync(LOG, `${JSON.stringify({ at: new Date().toISOString(), model: body.model, ms: Date.now() - started, error: String(error).slice(0, 300) })}\n`);
    // Answered as the APIs answer an overloaded server, so Folio's own retries take over.
    return new Response(JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message: 'busy' } }), { status: 529, headers: { 'content-type': 'application/json', 'retry-after': '5' } });
  }
}) as typeof fetch;

/** The request the home page makes from this brief, with every material. */
/** The class policies each teacher would type in: Folio leaves them to the teacher. */
const POLICIES: Record<SampleName, string> = {
  elementary:
    'Observation journals, check-ins and quizzes are practice and are not graded. The final life cycle drawing is scored with the rubric; a student who is absent draws it on their return.\n\nSpelling does not count toward the score: a name that can be read, such as "krisalis", is accepted. Read any prompt aloud for a student who needs it.\n\nBeans and other materials are for looking at, never for eating. Tell me about any food allergies before the unit begins.',
  middle:
    'Bring your writing folder to every class: the organizer, drafts and peer review sheets all stay in it until the final essay is handed in.\n\nDrafts are due on the day set in class. A late draft can still earn full credit if it is finished before peer review, so that your partner has something to read.\n\nEssays use evidence only from the two unit articles, with the article named each time. Copying sentences without quotation marks, from the articles or anywhere else, is plagiarism.',
  university:
    'Attendance at seminars is expected; participation is graded on preparation and contribution, not on how often you speak. Read the assigned texts before the seminar and bring them with you.\n\nPapers are submitted through the course site by 11:59 p.m. on the due date. Late papers lose a third of a letter grade per day unless an extension is arranged before the due date.\n\nAI tools may be used to brainstorm or check grammar, but not to write any part of submitted work; say in a note at the end of a paper how you used them. All work follows the university\'s academic integrity policy.\n\nStudents who need accommodations should contact Accessibility Services and let me know in the first two weeks.',
  'water-cycle':
    'Science notebooks stay in class; bring a pencil every day.\n\nThe kettle and the lamp are for the teacher only. Water on the floor is wiped up at once, and the lamp and its cord stay dry.\n\nLesson quizzes are open-notebook. A student who is absent takes the quiz on the day they return.\n\nThe final diagram and paragraph may use the word bank and sentence frames; Spanish labels beside the English ones are welcome.',
  ratios:
    'There is no homework in this unit: practice happens in class. Bring a pencil, your math notebook and a ruler every day.\n\nA calculator may be used only where the lesson says so; quizzes and the unit test are done without one.\n\nA student absent for a quiz or the test takes it within two school days of returning. Quiz corrections done in class earn back half of the points lost.',
  chemistry:
    'Goggles, apron and closed-toe shoes are required on lab days; a student without them observes and writes up the data from a partner. No food or drink in the lab.\n\nProblem sets are due at the start of class two days after they are set. Late sets lose 10% a day, up to three days.\n\nLab reports are written individually from data collected with a partner; shared data is fine, shared wording is not.\n\nBring a scientific calculator and a periodic table every day. The unit test allows both.',
  unity: '',
  reconstruction:
    'This unit includes sources that describe racial violence and use the language of their time. We read them as evidence, we do not repeat slurs aloud, and anyone may step out for a moment without asking.\n\nExit tickets are collected every lesson and cannot be made up without an excused absence.\n\nThe document-based essay is submitted on paper or through the class site by the start of class on the due date; late essays lose 5% a day.\n\nQuote and cite the documents we read in class. Wording copied from anywhere without quotation marks is plagiarism.',
};

/** The files a teacher would attach with each brief. */
const ATTACHED: Partial<Record<SampleName, string[]>> = { middle: ['article-for.md', 'article-against.md'], 'water-cycle': ['water-cycle-notes.md'], unity: ['unity-6.6-notes.md'] };
/** The samples taught online: how each meets. */
const DELIVERY: Partial<Record<SampleName, Delivery>> = { unity: 'online-async' };

interface Spec {
  delivery?: Delivery;
  online?: Partial<Online>;
  brief: string;
  attach: string[];
  policies: string;
  syllabus?: string;
}

/** A check-up's own briefs, when it gives a file of them. */
const CHECKUP: Record<string, Spec> | null = option('--briefs')
  ? Object.fromEntries(
      (JSON.parse(readFileSync(option('--briefs')!, 'utf8')) as (Partial<Spec> & { name: string; brief: string })[]).map((b) => [b.name, { brief: b.brief, attach: b.attach ?? [], policies: b.policies ?? '', syllabus: b.syllabus, delivery: b.delivery, online: b.online }]),
    )
  : null;

function specFor(name: string): Spec {
  if (CHECKUP) return CHECKUP[name] ?? (() => { throw new Error(`no brief named ${name}`); })();
  const sample = name as SampleName;
  return { brief: BRIEFS[sample], attach: (ATTACHED[sample] ?? []).map((file) => join(WEB, 'scripts/sample-sources', file)), policies: POLICIES[sample], delivery: DELIVERY[sample] };
}

function attached(paths: string[]): { title: string; text: string }[] {
  return paths.map((path) => {
    const text = readFileSync(path, 'utf8');
    return { title: text.split('\n')[0]!.replace(/^#\s*/, ''), text };
  });
}

/**
 * As the app does before the outline: read the brief and files, and answer any question with the answer Folio
 * offers first, its most likely. The questions are kept beside the course, to be read as part of the check-up.
 */
async function clarified(name: string, req: NewCourseRequest, spec: Spec): Promise<NewCourseRequest> {
  const read = await clarifyCourse(inference, { brief: req.brief, sources: req.sources, language: req.language, locale: req.locale, level: req.level, lessonCount: req.lessonCount, defaultLessons: 4, sessions: req.sessions, delivery: req.delivery }).catch(() => null);
  // The first answer that stands on its own: "I'll paste the list" promises something no one will then give.
  const answers = (read?.questions ?? []).map((q) => ({ question: q.question, answer: q.options.find((o) => !/^I(?:'|’)ll\b|^I will\b/i.test(o)) ?? q.options[0]! }));
  writeFileSync(join(OUT, `${name}.clarify.json`), JSON.stringify({ read, answers }, null, 1));
  const syllabus = (read ? read.syllabus : spec.syllabus) || undefined;
  return {
    ...req,
    brief: briefWithAnswers(req.brief, answers),
    lessonCount: lessonsToPlan({ ...req, defaultLessons: 4 }, read, answers),
    minutesPerLesson: minutesToPlan(req.minutesPerLesson, read, answers),
    level: req.level || read?.level || '',
    ...(syllabus ? { syllabus } : {}),
  };
}

function requestFor(spec: Spec): NewCourseRequest {
  const brief = spec.brief;
  return {
    brief,
    lessonCount: guessLessons(brief),
    // A check-up asks as the app does: an unstated length is left for the files and the questions to settle.
    minutesPerLesson: guessMinutes(brief) ?? (CHECKUP ? 0 : 50),
    sessions: guessSessions(brief) ?? undefined,
    quizSize: guessQuizSize(brief) ?? 5,
    level: guessLevel(brief) ?? '',
    language: 'en',
    locale: 'en-US',
    materials: [...MATERIAL_KINDS],
    ...(spec.delivery ? { delivery: spec.delivery, online: OnlineSchema.parse(spec.online ?? {}) } : {}),
    sources: attached(spec.attach),
  };
}

const TASK_KIND: Record<string, GeneratedKind> = { question: 'quiz', assignment: 'assignments', discussion: 'discussions' };

/**
 * The parts to write again: any section or item a check flagged, and assignments sharing a title with another
 * (two lessons each writing the whole of one graded piece). A plan written again takes what was built on it.
 */
function flawed(course: Course): BuildTarget[] {
  const titles = new Map<string, number>();
  for (const t of Object.values(course.tasks)) if (t.kind === 'assignment') titles.set(t.title, (titles.get(t.title) ?? 0) + 1);
  const found = new Set<string>();
  for (const lesson of orderedLessons(course)) {
    for (const [kind, gen] of Object.entries(lesson.gen)) if (gen?.flags.length) found.add(`${lesson.id}:${kind}`);
    for (const id of lesson.taskIds) {
      const t = course.tasks[id];
      if (t && (t.flags.length || (t.kind === 'assignment' && titles.get(t.title)! > 1))) found.add(`${lesson.id}:${TASK_KIND[t.kind]}`);
    }
    if (found.has(`${lesson.id}:plan`)) for (const kind of Object.keys(lesson.gen)) if (BUILT_ON_PLAN.has(kind as never)) found.add(`${lesson.id}:${kind}`);
  }
  return [...found].map((key) => ({ lessonId: key.split(':')[0]!, kind: key.split(':')[1] as GeneratedKind }));
}

/** What each check said, kept in the log for reading the run afterwards. */
function noteFlags(name: string, course: Course): void {
  for (const lesson of orderedLessons(course)) {
    for (const [kind, gen] of Object.entries(lesson.gen)) for (const flag of gen?.flags ?? []) appendFileSync(LOG, `${JSON.stringify({ sample: name, lesson: lesson.title, kind, flag })}\n`);
    for (const id of lesson.taskIds) for (const flag of course.tasks[id]?.flags ?? []) appendFileSync(LOG, `${JSON.stringify({ sample: name, lesson: lesson.title, task: id, flag })}\n`);
  }
}

/**
 * --paid sends the same requests to the providers themselves, with the experiment keys kept in the Keychain (read
 * from the local key page, never printed), so that what a course costs is counted from the tokens each call reports.
 */
const PAID = ARGS.includes('--paid');
const keyOf = async (name: string) => (await (await fetch(`http://127.0.0.1:8799/key/${name}`, { headers: { 'x-experiment': '1' } })).text()).trim();
const KEYS = PAID ? { anthropic: await keyOf('anthropic'), openai: await keyOf('openai') } : null;
const paidFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  const openai = url.includes('/openai/v1/chat/completions');
  const headers = new Headers(init?.headers);
  headers.delete('x-folio');
  if (openai) headers.set('authorization', `Bearer ${KEYS!.openai}`);
  else headers.set('x-api-key', KEYS!.anthropic);
  const started = Date.now();
  const res = await fetch(openai ? 'https://api.openai.com/v1/chat/completions' : url.replace('https://folio.local/api/ai', 'https://api.anthropic.com'), { ...init, headers });
  appendFileSync(LOG, `${JSON.stringify({ at: new Date().toISOString(), paid: true, model: (JSON.parse(String(init?.body)) as { model?: string }).model, ms: Date.now() - started, status: res.status })}\n`);
  return res;
}) as typeof fetch;
/** Every call's tokens, as its provider reported them, by the job that made it. */
const USED: (Usage & { task: string })[] = [];
// Calls overlap, so which job an answer's tokens belong to is carried with the call itself: read from one shared name,
// a first run put the weekly pages' cost under whichever job had been asked for last.
const asking = new AsyncLocalStorage<string>();

const made = createInference({ provider: 'folio', apiKey: '', model: 'claude-sonnet-5-5', baseUrl: 'https://folio.local/api/ai' }, PAID ? paidFetch : cliFetch, (u) => USED.push({ ...u, task: asking.getStore() ?? '' }));
const inference: typeof made = { ...made, complete: (request) => asking.run(request.task, () => made.complete(request)) };

/** `--run`: the Python on module pages is run, as a teacher's browser will, and the pages show what it prints. */
const RUN = ARGS.includes('--run');
const RUNNER = nodeRunner();
let figureCount = 0;
/** A figure a page's code drew, kept beside the course under its name. */
async function saveFigure(name: string, png: Uint8Array): Promise<string> {
  mkdirSync(join(OUT, `${name}-figures`), { recursive: true });
  const file = `${name}-figures/figure-${++figureCount}.png`;
  writeFileSync(join(OUT, file), png);
  return file;
}

async function build(name: string, store: CourseStore, targets: BuildTarget[], failed: string[]): Promise<number> {
  const host: BuildHost = {
    inference,
    reviewer: inference,
    run: RUN ? { runner: RUNNER, saveFigure: (png) => saveFigure(name, png) } : undefined,
    getCourse: store.getState,
    commit: (_target, commands) => {
      store.apply(commands, { label: { key: 'built' }, source: 'ai', undoable: false });
      // Kept as it grows: a long course cut short is carried on with --polish, not started again.
      writeFileSync(join(OUT, `${name}.json`), JSON.stringify({ ...store.getState(), status: 'building' }));
    },
    onEvent: (event) => {
      if (event.type !== 'error') return;
      failed.push(`${event.target.kind}: ${event.error.message}`);
      // Said at once: a week that fails while later weeks go on is otherwise unseen until the run ends.
      console.log(`${name}: ${event.target.kind} failed: ${event.error.message.split('\n')[0]!.slice(0, 600)}`);
    },
    // Each round of mending, with what it was told and what the next reading found: how the notes that ship came to stay.
    onProgress: (target, progress) => {
      if (progress.type === 'mended') appendFileSync(LOG, `${JSON.stringify({ at: new Date().toISOString(), sample: name, lesson: store.getState().lessons[target.lessonId]?.title, ...progress })}\n`);
    },
    signal: new AbortController().signal,
  };
  const summary = await runBuild(host, targets);
  console.log(`${name}: ${summary.built} written, ${summary.failed} failed`);
  return summary.built;
}

async function make(name: string, polishOnly: boolean): Promise<void> {
  const started = Date.now();
  const failed: string[] = [];
  let store: CourseStore;
  if (polishOnly) {
    store = new CourseStore(parseCourse(JSON.parse(readFileSync(join(OUT, `${name}.json`), 'utf8'))));
  } else {
    const spec = specFor(name);
    const req = CHECKUP ? await clarified(name, requestFor(spec), spec) : requestFor(spec);
    store = new CourseStore(courseFromOutline(req, await generateOutline(inference, req)));
    if (spec.policies) store.apply([cmd('course.update', { policies: spec.policies })], { label: { key: 'built' }, source: 'teacher', undoable: false });
    // A graded drawing done in class has no homework to set, and so no rubric: the teacher sets it as the last
    // lesson's graded assignment, so Folio writes its instructions and rubric.
    if (name === 'elementary' && !CHECKUP) {
      const last = orderedLessons(store.getState()).at(-1)!;
      const item = store.getState().grading[0]?.item ?? '';
      store.apply([cmd('lesson.homework', { lessonId: last.id, homework: { kind: 'assignment', toward: item } })], { label: { key: 'built' }, source: 'teacher', undoable: false });
    }
    console.log(`${name}: outline "${store.getState().title}", ${orderedLessons(store.getState()).length} lessons`);
  }
  // --lessons N writes only the first N lessons: a long course is tried a few weeks at a time, then carried on with --polish.
  const first = option('--lessons') ? store.getState().lessonOrder.slice(0, Number(option('--lessons'))) : undefined;
  for (let round = 0; round < 3 && missingTargets(store.getState(), first).length; round++) await build(name, store, missingTargets(store.getState(), first), failed);
  // A check-up keeps what a teacher would get: the review's notes stay, nothing is written again.
  for (let round = 0; round < 2 && !CHECKUP && flawed(store.getState()).length; round++) {
    console.log(`${name}: writing again ${flawed(store.getState()).length} parts`);
    noteFlags(name, store.getState());
    await build(name, store, flawed(store.getState()), failed);
  }
  const course: Course = { ...store.getState(), status: missingTargets(store.getState()).length ? 'building' : 'ready' };
  writeFileSync(join(OUT, `${name}.json`), JSON.stringify(course));
  const left = flawed(course).length;
  noteFlags(name, course);
  console.log(`${name}: done in ${((Date.now() - started) / 60000).toFixed(1)} min, ${missingTargets(course).length} parts missing, ${left} still flagged${failed.length ? `; failures seen: ${failed.slice(0, 3).join(' | ')}` : ''}`);
}

const polishOnly = ARGS.includes('--polish');
const names = ARGS.filter((a, i) => !a.startsWith('--') && !['--out', '--briefs', '--lessons'].includes(ARGS[i - 1] ?? ''));
const asked = names.length ? names : Object.keys(CHECKUP ?? BRIEFS);
await Promise.all(asked.map((name) => make(name, polishOnly)));
if (PAID) {
  const by = new Map<string, Usage[]>();
  for (const u of USED) by.set(u.task, [...(by.get(u.task) ?? []), u]);
  const row = (name: string, list: Usage[]) => `${name.padEnd(24)} ${String(list.length).padStart(4)} calls  in ${String(list.reduce((n, u) => n + u.input + u.cacheRead + u.cacheWrite, 0)).padStart(8)}  out ${String(list.reduce((n, u) => n + u.output, 0)).padStart(7)}  $${costOf(list, null).usd.toFixed(3)}`;
  console.log([...by].sort((a, b) => costOf(b[1], null).usd - costOf(a[1], null).usd).map(([name, list]) => row(name, list)).join('\n'));
  console.log(row('TOTAL', USED));
}
// The notebook's thread would keep the script alive after its last course: three runs sat finished until they were stopped.
RUNNER.close();
