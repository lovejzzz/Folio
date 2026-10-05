import type { Page, Route } from '@playwright/test';

/**
 * A stand-in for the Anthropic Messages API. It answers each job from the
 * prompt it receives, so the whole app runs end to end with no network.
 */

interface Body {
  model?: string;
  stream?: boolean;
  system?: string | { text: string }[];
  messages: { content: string }[];
}

type Content = string | { text?: string }[];

/**
 * A request as the tests read it, whichever API it was sent to: the system prompt apart, and everything in the
 * teacher's turn (the course, its files, then the ask) as one string in messages[0].
 */
function normalized(raw: { model?: string; stream?: boolean; system?: Body['system']; messages: { role?: string; content: Content }[] }): Body {
  const text = (c: Content) => (typeof c === 'string' ? c : c.map((b) => b.text ?? '').join('\n'));
  const systemMessage = raw.messages.find((m) => m.role === 'system');
  const turn = raw.messages.filter((m) => m.role !== 'system').map((m) => text(m.content)).join('\n\n');
  return { ...raw, system: raw.system ?? (systemMessage ? text(systemMessage.content) : undefined), messages: [{ content: turn }] };
}

function lessonTitle(prompt: string): string {
  return prompt.match(/This is the lesson "([^"]+)"/)?.[1] ?? 'Photosynthesis';
}

function quizSize(prompt: string): number {
  return Number(prompt.match(/Write exactly (\d+) quiz questions/)?.[1] ?? 3);
}

/**
 * Readings for the first two lessons only, as a brief that names a textbook for part of a unit would give. The
 * handout is one the brief never names, as a model sometimes adds: Folio should leave it out.
 */
const READINGS = [
  [{ work: 'Campbell Biology, ch. 10.1: Photosynthesis in nature', namedIn: 'Campbell Biology' }],
  [
    { work: 'Campbell Biology, ch. 10.2–10.3', namedIn: 'Campbell Biology' },
    { work: 'Handout: a chloroplast under the microscope', namedIn: 'a handout on chloroplasts' },
  ],
];

/**
 * Reading the brief before planning: nothing to ask, unless the brief says "(ask me)"; a syllabus that gives its
 * weeks is read as that many lessons.
 */
