import type { Page, Route } from '@playwright/test';

/**
 * A stand-in for the Anthropic Messages API. It answers each job from the
 * prompt it receives, so the whole app runs end to end with no network.
 */

interface Body {
  system?: string;
  messages: { content: string }[];
}

function lessonTitle(prompt: string): string {
  return prompt.match(/This is lesson \d+: "([^"]+)"/)?.[1] ?? 'Photosynthesis';
}

function quizSize(prompt: string): number {
  return Number(prompt.match(/Write exactly (\d+) quiz questions/)?.[1] ?? 3);
}

function outline(prompt: string) {
  const n = Number(prompt.match(/Plan exactly (\d+) lessons/)?.[1] ?? 3);
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
    })),
  };
}

function answerFor(body: Body): unknown {
  const prompt = body.messages.map((m) => m.content).join('\n');
  const title = lessonTitle(prompt);
  if (prompt.includes('Return {"ok": true}')) return { ok: true };
  if (prompt.includes('Plan exactly')) return outline(prompt);
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
        sourcePassage: null,
      })),
    };
  if (prompt.includes('Write one assignment'))
    return { title: `${title} poster`, prompt: 'Make a poster that explains the process.', steps: ['Draw a leaf', 'Label the inputs and outputs'], rubric: { levels: [{ label: 'Excellent', points: 3 }, { label: 'Good', points: 2 }, { label: 'Beginning', points: 1 }], criteria: [{ name: 'Accuracy', descriptors: ['All correct', 'Mostly correct', 'Several errors'] }, { name: 'Clarity', descriptors: ['Very clear', 'Clear', 'Hard to follow'] }] } };
  if (prompt.includes('discussion prompts')) return { discussions: [{ prompt: 'Could a plant live in a sealed jar?', followUps: ['What would it need?'] }] };
  if (prompt.includes('commonly ask')) return { entries: [{ question: 'Do plants breathe?', answer: 'Yes, they respire all the time, day and night.' }] };
  if (prompt.includes('Turn the request into')) return { summary: 'Quizzes get three questions.', operations: [{ op: 'setQuizSize', size: 3 }] };
  if (prompt.includes('Selected text')) return prompt.includes('Explain') ? { explanation: 'This is the key idea of the lesson.' } : { text: 'A clearer version of the sentence.' };
  return {};
}

export interface FakeModelOptions {
  delayMs?: number;
  status?: number;
}

export async function fakeAnthropic(page: Page, options: FakeModelOptions = {}): Promise<{ calls: Body[] }> {
  const calls: Body[] = [];
  await page.route('https://api.anthropic.com/**', async (route: Route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors() });
    const body = route.request().postDataJSON() as Body;
    calls.push(body);
    if (options.delayMs) await new Promise((r) => setTimeout(r, options.delayMs));
    if (options.status && options.status !== 200) {
      return route.fulfill({ status: options.status, headers: cors(), json: { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } } });
    }
    await route.fulfill({
      status: 200,
      headers: cors(),
      json: { id: `msg_${calls.length}`, type: 'message', role: 'assistant', model: 'claude-opus-5', content: [{ type: 'text', text: JSON.stringify(answerFor(body)) }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } },
    });
  });
  return { calls };
}

function cors(): Record<string, string> {
  return { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
}
