// A stand-in for api.anthropic.com that answers through DeepSeek's
// OpenAI-compatible API, so the live harness can run against a cheap model
// while prompts, schemas and checks are being tuned. Same log format as
// claude-bridge.mjs, so score-live.py and token-report.py read it unchanged.
//   DEEPSEEK_API_KEY=… node scripts/deepseek-bridge.mjs [port] [logfile]
// DEEPSEEK_MODEL picks the model. Folio's effort per job maps to DeepSeek's
// thinking: DS_THINK_LOW and DS_THINK_MEDIUM are off, low, high or max.
// Spend is capped twice: BUDGET_USD (default 15) across all runs, kept in a
// ledger beside the log, and RUN_BUDGET_USD (default 3) for this process.
// Prices are per million tokens (DS_PRICE_IN / _HIT / _OUT) and the
// account balance is read before and after, so the ledger can be checked.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createServer } from 'node:http';

const PORT = Number(process.argv[2] ?? 8787);
const LOG = process.argv[3] ?? new URL('../apps/web/live-results/bridge.jsonl', import.meta.url).pathname;
const LEDGER = join(dirname(LOG), 'deepseek-spend.json');
mkdirSync(dirname(LOG), { recursive: true });
const KEY = process.env.DEEPSEEK_API_KEY;
const BASE = (process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com').replace(/\/+$/, '');
const MODEL = process.env.DEEPSEEK_MODEL ?? 'deepseek-flash';
const THINK = { low: process.env.DS_THINK_LOW ?? 'off', medium: process.env.DS_THINK_MEDIUM ?? 'low' };
const BUDGET = Number(process.env.BUDGET_USD ?? 15);
const RUN_BUDGET = Number(process.env.RUN_BUDGET_USD ?? 3);
let runUsd = 0;
const PRICE = {
  // deepseek-flash at peak rates (off-peak is half), so the cap trips early, never late.
  in: Number(process.env.DS_PRICE_IN ?? 0.3),
  hit: Number(process.env.DS_PRICE_HIT ?? 0.006),
  out: Number(process.env.DS_PRICE_OUT ?? 1.2),
};
if (!KEY) throw new Error('Set DEEPSEEK_API_KEY.');

const ledger = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : { usd: 0, calls: 0, in: 0, hit: 0, out: 0 };
const saveLedger = () => writeFileSync(LEDGER, JSON.stringify(ledger, null, 2));
let seq = 0;

async function balance() {
  try {
    const res = await fetch(`${BASE}/user/balance`, { headers: { authorization: `Bearer ${KEY}` } });
    const data = await res.json();
    return data.balance_infos?.map((b) => `${b.total_balance} ${b.currency}`).join(', ') ?? `HTTP ${res.status}`;
  } catch (error) {
    return `unavailable (${error})`;
  }
}

/** DeepSeek takes json_object, not json_schema, so the schema goes into the system prompt. */
function toChat(request) {
  const system = typeof request.system === 'string' ? request.system : (request.system ?? []).map((b) => b.text).join('\n\n');
  const schema = request.output_config?.format?.schema;
  const messages = [
    { role: 'system', content: schema ? `${system}\n\nAnswer with one JSON object that matches this JSON Schema:\n${JSON.stringify(schema)}` : system },
    ...(request.messages ?? []).map((m) => ({ role: m.role, content: typeof m.content === 'string' ? m.content : m.content.map((b) => b.text ?? '').join('') })),
  ];
  return {
    model: MODEL,
    messages,
    max_tokens: Math.min(request.max_tokens ?? 8000, Number(process.env.DS_MAX_TOKENS ?? 8000)),
    ...(schema ? { response_format: { type: 'json_object' } } : {}),
    ...thinking(THINK[request.output_config?.effort] ?? THINK.low),
  };
}

function thinking(level) {
  return level === 'off' ? { thinking: { type: 'disabled' } } : { reasoning_effort: level };
}

function costOf(usage) {
  const hit = usage?.prompt_cache_hit_tokens ?? 0;
  const miss = usage?.prompt_cache_miss_tokens ?? Math.max(0, (usage?.prompt_tokens ?? 0) - hit);
  const out = usage?.completion_tokens ?? 0;
  return { hit, miss, out, usd: (miss * PRICE.in + hit * PRICE.hit + out * PRICE.out) / 1e6 };
}

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
const fail = (res, status, type, message) =>
  res.writeHead(status, { ...cors, 'content-type': 'application/json' }).end(JSON.stringify({ type: 'error', error: { type, message } }));

createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return res.writeHead(204, cors).end();
  let body = '';
  for await (const chunk of req) body += chunk;
  try {
    await answer(JSON.parse(body), res);
  } catch {
    res.writeHead(400, cors).end();
  }
}).listen(PORT, async () => {
  console.log(`bridge on ${PORT} → ${BASE} ${MODEL} (thinking: low jobs ${THINK.low}, medium jobs ${THINK.medium}), log ${LOG}`);
  console.log(`budget $${RUN_BUDGET} this run, $${BUDGET} in total; spent so far $${ledger.usd.toFixed(4)} in ${ledger.calls} calls · balance ${await balance()}`);
});

