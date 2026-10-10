// Offline: what the plan's reader counts in each segment of the frozen F1 lessons, and which segments code would send to be cut.
import { execFile } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { parseCourse, orderedLessons } from '@folio/core';
import { planReviewPrompt, PlanReviewDraft } from '../../../packages/ai/src/review';
import { courseBackground, systemPrompt } from '../../../packages/ai/src/prompts';
import { overtime } from '../../../packages/ai/src/segmentTime';

const R = `${process.env.HOME}/.claude/skills/folio-quality-loop/runs/2026-10-05-costlab`;
const dir = mkdtempSync(join(tmpdir(), 'parts-'));
const ask = (prompt: string, n: number) => new Promise<string>((res, rej) => {
  const file = join(dir, `${n}.txt`);
  const child = execFile('codex', ['exec', '-m', 'gpt-6.1-sol', '-c', 'model_reasoning_effort=low', '--skip-git-repo-check', '-s', 'read-only', '-o', file, '-'], { maxBuffer: 1 << 26 }, (e) => (e ? rej(e) : res(readFileSync(file, 'utf8'))));
  child.stdin!.end(prompt);
});
const jobs: (() => Promise<void>)[] = []; const out: unknown[] = []; let n = 0;
for (const set of (process.argv[2] ?? 'F1').split(',').flatMap((run) => ['uni4', 'uniB', 'uni2a', 'uni2b'].map((s) => `${run}-${s}`))) {
  for (const f of readdirSync(`${R}/${set}/courses`).filter((x) => x.endsWith('.json') && !x.includes('clarify'))) {
    const course = parseCourse(JSON.parse(readFileSync(`${R}/${set}/courses/${f}`, 'utf8')));
    for (const lesson of orderedLessons(course).slice(0, 2)) jobs.push(async () => {
      const plan = { keyIdeas: lesson.keyIdeas, vocabulary: lesson.vocabulary, segments: lesson.segments.map(({ kind, session, title, minutes, description, teacherNotes }) => ({ kind, session: Math.max(1, session), title, minutes, description, teacherNotes })) };
      const schema = z.toJSONSchema(PlanReviewDraft);
      const prompt = `Instructions:\n${systemPrompt(course.language, course.locale)}\n\nRequest:\n${courseBackground(course)}\n\n${planReviewPrompt(course, lesson, plan as never)}\n\nAnswer with one JSON object that matches this JSON Schema, and nothing else:\n${JSON.stringify(schema)}`;
      try {
        const text = await ask(prompt, n++);
        const v = PlanReviewDraft.parse(JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)));
        const over = overtime(plan as never, v.parts);
        const RATE: Record<string, number> = { short: 1, worked: 2, paragraph: 5, drawing: 2, listed: 0.5, read: 2, compare: 1, pair: 2, hear: 1, scored: 1.5, vote: 2, revote: 3 };
        const all = v.parts.map((c) => { const seg = plan.segments[c.segment - 1]; const need = c.parts.reduce((n, x) => n + x.count * (RATE[x.kind] ?? 0), 0); return seg ? `${c.segment}. ${seg.title} [${seg.kind}] ${need}/${seg.minutes}: ${c.parts.map((x) => `${x.count} ${x.kind} (${x.what})`).join(', ')}` : ''; });
        out.push({ set, course: f.replace('.json', ''), lesson: course.lessonOrder.indexOf(lesson.id) + 1, counted: v.parts.length, issues: v.issues.length, over: over.map((o) => `${o.values.where} | ${o.values.text.slice(0, 260)}`), all });
        console.log(f, course.lessonOrder.indexOf(lesson.id) + 1, 'counted', v.parts.length, 'over', over.length);
      } catch (e) { console.log(f, 'failed', String(e).split('\n')[0]!.slice(0, 120)); }
    });
  }
}
const run = async () => { for (;;) { const j = jobs.shift(); if (!j) return; await j(); } };
await Promise.all([run(), run(), run()]);
writeFileSync(`${R}/parts-offline-${process.argv[2] ?? 'F1'}.json`, JSON.stringify(out, null, 1));
