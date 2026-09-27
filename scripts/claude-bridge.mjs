// A stand-in for api.anthropic.com that answers through the local Claude CLI
// (`claude -p`), so the app can be tested end to end against a real model
// without an API key in the browser. Every call is logged for scoring.
//   node scripts/claude-bridge.mjs [port] [logfile]
// BRIDGE_MODEL picks the model (default claude-opus-5-5).
// The schema goes into the system prompt and the answer is one turn: the CLI's
// --json-schema writes the answer as text and then again as a tool call, three
// turns in all, which doubled output tokens and time against the app talking to
// the API. BRIDGE_JSON_SCHEMA=1 brings the old way back.
import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createServer } from 'node:http';

const PORT = Number(process.argv[2] ?? 8787);
const LOG = process.argv[3] ?? new URL('../apps/web/live-results/bridge.jsonl', import.meta.url).pathname;
mkdirSync(dirname(LOG), { recursive: true });
const MODEL = process.env.BRIDGE_MODEL ?? 'claude-opus-5-5';
let seq = 0;

const CLI_SCHEMA = process.env.BRIDGE_JSON_SCHEMA === '1';

function runClaude({ system, prompt, schema, effort }) {
  return new Promise((resolve, reject) => {
    const args = ['-p', '--model', MODEL, '--output-format', 'json', '--tools', '', '--no-session-persistence', '--max-turns', CLI_SCHEMA ? '4' : '1'];
    const inPrompt = schema && !CLI_SCHEMA ? `\n\nAnswer with one JSON object that matches this JSON Schema, and nothing else:\n${JSON.stringify(schema)}` : '';
    if (system || inPrompt) args.push('--system-prompt', `${system}${inPrompt}`);
    if (schema && CLI_SCHEMA) args.push('--json-schema', JSON.stringify(schema));
    if (effort) args.push('--effort', effort);
    const child = spawn('claude', args, { cwd: '/tmp', stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', reject);
    child.on('close', (code) => {
      try {
        resolve(JSON.parse(out));
      } catch {
        reject(new Error(`claude exited ${code}: ${err.slice(0, 500)} ${out.slice(0, 500)}`));
      }
    });
    child.stdin.end(prompt);
  });
}

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };

createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return res.writeHead(204, cors).end();
  let body = '';
  for await (const chunk of req) body += chunk;
  const id = ++seq;
  const started = Date.now();
  let request;
  try {
    request = JSON.parse(body);
  } catch {
    return res.writeHead(400, cors).end();
  }
  const prompt = (request.messages ?? []).map((m) => (typeof m.content === 'string' ? m.content : m.content.map((b) => b.text ?? '').join(''))).join('\n\n');
  const system = typeof request.system === 'string' ? request.system : (request.system ?? []).map((b) => b.text).join('\n');
  const schema = request.output_config?.format?.schema;
  const effort = request.output_config?.effort;
  try {
    const out = await runClaude({ system, prompt, schema, effort });
    const structured = out.structured_output;
    // One turn answers in text; a fence around the JSON is the only wrapping models add.
    const text = structured !== undefined ? JSON.stringify(structured) : String(out.result ?? '').replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, '');
    const ms = Date.now() - started;
    appendFileSync(LOG, JSON.stringify({ id, at: new Date().toISOString(), ms, model: MODEL, effort: effort ?? null, requestedModel: request.model, system, prompt, schemaKeys: schema ? Object.keys(schema.properties ?? {}) : null, isError: out.is_error, subtype: out.subtype, text, cost: out.total_cost_usd, usage: out.usage && { in: out.usage.input_tokens + (out.usage.cache_read_input_tokens ?? 0) + (out.usage.cache_creation_input_tokens ?? 0), cacheRead: out.usage.cache_read_input_tokens ?? 0, out: out.usage.output_tokens } }) + '\n');
    if (out.is_error) {
      res.writeHead(500, { ...cors, 'content-type': 'application/json' });
      return res.end(JSON.stringify({ type: 'error', error: { type: 'api_error', message: String(out.result ?? out.subtype) } }));
    }
    res.writeHead(200, { ...cors, 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        id: `msg_bridge_${id}`,
        type: 'message',
        role: 'assistant',
        model: MODEL,
        content: [{ type: 'text', text }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: out.usage?.input_tokens ?? 0, output_tokens: out.usage?.output_tokens ?? 0 },
      }),
    );
    console.log(`#${id} ${(ms / 1000).toFixed(1)}s ${schema ? Object.keys(schema.properties ?? {}).join(',') : 'text'} $${(out.total_cost_usd ?? 0).toFixed(3)}`);
  } catch (error) {
    appendFileSync(LOG, JSON.stringify({ id, ms: Date.now() - started, error: String(error), prompt: prompt.slice(0, 300) }) + '\n');
    console.log(`#${id} ERROR ${error}`);
    res.writeHead(500, { ...cors, 'content-type': 'application/json' });
    res.end(JSON.stringify({ type: 'error', error: { type: 'api_error', message: String(error).slice(0, 300) } }));
  }
}).listen(PORT, () => console.log(`bridge on ${PORT} → ${MODEL}, log ${LOG}`));