async function answer(request, res) {
  const id = ++seq;
  const started = Date.now();
  if (ledger.usd >= BUDGET || runUsd >= RUN_BUDGET) {
    const which = ledger.usd >= BUDGET ? `total budget $${BUDGET}` : `run budget $${RUN_BUDGET}`;
    console.log(`#${id} REFUSED: ${which} spent (run $${runUsd.toFixed(4)}, total $${ledger.usd.toFixed(4)})`);
    // 400, not 429: the app retries rate limits, and this should stop the run.
    return fail(res, 400, 'invalid_request_error', `Bridge ${which} is spent.`);
  }
  const chat = toChat(request);
  const system = chat.messages[0].content;
  const prompt = chat.messages.slice(1).map((m) => m.content).join('\n\n');
  const schema = request.output_config?.format?.schema;
  try {
    const upstream = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
      body: JSON.stringify(chat),
    });
    const raw = await upstream.text();
    if (!upstream.ok) {
      appendFileSync(LOG, JSON.stringify({ id, ms: Date.now() - started, error: `HTTP ${upstream.status} ${raw.slice(0, 300)}`, prompt: prompt.slice(0, 300) }) + '\n');
      console.log(`#${id} HTTP ${upstream.status} ${raw.slice(0, 200)}`);
      return fail(res, upstream.status, upstream.status === 429 ? 'rate_limit_error' : upstream.status >= 500 ? 'api_error' : 'invalid_request_error', raw.slice(0, 300));
    }
    const data = JSON.parse(raw);
    const choice = data.choices?.[0];
    const text = choice?.message?.content ?? '';
    const c = costOf(data.usage);
    Object.assign(ledger, { usd: ledger.usd + c.usd, calls: ledger.calls + 1, in: ledger.in + c.miss, hit: ledger.hit + c.hit, out: ledger.out + c.out });
    runUsd += c.usd;
    saveLedger();
    const ms = Date.now() - started;
    appendFileSync(
      LOG,
      JSON.stringify({
        id, at: new Date().toISOString(), ms, model: data.model ?? MODEL, effort: request.output_config?.effort ?? null, requestedModel: request.model,
        system, prompt, schemaKeys: schema ? Object.keys(schema.properties ?? {}) : null, isError: false, subtype: choice?.finish_reason, text,
        cost: c.usd, overhead: 0, usage: { in: c.miss + c.hit, cacheRead: c.hit, out: c.out, reasoning: data.usage?.completion_tokens_details?.reasoning_tokens ?? 0 },
      }) + '\n',
    );
    res.writeHead(200, { ...cors, 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        id: `msg_deepseek_${id}`, type: 'message', role: 'assistant', model: data.model ?? MODEL,
        content: [{ type: 'text', text }],
        stop_reason: choice?.finish_reason === 'length' ? 'max_tokens' : 'end_turn', stop_sequence: null,
        usage: { input_tokens: c.miss + c.hit, output_tokens: c.out },
      }),
    );
    const job = schema ? Object.keys(schema.properties ?? {}).join(',') : 'text';
    console.log(`#${id} ${(ms / 1000).toFixed(1)}s ${job} in ${c.miss}+${c.hit}hit out ${c.out} $${c.usd.toFixed(4)} · run $${runUsd.toFixed(3)}/${RUN_BUDGET} · total $${ledger.usd.toFixed(3)}/${BUDGET}`);
  } catch (error) {
    appendFileSync(LOG, JSON.stringify({ id, ms: Date.now() - started, error: String(error), prompt: prompt.slice(0, 300) }) + '\n');
    console.log(`#${id} ERROR ${error}`);
    fail(res, 500, 'api_error', String(error).slice(0, 300));
  }
}

for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, async () => {
    console.log(`\nthis run $${runUsd.toFixed(4)} · in total $${ledger.usd.toFixed(4)} in ${ledger.calls} calls (${ledger.in} in, ${ledger.hit} cached, ${ledger.out} out) · balance ${await balance()}`);
    process.exit(0);
  });
