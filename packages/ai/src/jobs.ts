import { describeFlag, type Flag } from '@folio/core';
import type { z } from 'zod';
import { InferenceError, type Inference } from './inference';

/**
 * One job: ask, validate against the schema, run deterministic checks, and
 * allow at most one repair call that quotes what was wrong. Whatever still
 * fails after that is returned as "needs a look", never patched by regex.
 */

export interface Problem {
  /** Index of the item the problem belongs to, or null for the whole job. */
  index: number | null;
  flag: Flag;
}

export interface JobSpec<T> {
  task: string;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  check?: (value: T) => Problem[];
  signal?: AbortSignal;
}

export interface JobResult<T> {
  value: T;
  problems: Problem[];
  repaired: boolean;
}

function describeIssues(error: z.ZodError): Problem[] {
  return error.issues.slice(0, 12).map((issue) => ({
    index: null,
    flag: { code: 'schemaIssue', values: { path: issue.path.join('.') || 'root', issue: issue.message } },
  }));
}

function evaluate<T>(spec: JobSpec<T>, raw: unknown): { value?: T; problems: Problem[] } {
  const parsed = spec.schema.safeParse(raw);
  if (!parsed.success) return { problems: describeIssues(parsed.error) };
  return { value: parsed.data, problems: spec.check?.(parsed.data) ?? [] };
}

function repairPrompt(prompt: string, raw: unknown, problems: Problem[]): string {
  const list = problems.map((p) => `- ${p.index === null ? '' : `Item ${p.index + 1}: `}${describeFlag(p.flag)}`).join('\n');
  return `${prompt}\n\nYour previous answer was:\n${JSON.stringify(raw)}\n\nIt has these problems:\n${list}\n\nReturn a corrected version of the whole answer.`;
}

export async function runJob<T>(inference: Inference, spec: JobSpec<T>): Promise<JobResult<T>> {
  const request = { task: spec.task, system: spec.system, schema: spec.schema, signal: spec.signal };
  const raw = await inference.complete({ ...request, prompt: spec.prompt });
  const first = evaluate(spec, raw);
  if (first.value !== undefined && first.problems.length === 0) {
    return { value: first.value, problems: [], repaired: false };
  }
  const raw2 = await inference.complete({ ...request, prompt: repairPrompt(spec.prompt, raw, first.problems) });
  const second = evaluate(spec, raw2);
  if (second.value !== undefined) return { value: second.value, problems: second.problems, repaired: true };
  if (first.value !== undefined) return { value: first.value, problems: first.problems, repaired: false };
  throw new InferenceError('invalid', 'The model returned something Folio could not use, twice.');
}
