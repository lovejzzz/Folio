"""Score live runs against a real model: python3 scripts/score-live.py [apps/web/live-results ...]"""
import json, re, sys, statistics as st, collections, os

def words(s):
    return len(re.findall(r"[\w'’-]+", s)) if not re.search(r'[一-鿿]', s) else len(re.sub(r'\s', '', s)) // 2

TITLE_CASE = re.compile(r"^(?:[A-Z][\w'’-]*\s+){2,}[A-Z]")

def course_stats(c):
    qs = [t for t in c['tasks'].values() if t['kind'] == 'question']
    choice = [q for q in qs if q['format'] == 'choice' and q['correct']]
    pos = collections.Counter('ABCDEF'[[x['id'] for x in q['choices']].index(q['correct'])] for q in choice)
    longest = sum(1 for q in choice if max(q['choices'], key=lambda x: len(x['text']))['id'] == q['correct'])
    def stands_out(q):
        right = next(len(x['text'].strip()) for x in q['choices'] if x['id'] == q['correct'])
        others = [len(x['text'].strip()) for x in q['choices'] if x['id'] != q['correct']]
        return len(q['choices']) >= 3 and right > max(others) * 1.15 and right >= sum(others) / len(others) * 1.3
    standout = sum(1 for q in choice if stands_out(q))
    def ratio(q):
        right = next(len(x['text'].strip()) for x in q['choices'] if x['id'] == q['correct'])
        return right / max(len(x['text'].strip()) for x in q['choices'] if x['id'] != q['correct'])
    ratios = sorted(ratio(q) for q in choice)
    tf = [q for q in qs if q['format'] == 'truefalse']
    tf_true = sum(1 for q in tf if next((x['text'] for x in q['choices'] if x['id'] == q['correct']), '') in ('True', '正确', '对'))
    tf_prefix = sum(1 for q in tf if re.match(r'\s*(true or false|判断)', q['prompt'], re.I))
    lessons = [c['lessons'][i] for i in c['lessonOrder']]
    titles = [l['title'] for l in lessons]
    summaries = [l['summary'] for l in lessons]
    settings_in_summary = sum(1 for s in summaries if re.search(r'quiz|minute|测验|分钟|\d+-question', s, re.I))
    desc = [words(s['description']) for l in lessons for s in l['segments']]
    notes = [words(s['teacherNotes']) for l in lessons for s in l['segments']]
    lines = [s['description'].count('\n') + 1 for l in lessons for s in l['segments']]
    minutes_ok = sum(1 for l in lessons if sum(s['minutes'] for s in l['segments']) == c['shape']['minutesPerLesson'])
    flags = sum(len(t.get('flags') or []) for t in c['tasks'].values())
    diff = collections.Counter(q['difficulty'] for q in qs)
    return {
        'choice correct position': dict(sorted(pos.items())),
        'longest choice is correct': f'{longest}/{len(choice)}',
        'right answer stands out by length': f'{standout}/{len(choice)}',
        'right / longest wrong (median, max)': f'{st.median(ratios):.2f}, {max(ratios):.2f}' if ratios else '-',
        'true/false true': f'{tf_true}/{len(tf)}',
        'true/false prefixed': tf_prefix,
        'Title Case lesson titles': f'{sum(1 for t in titles if TITLE_CASE.match(t))}/{len(titles)}',
        'summaries mentioning settings': f'{settings_in_summary}/{len(summaries)}',
        'summary words (max)': max(words(s) for s in summaries),
        'segment description words (median/max)': f'{st.median(desc):.0f}/{max(desc)}',
        'segment lines (median)': st.median(lines),
        'teacher notes words (median/max)': f'{st.median(notes):.0f}/{max(notes)}',
        'lessons whose minutes add up': f'{minutes_ok}/{len(lessons)}',
        'difficulty': dict(sorted(diff.items())),
        'flags': flags,
    }

for root in sys.argv[1:] or ['apps/web/live-results']:
    print(f'######## {root}')
    for name in ('en', 'zh', 'stats', 'sources', 'vague', 'history'):
        path = os.path.join(root, f'live-{name}.json')
        if not os.path.exists(path):
            continue
        d = json.load(open(path))
        quiz_calls = sum(1 for x in d['calls'] if x['kind'] == 'quiz questions')
        lessons = len(d['course']['lessonOrder'])
        print(f'== {name}: outline {d["marks"]["outline"]/1000:.0f}s, build {d["marks"]["build"]/1000:.0f}s, {len(d["calls"])} calls ({quiz_calls - lessons} quiz repairs), toast: {d["toast"]}')
        for k, v in course_stats(d['course']).items():
            print(f'   {k:42s} {v}')
    path = os.path.join(root, 'course.json')
    if os.path.exists(path):
        d = json.load(open(path))
        c = d['course']
        print(f'== {os.path.basename(root)}: {len(c["lessonOrder"])} lessons, outline {d["marks"]["outline"]/1000:.0f}s, build {d["marks"]["build"]/1000:.0f}s, {len(d["calls"])} calls')
        for k, v in course_stats(c).items():
            print(f'   {k:42s} {v}')
        lessons = [c['lessons'][i] for i in c['lessonOrder']]
        print(f"   {'lessons with readings':42s} {sum(1 for l in lessons if l.get('readings'))}/{len(lessons)}")
        grading = ', '.join(f"{g['item']} {g['weight']}%" for g in c.get('grading') or [])
        print(f"   {'grading':42s} {grading or '-'}")
    path = os.path.join(root, 'live-assist.json')
    if os.path.exists(path):
        r = json.load(open(path))['results']
        print('== assist')
        for k in ('original', 'Simplify', 'Harder', 'Translate', 'Explain'):
            v = r.get(k, '')
            print(f'   {k:10s} {words(v):3d}w  {v[:160]}')
        us = [k for k in ('Simplify', 'Harder', 'Explain') if re.search(r'\b(favorite|color|behavior|center)\b', r.get(k, ''))]
        print('   American spellings in:', us)
        for p in r.get('plans', []):
            print('   ⌘K', p['request'], '→', ' | '.join(p['preview'].split('\n')[3:8])[:220])
    log = os.path.join(root, 'bridge.jsonl')
    if os.path.exists(log):
        rows = [json.loads(l) for l in open(log)]
        cost = sum(x.get('cost') or 0 for x in rows)
        ms = sorted(x['ms'] for x in rows)
        print(f'== bridge: {len(rows)} calls, ${cost:.2f}, median {ms[len(ms)//2]/1000:.0f}s, errors {sum(1 for x in rows if x.get("error") or x.get("isError"))}')
