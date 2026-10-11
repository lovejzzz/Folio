// Offline: the answer check's forms written by one model or another, on quiz questions as they stand and on the same
// questions with their answer made wrong. Says how often each catches a planted error and how often it blames a sound item.
import { execFile } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import { parseCourse, orderedLessons, worthChecking, type Task } from '@folio/core';
import { nodeRunner } from '@folio/run/node';
import { checkAnswers } from '../../../packages/ai/src/answerCheck';
import type { Inference } from '../../../packages/ai/src/inference';

const R = `${process.env.HOME}/.claude/skills/folio-quality-loop/runs/2026-10-05-costlab`;
const [model, effort, limit] = [process.argv[2] ?? 'claude-sonnet-5-5', process.argv[3] ?? 'medium', Number(process.argv[4] ?? 40)];
let calls = 0, out = 0, sent = 0;
const cli = (system: string, prompt: string) => new Promise<string>((res, rej) => {
  const child = execFile('claude', ['-p', '--model', model, '--output-format', 'json', '--tools', '', '--no-session-persistence', '--max-turns', '1', '--strict-mcp-config', '--effort', effort, '--system-prompt', system], { maxBuffer: 1 << 26 }, (e, o) => (e ? rej(e) : res(o)));
  child.stdin!.end(prompt);
});
const inference: Inference = {
  provider: 'anthropic', model,
  async complete(req) {
    // The writer that corrects an item is not what is being tried: only the forms.
    if (req.task !== 'folio_answer_check') return { changes: [] };
    const note = `\n\nAnswer with one JSON object that matches this JSON Schema, and nothing else:\n${JSON.stringify(z.toJSONSchema(req.schema))}`;
    const prompt = [req.context, req.prompt].filter(Boolean).join('\n\n');
    const o = JSON.parse(await cli(req.system + note, prompt)) as { result?: string; usage?: { output_tokens?: number } };
    calls += 1; out += o.usage?.output_tokens ?? 0; sent += prompt.length;
    const text = o.result ?? '';
    return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as unknown;
  },
};
// Numeric and short questions with a number for an answer: the answer can be made wrong without touching anything else.
const items: Task[] = [];
for (const set of ['uni4', 'uniB', 'uni2a', 'uni2b']) for (const f of readdirSync(`${R}/F4-${set}/courses`).filter((x) => x.endsWith('.json') && !x.includes('clarify'))) {
  const course = parseCourse(JSON.parse(readFileSync(`${R}/F4-${set}/courses/${f}`, 'utf8')));
  for (const lesson of orderedLessons(course).slice(0, 2)) for (const id of lesson.taskIds) {
    const t = course.tasks[id];
    // A choice question whose choices hold numbers or code: its key can be moved to another choice, and nothing else touched.
    if (t?.kind === 'question' && t.format === 'choice' && t.choices.length >= 3 && t.choices.every((c) => /\d|`/.test(c.text)) && worthChecking(t)) items.push({ ...t, id: `${f.replace('.json', '')}:${t.id}`, flags: [] });
  }
}
// Spread over the courses: every nth, not the first forty of one subject.
const chosen = items.filter((_, i) => i % Math.max(1, Math.floor(items.length / limit)) === 0).slice(0, limit);
console.log(items.length, 'such questions;', chosen.length, 'taken');
// The wrong key: the choice after the right one.
const wrong = (t: Task): Task => {
  if (t.kind !== 'question') return t;
  const at = t.choices.findIndex((c) => c.id === t.correct);
  const other = t.choices[(at + 1) % t.choices.length]!;
  return { ...t, id: `${t.id}:wrong`, correct: other.id, answer: other.text };
};
const run = async (tasks: Task[]) => {
  const flagged = new Set<string>(); let checked = 0;
  const queue = [...tasks];
  const worker = async () => { for (;;) { const t = queue.shift(); if (!t) return; try { const o = await checkAnswers(inference, nodeRunner(), [t]); checked += o.checked; if (o.flags.size) flagged.add(t.id); } catch { /* counted as not checked */ } } };
  await Promise.all([worker(), worker(), worker()]);
  return { checked, flagged: [...flagged] };
};
const sound = await run(chosen);
const planted = await run(chosen.map(wrong));
const result = { model, effort, items: chosen.length, sound: { checked: sound.checked, blamed: sound.flagged.length, which: sound.flagged }, planted: { checked: planted.checked, caught: planted.flagged.length }, calls, outputTokens: out, sentChars: sent };
console.log(JSON.stringify(result));
writeFileSync(`${R}/forms-${model}-${effort}.json`, JSON.stringify(result, null, 1));
