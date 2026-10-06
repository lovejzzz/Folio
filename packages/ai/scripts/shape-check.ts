// Every shape a model is held to, sent once to the provider itself: a shape it will not take is refused there
// and nowhere else. The free check-ups go through a command line that does not hold the model to the shape, so a
// page that grew past what the provider compiles looked sound and was refused for every teacher.
//
//   pnpm --filter @folio/ai exec tsx scripts/shape-check.ts      (keys from the local key page; a few cents)
import Anthropic from '@anthropic-ai/sdk';
import { claudeShape } from '../src/adapters/shape';
import { AssignmentDraft, ClarifyDraft, DiscussionsDraft, FaqDraft, OutlineDraft, PlanDraft, QuizDraft, SlidesDraft, StepDraft, StudyDraft, TestDraft } from '../src';
import type { z } from 'zod';
import { AnswerForm } from '../src/answerCheck';
import { HandoutsDraft } from '../src/handouts';
import { LastReadDraft } from '../src/lastRead';
import { ModuleMend, PlanMend } from '../src/mend';
import { ModuleReviewDraft } from '../src/moduleReview';
import { ModuleDraft } from '../src/online';
import { PlanReviewDraft } from '../src/review';
import { StartDraft } from '../src/start';
import { SupportedDraft } from '../src/supports';
import { StuckForm } from '../src/stuckCheck';

const SHAPES: Record<string, z.ZodType> = { ModuleDraft, ModuleMend, ModuleReviewDraft, LastReadDraft, PlanDraft, PlanMend, PlanReviewDraft, SlidesDraft, HandoutsDraft, SupportedDraft, AnswerForm, StuckForm, StartDraft, OutlineDraft, ClarifyDraft, QuizDraft, AssignmentDraft, TestDraft, StepDraft, StudyDraft, DiscussionsDraft, FaqDraft };

const apiKey = (await (await fetch('http://127.0.0.1:8799/key/anthropic', { headers: { 'x-experiment': '1' } })).text()).trim();
const client = new Anthropic({ apiKey });
let refused = 0;
for (const [name, schema] of Object.entries(SHAPES)) {
  try {
    // The shape is compiled before a word is written: one token of answer is enough to learn whether it is taken.
    await client.messages.create({ model: 'claude-sonnet-5-5', max_tokens: 16, messages: [{ role: 'user', content: 'Answer with the smallest valid object.' }], output_config: { format: { type: 'json_schema', schema: claudeShape(schema) } } } as never);
    console.log(`ok       ${name}`);
  } catch (error) {
    const status = (error as { status?: number }).status;
    // Only the first line, and never the request: an error can carry what was sent with it.
    const message = String((error as Error).message ?? error).split('\n')[0]!.slice(0, 160);
    if (status === 400) refused += 1;
    console.log(`${status === 400 ? 'REFUSED ' : 'error   '} ${name}: ${status ?? ''} ${message}`);
  }
}
process.exit(refused ? 1 : 0);
