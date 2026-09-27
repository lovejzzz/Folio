import { describeFlag, type Flag } from '@folio/core';
import type { z } from 'zod';
import { InferenceError, MalformedOutputError, type CompletionRequest, type Inference } from './inference';

/**
 * One job: ask, validate against the schema, run deterministic checks, and
 * allow at most one repair call that quotes what was wrong. Whatever still
 * fails after that is returned as "needs a look", never patched by regex.
 */

export interface Problem {
  /** Index of the item the problem belongs to, or null for the whole job. */
  index: number | null;
  flag: Flag;
  /** Worth one repair call, but not worth the teacher's attention if it remains (a style tell, not an error). */
  advisory?: boolean;
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

interface Attempt<T> {
  /** What the model said: parsed JSON, or the raw text when it wasn't JSON. */
  raw: unknown;
  value?: T;
  problems: Problem[];
}

/** One call. Output that isn't JSON is a problem to quote back, like a schema issue; any other error stops the job. */
async function attempt<T>(inference: Inference, request: Omit<CompletionRequest, 'prompt'>, prompt: string, spec: JobSpec<T>): Promise<Attempt<T>> {
  let raw: unknown;
  try {
    raw = await inference.complete({ ...request, prompt });
  } catch (error) {
    if (!(error instanceof MalformedOutputError)) throw error;
    return { raw: error.text, problems: [{ index: null, flag: { code: 'schemaIssue', values: { path: 'root', issue: error.problem } } }] };
  }
  const parsed = spec.schema.safeParse(raw);
  if (!parsed.success) return { raw, problems: describeIssues(parsed.error) };
  return { raw, value: parsed.data, problems: spec.check?.(parsed.data) ?? [] };
}

/** Long enough to show the model what it wrote; short enough not to crowd out the request. */
const QUOTE_LIMIT = 20_000;

function quote(raw: unknown): string {
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
  return text.length > QUOTE_LIMIT ? `${text.slice(0, QUOTE_LIMIT)}…` : text;
}

function repairPrompt(prompt: string, raw: unknown, problems: Problem[]): string {
  const list = problems.map((p) => `- ${p.index === null ? '' : `Item ${p.index + 1}: `}${describeFlag(p.flag)}`).join('\n');
  return `${prompt}\n\nYour previous answer was:\n${quote(raw)}\n\nIt has these problems:\n${list}\n\nReturn a corrected version of the whole answer, as JSON only.`;
}

/** Only real problems reach the teacher as "needs a look". */
const shown = (problems: Problem[]) => problems.filter((p) => !p.advisory);

export async function runJob<T>(inference: Inference, spec: JobSpec<T>): Promise<JobResult<T>> {
  const request = { task: spec.task, system: spec.system, schema: spec.schema, signal: spec.signal };
  const first = await attempt(inference, request, spec.prompt, spec);
  if (first.value !== undefined && first.problems.length === 0) {
    return { value: first.value, problems: [], repaired: false };
  }
  const second = await attempt(inference, request, repairPrompt(spec.prompt, first.raw, first.problems), spec);
  // A repair that made things worse is not taken: keep whichever answer has fewer real problems.
  if (second.value !== undefined && (first.value === undefined || shown(second.problems).length <= shown(first.problems).length)) {
    return { value: second.value, problems: shown(second.problems), repaired: true };
  }
  if (first.value !== undefined) return { value: first.value, problems: shown(first.problems), repaired: false };
  throw new InferenceError('invalid', 'The model returned something Folio could not use, twice.');
}