function clarify(prompt: string) {
  const weeks = prompt.match(/Week (\d+)/g)?.length ?? null;
  // The attached file that is the course's syllabus, by its title.
  const syllabus = [...prompt.matchAll(/^## (.+)$/gm)].map((m) => m[1]!).find((t) => /syllab/i.test(t)) ?? '';
  if (!prompt.includes('(ask me)')) return { lessonCount: weeks, minutesPerLesson: null, level: '', syllabus, questions: [] };
  return {
    lessonCount: null,
    minutesPerLesson: null,
    level: '',
    questions: [
      { topic: 'lessons', question: 'How many lessons should the unit have?', options: ['4 lessons, one a week', '6 lessons over three weeks', '2 long lessons'] },
      { topic: 'assessment', question: 'How is the unit assessed?', options: ['A lab report at the end', 'A short quiz each lesson', 'Not graded'] },
    ],
  };
}

function outline(prompt: string) {
  const asked = prompt.match(/teacher answered:\n- How many lessons[^\n]*? (\d+) lessons/)?.[1];
  const n = Number(prompt.match(/Plan exactly (\d+) lessons/)?.[1] ?? asked ?? 3);
  const titles = ['Light and leaves', 'Inside the chloroplast', 'The Calvin cycle', 'Limiting factors', 'Plants and people', 'Review and project'];
  return {
    title: 'How plants make food',
    summary: 'A short unit on photosynthesis: where it happens, what it needs and what limits it.',
    subject: 'Biology',
    level: 'Year 7',
    lessons: Array.from({ length: n }, (_, i) => ({
      title: titles[i % titles.length],
      summary: `What students learn about ${titles[i % titles.length]!.toLowerCase()}.`,
      objectives: [`Explain ${titles[i % titles.length]!.toLowerCase()}`, 'Use the word equation for photosynthesis'],
      readings: READINGS[i] ?? [],
      // A seminar brief gets one suggestion, as a university outline would.
      suggestedReadings: i === 0 && /seminar/i.test(prompt) ? ['Okin, Justice, Gender, and the Family, ch. 5'] : [],
    })),
    grading: [
      { item: 'Lab notebook', weight: 30 },
      { item: 'Weekly quizzes', weight: 20 },
      { item: 'End-of-unit test', weight: 50 },
    ],
  };
}

const START_HERE = {
  welcome: 'Welcome. In three weeks you will explain how a plant makes its food.',
  firstSteps: ['Read this page', 'Introduce yourself in the forum'],
  rhythm: [{ when: 'Monday', what: 'The week opens.' }, { when: 'Sunday night', what: 'Everything is due.' }],
  need: [{ item: 'A notebook', detail: 'Any kind; nothing to buy.' }],
  grading: [{ item: 'Lab notebook', how: 'Three entries, one a week, each a third of its share.' }],
  help: 'Ask in the Q&A forum, and say what you tried.',
  instructor: ['An announcement every Monday', 'Answers in the forum within one working day'],
  toAdd: ['Your name and how to reach you', 'Your late-work policy'],
};

/** The week with a notebook cell in it, and an output the writer got wrong: 0 to 9 add up to 45. */
function withPython(page: ReturnType<typeof modulePage>) {
  const cell = [
    { type: 'code', kind: 'python', text: 'total = sum(range(10))\nprint("The total is", total)' },
    { type: 'code', kind: 'output', text: 'The total is 44' },
  ];
  return { ...page, parts: page.parts.map((p, i) => (i === 0 ? { ...p, blocks: [...p.blocks, ...cell] } : p)) };
}

/** A week of an online course as the fake writes it: nine hours of work, steps with a picture, a checkpoint and a clip. */
function modulePage(title: string) {
  return {
    keyIdeas: [`${title} starts with light energy.`, 'Chlorophyll absorbs red and blue light.'],
    intro: `This week you find out about ${title.toLowerCase()}, and draw a leaf of your own.`,
    checklist: [
      { label: 'Read the page and follow the steps', activity: 'build', minutes: 240 },
      { label: 'Take the self-check', activity: 'check', minutes: 60 },
      { label: 'Post in the forum', activity: 'discuss', minutes: 60, due: 'Thursday' },
      { label: 'Submit your diagram', activity: 'submit', minutes: 180, due: 'Sunday' },
    ],
    parts: [
      {
        title: 'Draw the leaf',
        blocks: [
          { type: 'text', text: 'A diagram shows where the light goes in.' },
          { type: 'steps', items: ['Open your notebook to a **new page**.', 'Draw a leaf and label the stomata.'], shots: [{ step: 2, shows: 'A hand-drawn leaf with the stomata labelled', alt: 'A leaf drawn in pencil, with arrows to the stomata on its underside.', caption: 'Your drawing should label the stomata like this.' }] },
          { type: 'video', kind: 'clip', text: 'Watch which way the leaf ends up facing.', shows: 'A leaf turning toward a lamp over a day, sped up', alt: 'The leaf turns slowly until it faces the lamp.', minutes: 0.3 },
          { type: 'callout', kind: 'checkpoint', text: 'You should see a leaf with its stomata labelled on the underside. It went wrong if the labels point at the veins.' },
          { type: 'code', kind: 'text', text: 'carbon dioxide + water -> glucose + oxygen' },
        ],
      },
      {
        title: 'Try it yourself',
        blocks: [
          { type: 'text', text: 'Draw a second leaf kept in the dark and say how it differs.' },
          {
            type: 'exhibit',
            text: 'Compare the Dark column with what you wrote.',
            exhibit: { frame: 'notes', title: 'Leaf notes', reveal: true, marks: [{ quote: 'Dark', note: 'The column you filled in.' }], parts: [{ blocks: [{ type: 'table', columns: ['Leaf', 'Light', 'Dark'], rows: [['Colour', 'green', 'pale'], ['Starch', 'present', 'absent']] }] }] },
          },
        ],
      },
    ],
    wrapUp: 'You can now say where a plant takes in light. Next week: the chloroplast.',
    vocabulary: [{ term: 'Chlorophyll', definition: 'The green pigment that absorbs light.' }],
    facilitation: { announcement: 'Welcome to the week.', watchFor: ['Stomata drawn on top of the leaf', 'No labels'], feedback: ['Your labels are clear: now add the arrows.', 'Check which side the stomata are on.'], atRisk: 'Message anyone who has not posted by Thursday.' },
  };
}

/** ⌘K plans. Some requests get steps that can't be done, as a real model sometimes proposes. */
function coursePlan(prompt: string) {
  const request = prompt.match(/The teacher asks: """([^"]*)"""/)?.[1] ?? '';
  const operations: unknown[] = [];
  if (request.includes('lesson 99')) operations.push({ op: 'removeLesson', lesson: 99 });
  if (request.includes('40 questions')) operations.push({ op: 'setQuizSize', size: 40 });
  if (request.includes('rename lesson 1')) operations.push({ op: 'renameLesson', lesson: 1, title: 'Asking good questions' });
  if (!operations.length) return { summary: 'Quizzes get three questions.', operations: [{ op: 'setQuizSize', size: 3 }] };
  return { summary: 'As asked.', operations };
}

/**
 * Putting right what a review found. The fake's exit ticket never says which two questions it asks: that is the
 * teacher's to decide, so the note is left with the question until the teacher has answered it.
 */
function mend(prompt: string) {
  if (prompt.includes('The teacher has decided:'))
    return { segments: [{ number: 4, kind: 'check', title: 'Exit ticket', minutes: 8, description: 'Two questions on the board: what does a plant take in, and what does it make?', teacherNotes: '' }], left: [] };
  if (prompt.includes('never given')) return { segments: [], left: [{ note: 1, reason: 'teacher', why: 'Which two questions should the exit ticket ask?' }] };
  return { segments: [], left: [] };
}

function answerFor(body: Body, python = false): unknown {
  const system = typeof body.system === 'string' ? body.system : (body.system ?? []).map((b) => b.text).join('\n');
  const prompt = [system, ...body.messages.map((m) => m.content)].join('\n');
  const title = lessonTitle(prompt);
  if (prompt.includes('Return {"ok": true}')) return { ok: true };
  // A copy of a sheet with supports: a word bank, the same question, a sentence starter.
  if (prompt.includes('Write the same sheet again for students who need support')) return { blocks: [{ type: 'table', columns: ['Word', 'Meaning'], rows: [['carbon dioxide', 'a gas in the air']] }, { type: 'list', items: ['What goes into a leaf, and what comes out?'] }, { type: 'yours', text: 'Into a leaf go … Out of a leaf come …', lines: 3 }], keyNote: 'A word bank and a sentence starter were added.' };
  // The sheets a plan hands out: one exit ticket, with its key.
  if (prompt.includes('Write the sheets this lesson puts in students')) return { handouts: [{ title: 'Exit ticket', kind: 'slips', usedIn: 'Exit ticket', copies: 'One per student', key: 'Light, water and carbon dioxide go in; sugar and oxygen come out.', blocks: [{ type: 'para', text: 'Answer before you leave.' }, { type: 'list', items: ['What goes into a leaf, and what comes out?'] }, { type: 'yours', text: 'Your answer' }] }] };
  // The plan review: a plan written by the fake has nothing wrong with it.
  if (prompt.includes('Check this plan the way')) return { issues: [] };
  // Asked before the plan itself: a mend's request quotes the plan's.
  if (prompt.includes('found these problems')) return mend(prompt);
  if (prompt.includes('Before Folio plans this course')) return clarify(prompt);
  if (prompt.includes('A teacher attached this syllabus'))
    return { issues: [{ kind: 'error', where: 'Grading', problem: 'The weights add up to 90%, not 100%.', fix: 'Give the final exam 30%.' }] };
  if (prompt.includes('Plan exactly') || prompt.includes('Plan one lesson for each class meeting')) return outline(prompt);
  // An online course's week: the page a student follows, its second read, and the course's Start here page.
  if (prompt.includes('Read this page as the student will')) return { issues: [] };
  if (prompt.includes('Write the "Start here" page')) return START_HERE;
  if (prompt.includes("Write this week's module page")) return python ? withPython(modulePage(title)) : modulePage(title);
  if (prompt.includes("week's discussion forum")) return { discussions: [{ prompt: 'Post a screenshot of your leaf diagram and say what surprised you.', followUps: ['What would you change?'] }] };
  if (prompt.includes('"Stuck?" list')) return { entries: [{ question: 'My diagram will not upload. What do I do?', answer: 'Save it as a PNG and try again; then ask in the Q&A forum.' }] };
  if (prompt.includes('Write the lesson plan'))
    return {
      keyIdeas: [`${title} starts with light energy.`, 'Chlorophyll absorbs red and blue light.'],
      segments: [
        { kind: 'warmup', title: 'Leaf in the dark', minutes: 10, description: 'Compare a leaf kept in the dark with one in light.', teacherNotes: 'Prepare the leaves two days ahead.' },
        { kind: 'teach', title: 'The word equation', minutes: 20, description: 'Build carbon dioxide + water → glucose + oxygen together.', teacherNotes: '' },
        { kind: 'practice', title: 'Label the leaf', minutes: 12, description: 'Pairs label a leaf cross-section.', teacherNotes: '' },
        { kind: 'check', title: 'Exit ticket', minutes: 8, description: 'Two questions on the board.', teacherNotes: '' },
      ],
      vocabulary: [{ term: 'Chlorophyll', definition: 'The green pigment that absorbs light.' }],
    };
  if (prompt.includes('Write a slide deck'))
    return { slides: [{ layout: 'title', title, bullets: [], notes: '' }, { layout: 'bullets', title: 'What plants need', bullets: ['Light', 'Water', 'Carbon dioxide'], notes: 'Ask students to guess first.' }, { layout: 'question', title: 'Where does the mass of a tree come from?', bullets: [], notes: 'Most say the soil.' }] };
  if (prompt.includes('Write a study guide'))
    return { overview: `A summary of ${title.toLowerCase()}.`, points: [{ heading: 'The equation', explanation: 'Carbon dioxide and water make glucose and oxygen.' }, { heading: 'Where it happens', explanation: 'In chloroplasts, mostly in leaf cells.' }] };
  if (prompt.includes('quiz questions'))
    return {
      questions: Array.from({ length: quizSize(prompt) }, (_, i) => ({
        format: 'choice',
        prompt: `Question ${i + 1} about ${title.toLowerCase()}: which gas do plants take in?`,
        choices: ['Carbon dioxide', 'Oxygen', 'Nitrogen', 'Helium'],
        answer: i === 1 ? 'Neon' : 'Carbon dioxide',
        explanation: 'Plants take in carbon dioxide through their stomata.',
        difficulty: 2,
        expression: null,
        objective: 1,
        sourcePassage: i === 0 && prompt.includes("Teacher's sources") ? 1 : null,
      })),
    };
  if (prompt.includes('Write one assignment'))
    return { title: `${title} poster`, prompt: 'Make a poster that explains the process.', steps: ['Draw a leaf', 'Label the inputs and outputs'], rubric: { levels: [{ label: 'Excellent', points: 3 }, { label: 'Good', points: 2 }, { label: 'Beginning', points: 1 }], criteria: [{ name: 'Accuracy', descriptors: ['All correct', 'Mostly correct', 'Several errors'] }, { name: 'Clarity', descriptors: ['Very clear', 'Clear', 'Hard to follow'] }] } };
  if (prompt.includes('discussion prompts')) return { discussions: [{ prompt: 'Could a plant live in a sealed jar?', followUps: ['What would it need?'] }] };
  if (prompt.includes('commonly ask')) return { entries: [{ question: 'Do plants breathe?', answer: 'Yes, they respire all the time, day and night.' }] };
  if (prompt.includes('Turn the request into')) return coursePlan(prompt);
  if (prompt.includes('Selected text')) return prompt.includes('Explain') ? { explanation: 'This is the key idea of the lesson.' } : { text: 'A clearer version of the sentence.' };
  return {};
}

export interface FakeModelOptions {
  delayMs?: number;
  status?: number;
  /** The weekly pages carry a Python cell with a wrong output written under it. */
  python?: boolean;
  /** Answer at Folio's own server (Folio credits) instead of at Anthropic. */
  viaFolio?: boolean;
}

export async function fakeAnthropic(page: Page, options: FakeModelOptions = {}): Promise<{ calls: Body[] }> {
  const calls: Body[] = [];
  // Folio credits send the same request to Folio's server, which the test plays too.
  await page.route(options.viaFolio ? '**/api/ai/v1/messages**' : 'https://api.anthropic.com/**', async (route: Route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors() });
    const body = normalized(route.request().postDataJSON());
    calls.push(body);
    if (options.delayMs) await new Promise((r) => setTimeout(r, options.delayMs));
    if (options.status && options.status !== 200) {
      return route.fulfill({ status: options.status, headers: cors(), json: { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } } });
    }
    const text = JSON.stringify(answerFor(body, options.python));
    if (body.stream) return route.fulfill({ status: 200, headers: { ...cors(), 'content-type': 'text/event-stream' }, body: streamed(text) });
    await route.fulfill({
      status: 200,
      headers: cors(),
      json: { id: `msg_${calls.length}`, type: 'message', role: 'assistant', model: 'claude-opus-5', content: [{ type: 'text', text }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } },
    });
  });
  // With Folio credits, the quizzes, assignments and plan checks go to OpenAI's models through the same server.
  if (options.viaFolio) {
    await page.route('**/api/ai/openai/v1/chat/completions', async (route: Route) => {
      const body = normalized(route.request().postDataJSON());
      calls.push(body);
      if (options.delayMs) await new Promise((r) => setTimeout(r, options.delayMs));
      const text = JSON.stringify(answerFor(body, options.python));
      await route.fulfill({
        status: 200,
        json: { id: `chatcmpl_${calls.length}`, model: body.model, choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10 } },
      });
    });
  }
  return { calls };
}

/** The same answer as Claude streams it: server-sent events carrying a few characters each. */
function streamed(text: string): string {
  const chunks = text.match(/[\s\S]{1,24}/g) ?? [];
  const events: [string, unknown][] = [
    ['message_start', { type: 'message_start', message: { id: 'msg_stream', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } }],
    ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
    ...chunks.map((chunk): [string, unknown] => ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: chunk } }]),
    ['content_block_stop', { type: 'content_block_stop', index: 0 }],
    ['message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 10 } }],
    ['message_stop', { type: 'message_stop' }],
  ];
  return events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join('');
}

function cors(): Record<string, string> {
  return { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
}
