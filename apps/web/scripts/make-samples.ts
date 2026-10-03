// The sample courses on the home page, written the way Folio writes any course: the brief read as the home page
// reads it, an outline, then every lesson built by the build queue with Folio credits' mix of models (Claude
// Sonnet writes, GPT-6 Luna writes quizzes and assignments, GPT-6.1 Sol checks each plan). The models answer
// through the local `claude` and `codex` CLIs instead of the APIs, so a run costs no API money.
//   pnpm --filter @folio/web exec tsx scripts/make-samples.ts [--polish] [elementary|middle|university ...]
// A sample is shown as Folio's best work, so after the build every part a check flagged is written again
// (--polish does only that, on samples already written).
// Writes apps/web/public/samples/<name>.json; logs every call to apps/web/scripts/.samples-log.jsonl.
import { MATERIAL_KINDS, CourseStore, orderedLessons, parseCourse, type Course, type GeneratedKind } from '@folio/core';
import { BUILT_ON_PLAN, courseFromOutline, createInference, generateOutline, missingTargets, runBuild, type BuildHost, type BuildTarget, type NewCourseRequest } from '@folio/ai';
import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { guessLessons, guessLevel, guessMinutes, guessQuizSize, guessSessions } from '../src/lib/brief';
import type { SampleName } from '../src/lib/samples';

const WEB = new URL('..', import.meta.url).pathname;
const OUT = join(WEB, 'public/samples');
const LOG = join(WEB, 'scripts/.samples-log.jsonl');
mkdirSync(OUT, { recursive: true });
/** An empty folder for the CLIs to run in: they read nothing of this repository. */
const CWD = mkdtempSync(join(tmpdir(), 'folio-samples-'));


/** Each sample's brief, written as a teacher there would: a unit for school, a semester for university. */
export const BRIEFS: Record<SampleName, string> = {
  elementary:
    'Life cycles of plants and animals for grade 2 science: a two-week unit of ten 40-minute lessons. Students observe and compare the life cycles of a bean plant, a butterfly and a frog, put the stages in order, and notice what all living things share: they are born, grow, reproduce and die. Start a bean-sprouting observation in the first lesson that students record in an observation journal through the unit, use picture cards for sequencing, and read aloud a picture book where it helps. Short check-ins along the way; the unit ends with a drawing-and-labeling assessment of one life cycle, graded with a simple rubric.',
  middle:
    'Writing argumentative essays for grade 8 English language arts: a three-week unit of fifteen 45-minute lessons. Students learn to state a clear claim, support it with reasons and evidence from two short articles, explain how the evidence supports the claim, answer a counterclaim, and organize a five-paragraph essay with an introduction and a conclusion. Use a topic they care about: should school start later? Supply the two articles, one for and one against. Build the essay in steps across the unit: a planning organizer, model paragraphs, drafting in class, a peer review session and revision. Grading: the final essay 60% with a rubric, the organizer and drafts 25%, and short quizzes on the terms of argument 15%.',
  university:
    'Introduction to ethics for first-year university students: a 14-week semester, each week a 75-minute lecture and a 50-minute seminar. Begin with what ethics is and how to argue about it; then consequentialism, deontology, virtue ethics, social contract theory and moral relativism, with classic readings (Mill, Kant, Aristotle, Hobbes, James Rachels); then apply the theories to current questions: what we owe distant strangers, the moral status of animals, and who is responsible when an AI system causes harm. The last week reviews for the exam. Give each seminar discussion questions students prepare in advance. Grading: weekly reading responses 20%, seminar participation 10%, a 1,200-word paper on one theory 20%, a 2,000-word argumentative paper 25%, and a final exam 25%, with rubrics for the papers.',
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
function requestFor(brief: string): NewCourseRequest {
  return {
    brief,
    lessonCount: guessLessons(brief),
    minutesPerLesson: guessMinutes(brief) ?? 50,
    sessions: guessSessions(brief) ?? undefined,
    quizSize: guessQuizSize(brief) ?? 5,
    level: guessLevel(brief) ?? '',
    language: 'en',
    locale: 'en-US',
    materials: [...MATERIAL_KINDS],
    sources: [],
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

const inference = createInference({ provider: 'folio', apiKey: '', model: 'claude-sonnet-5-5', baseUrl: 'https://folio.local/api/ai' }, cliFetch);

async function build(name: string, store: CourseStore, targets: BuildTarget[], failed: string[]): Promise<number> {
  const host: BuildHost = {
    inference,
    reviewer: inference,
    getCourse: store.getState,
    commit: (_target, commands) => store.apply(commands, { label: { key: 'built' }, source: 'ai', undoable: false }),
    onEvent: (event) => void (event.type === 'error' && failed.push(`${event.target.kind}: ${event.error.message}`)),
    signal: new AbortController().signal,
  };
  const summary = await runBuild(host, targets);
  console.log(`${name}: ${summary.built} written, ${summary.failed} failed`);
  return summary.built;
}

async function make(name: SampleName, polishOnly: boolean): Promise<void> {
  const started = Date.now();
  const failed: string[] = [];
  let store: CourseStore;
  if (polishOnly) {
    store = new CourseStore(parseCourse(JSON.parse(readFileSync(join(OUT, `${name}.json`), 'utf8'))));
  } else {
    const req = requestFor(BRIEFS[name]);
    store = new CourseStore(courseFromOutline(req, await generateOutline(inference, req)));
    console.log(`${name}: outline "${store.getState().title}", ${orderedLessons(store.getState()).length} lessons`);
  }
  for (let round = 0; round < 3 && missingTargets(store.getState()).length; round++) await build(name, store, missingTargets(store.getState()), failed);
  for (let round = 0; round < 2 && flawed(store.getState()).length; round++) {
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

const args = process.argv.slice(2);
const polishOnly = args.includes('--polish');
const names = args.filter((a) => a !== '--polish');
const asked = (names.length ? names : Object.keys(BRIEFS)) as SampleName[];
await Promise.all(asked.map((name) => make(name, polishOnly)));
