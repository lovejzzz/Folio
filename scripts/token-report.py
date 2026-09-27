"""Where a live build's tokens went, per job, from the bridge log.

  python3 scripts/token-report.py [--since 2026-09-27T06:00] [--grep text] [--model claude-sonnet-5]

The bridge answers through `claude -p`, which adds about CLI_OVERHEAD input
tokens of its own to every call; the app talking to the API directly does
not, so that is subtracted from the input column. Output tokens include the
model's thinking, which is why "out" is compared with the tokens the JSON
answer itself needs.
"""
import argparse, collections, json, os, re

CLI_OVERHEAD = 1060
LOG = os.path.join(os.path.dirname(__file__), '..', 'apps', 'web', 'live-results', 'bridge.jsonl')
KINDS = [
    ('outline', 'Plan exactly'),
    ('plan', 'Write the lesson plan'),
    ('slides', 'Write a slide deck'),
    ('study', 'Write a study guide'),
    ('quiz', 'quiz questions'),
    ('assignment', 'Write one assignment'),
    ('discussions', 'discussion prompts'),
    ('faq', 'commonly ask'),
    ('⌘K plan', 'Turn the request into'),
    ('text action', 'Selected text'),
]


def answer_tokens(text):
    """A rough count of the tokens the answer needs: ~3.6 characters each in English, ~1.4 in Chinese."""
    cjk = len(re.findall(r'[㐀-鿿]', text or ''))
    return round(cjk / 1.4 + (len(text or '') - cjk) / 3.6)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--since', default='')
    ap.add_argument('--grep', default='')
    ap.add_argument('--model', default='')
    ap.add_argument('--log', default=LOG)
    a = ap.parse_args()
    rows = [json.loads(line) for line in open(a.log)]
    rows = [r for r in rows if 'usage' in r and r.get('usage') and (r.get('at') or '') >= a.since and a.grep in (r.get('prompt') or '') + (r.get('system') or '') and (not a.model or r.get('model') == a.model)]
    agg = collections.defaultdict(collections.Counter)
    for r in rows:
        kind = next((k for k, marker in KINDS if marker in r['prompt']), 'other')
        repair = 'Your previous answer was' in r['prompt']
        c = agg[kind + (' (repair)' if repair else '')]
        c['n'] += 1
        c['in'] += max(0, r['usage']['in'] - CLI_OVERHEAD)
        c['out'] += r['usage']['out']
        c['answer'] += answer_tokens(r.get('text'))
        c['cost'] += r.get('cost') or 0
        c['ms'] += r['ms']
    print(f"{len(rows)} calls · model {', '.join(sorted({r.get('model') or '?' for r in rows}))}")
    print(f"{'job':22s} {'calls':>5s} {'in/call':>8s} {'out/call':>9s} {'answer':>7s} {'thinking':>9s} {'s/call':>7s} {'$ (CLI)':>8s}")
    total = collections.Counter()
    for kind, c in sorted(agg.items(), key=lambda kv: -kv[1]['cost']):
        n = c['n']
        thinking = max(0, c['out'] - c['answer'])
        print(f"{kind:22s} {n:5d} {c['in']/n:8.0f} {c['out']/n:9.0f} {c['answer']/n:7.0f} {thinking/max(1,c['out']):8.0%} {c['ms']/n/1000:7.1f} {c['cost']:8.2f}")
        total.update(c)
    if total['n']:
        print(f"{'total':22s} {total['n']:5d} {total['in']:8d} {total['out']:9d} {total['answer']:7d} {max(0,total['out']-total['answer'])/max(1,total['out']):8.0%} {'':7s} {total['cost']:8.2f}")
        print(f"(in = without the CLI's own ~{CLI_OVERHEAD} tokens; cost is what the CLI billed, overhead included)")


main()
