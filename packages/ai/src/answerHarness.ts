/**
 * The fixed program that checks an answer. A model fills in a form for one question or one answer key: code that
 * builds the item's data, and expressions that compute what the item claims. This program runs them and compares
 * the results with the words stored in the item itself, read from the item and never from the form. A model that
 * wrote its own checks ran every one of them and let wrong keys through (it straightened a curly quote before
 * testing the answer that had it); a form cannot restate the key, so it cannot agree with a wrong one.
 *
 * Python, run in the workshop. Measured on 73 items: every known wrong key and explanation failed, and 9 in 10 of
 * 40 planted faults. Changed from that version in one way: what an explanation "says" a choice does is tested
 * only for choices that are code.
 */
export const HARNESS = String.raw`
import sys, json, re, ast, io, contextlib, math, warnings
warnings.filterwarnings('ignore')
LOC = {0x201c: '"', 0x201d: '"', 0x2018: "'", 0x2019: "'", 0x2212: '-', 0xa0: ' '}
def nloc(s): return s.translate(LOC)   # 1:1, used ONLY to locate an anchor; values and code are taken from the stored text
NUM = re.compile(r'(?<![\w.])(?:(?<![\w)\]])[-−])?(?:(?:\d{1,3}(?:,\d{3})+(?!\d)|\d+)(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?')
SUP = str.maketrans('⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻', '0123456789+-')
SCI = re.compile(r'(\d[\d,]*(?:\.\d+)?)\s*[×x·*]\s*10\s*(?:\^\s*\{?\s*([-+−]?\d+)\s*\}?|([⁺⁻]?[⁰¹²³⁴⁵⁶⁷⁸⁹]+))')
FRAC = re.compile(r'(?<![\w./])(?:(\d+)\s+)?(\d+)\s*/\s*(\d+)(?![\w/]|\.\d)')
def numbers(text):
    """the numbers a text states, in order, each with the decimal places it is given to. Read as a class writes
    them: 3.011 × 10²³ is one number, and so is 2/3, and 1 1/2"""
    # scientific notation first, as one token the pattern below reads
    text = SCI.sub(lambda m: m.group(1).replace(',', '') + 'e' + (m.group(2) or m.group(3).translate(SUP)).replace('−', '-'), text)
    out = []; at = 0
    def plain(part):
        for m in NUM.finditer(part):
            s = m.group(0).replace('−', '-')
            if s.endswith('.'): s = s[:-1]
            t = s.replace(',', '')
            mant = re.split('[eE]', t)[0]
            d = len(mant.split('.')[1]) if '.' in mant else 0
            if re.search('[eE]', t): d = d - int(re.split('[eE]', t)[1])   # places of the whole number, not of its mantissa
            try: out.append((float(t), d, m.group(0)))
            except ValueError: pass
    for m in FRAC.finditer(text):
        plain(text[at:m.start()]); at = m.end()
        whole, top, bottom = m.group(1), int(m.group(2)), int(m.group(3))
        if bottom: out.append(((int(whole) if whole else 0) + top / bottom, 9, m.group(0)))   # a fraction is exact
    plain(text[at:])
    return out
def _flatten(v, out):
    import numpy as np
    if isinstance(v, (bool, np.bool_, str, bytes)) or v is None: raise ValueError('not a number')
    if hasattr(v, 'to_numpy'): v = v.to_numpy()
    if isinstance(v, dict): v = list(v.values())
    if isinstance(v, (list, tuple)):
        # one by one: an answer of several parts ("expected counts 60, 30, 30; df = 2") is a list and a number
        for x in v: _flatten(x, out)
        return
    a = np.asarray(v)
    if a.dtype == object: a = np.asarray(a.tolist(), dtype=float)
    if a.dtype.kind not in 'iuf': raise ValueError('not a number')
    out.extend(float(x) for x in a.ravel())
def flat(v):
    """numbers in a computed value, in order, or None when it is not numeric"""
    out = []
    try: _flatten(v, out)
    except Exception: return None
    return out
def num_ok(stored, d, computed, tol=None, tight=False):
    if computed != computed: return False
    # one unit of the last place given: half a unit called a key wrong when its constant had one more digit than the form's.
    # A whole number is itself or wrong (at one unit "2 malignant" passed for a computed 3), and a form's own
    # tolerance may widen the rule, never narrow it: at 0.01, "df = 11.0" failed against 10.958.
    t = 0.5 * 10 ** (-d) if tight or d <= 0 else 1.0 * 10 ** (-d)
    if tol is not None and not tight: t = max(t, float(tol))
    return abs(stored - computed) <= t * (1 + 1e-9) + 1e-12
def not_literal(expr):
    try: tree = ast.parse(expr, mode='eval')
    except SyntaxError: return True   # reported when evaluated
    for n in ast.walk(tree):   # a boolean forced by a constant is a restated verdict
        if isinstance(n, ast.BoolOp) and any(isinstance(v, ast.Constant) for v in n.values): return False
        if isinstance(n, ast.IfExp) and isinstance(n.test, ast.Constant): return False
    return any(isinstance(n, (ast.Name, ast.Call)) for n in ast.walk(tree))
class Invalid(Exception): pass

def field(item, where):
    if where.startswith('choice:'):
        n = int(where.split(':')[1]); ch = item.get('choices') or []
        if not 1 <= n <= len(ch): raise Invalid(f'no choice {n}')
        return ch[n - 1]['text']
    if where not in ('prompt', 'answer', 'explanation', 'answerKey', 'steps'): raise Invalid(f'unknown where {where}')
    v = item.get(where) or ''
    return '\n'.join(v) if isinstance(v, list) else v
def locate(text, before, occ=None, end=True):
    T, B = nloc(text), nloc(before)
    if not B: raise Invalid('empty anchor')
    idx = [m.start() for m in re.finditer(re.escape(B), T)]
    if not idx: raise Invalid(f'anchor not in stored text: {before[:60]!r}')
    if len(idx) > 1 and not occ: raise Invalid(f'anchor occurs {len(idx)} times: {before[:60]!r}')
    i = idx[(occ or 1) - 1] if (occ or 1) <= len(idx) else None
    if i is None: raise Invalid('occurrence out of range')
    return i + len(B) if end else i
def strip_ticks(s):
    s = s.strip()
    m = re.fullmatch(r'\x60\x60\x60(?:python)?\n?(.*?)\x60\x60\x60', s, re.S)
    if m: return m.group(1).strip()
    if len(s) > 1 and s[0] == '\x60' and s[-1] == '\x60' and '\x60' not in s[1:-1]: return s[1:-1]
    return s
def run_code(code, ns, probe=None):
    """runs stored code exactly as stored; returns result, raised, error name, printed"""
    buf = io.StringIO(); result = None; err = None
    try:
        with contextlib.redirect_stdout(buf):
            try: c = compile(code, '<cell stored>', 'eval'); is_expr = True
            except SyntaxError: c = compile(code, '<cell stored>', 'exec'); is_expr = False
            if is_expr: result = eval(c, ns)
            else: exec(c, ns)
            if probe: result = eval(compile(probe, '<cell probe>', 'eval'), ns)
    except BaseException as e:
        err = e; result = e
    ns.update(result=result, raised=err is not None, error=type(err).__name__ if err else None, printed=buf.getvalue())
    return err
def match_text(text, val, first=None, tol=None, tight=False):
    """does the stored text state the computed value? returns (ok, detail)"""
    body = text.replace('\x60', '')
    import numpy as np
    if isinstance(val, (bool, np.bool_)):
        w = re.match(r'\W*(true|false|yes|no)\b', body, re.I)
        if not w: return False, f'no True/False in {text[:40]!r}'
        return (w.group(1).lower() in ('true', 'yes')) == bool(val), f'stored {w.group(1)} computed {bool(val)}'
    f = flat(val)
    if f is None:
        s = ' '.join(str(val).split()).casefold(); b = ' '.join(nloc(body).split()).casefold()
        # as a word of its own: "elastic" was found in "inelastic" and in "unit elastic", and four choices all stated the answer
        return bool(s and re.search(r'(?<![\w-])' + re.escape(s) + r'(?![\w-])', b)), f'stored {text[:50]!r} computed {str(val)[:50]!r}'
    ns_ = numbers(body)
    if first: ns_ = ns_[:int(first)]
    if len(ns_) != len(f): return False, f'stored has {len(ns_)} numbers {[n[2] for n in ns_][:8]}, computed {len(f)}: {[round(x, 6) for x in f][:8]}'
    bad = [(n[2], round(c, 6)) for n, c in zip(ns_, f) if not num_ok(n[0], n[1], c, tol, tight)]
    return not bad, (f'stored/computed differ: {bad[:6]}' if bad else f'{len(f)} numbers equal')

def check_item(item, check):
    out = []; add = lambda id, what, status, detail='': out.append({'id': id, 'what': what, 'status': status, 'detail': str(detail)[:300]})
    if not isinstance(check, dict): return {'status': 'INVALID', 'checks': [], 'why': 'check is not an object'}
    if check.get('checkable') is False: return {'status': 'UNCHECKABLE', 'checks': [], 'why': check.get('reason_kind', '?'), 'key_checked': False}
    setup = check.get('setup') or ''
    def fresh():
        ns = {'__name__': 'check'}
        with contextlib.redirect_stdout(io.StringIO()): exec(compile(setup, '<cell setup>', 'exec'), ns)
        return ns
    try: fresh()
    except BaseException as e: return {'status': 'INVALID', 'checks': [], 'why': f'setup raised {type(e).__name__}: {e}'[:300], 'key_checked': False}
    def ev(expr, ns=None):
        if not isinstance(expr, str) or not expr.strip(): raise Invalid('missing expression')
        if not not_literal(expr): raise Invalid(f'expression is a literal (restates a value): {expr[:60]}')
        try: return eval(compile(expr, '<cell expr>', 'eval'), ns if ns is not None else fresh())
        except Invalid: raise
        except BaseException as e: raise Invalid(f'expression raised {type(e).__name__}: {e}')
    def guard(id, what, fn):
        try:
            ok, detail = fn(); add(id, what, 'pass' if ok else 'fail', detail)
        except Invalid as e: add(id, what, 'invalid', e)
        except BaseException as e: add(id, what, 'invalid', f'{type(e).__name__}: {e}')
    key_checked = False
    fmt = item.get('format') if item['kind'] == 'question' else 'assignment'
    tol = check.get('tolerance')
    # ---- the key ----
    if fmt == 'choice':
        ch = item['choices']; keyed = [i for i, c in enumerate(ch) if c['id'] == item['correct']]
        if len(keyed) != 1: return {'status': 'INVALID', 'checks': [], 'why': 'item has no single keyed choice', 'key_checked': False}
        keyed = keyed[0] + 1
        ents = {int(e['n']): e for e in (check.get('choices') or []) if isinstance(e, dict) and 'n' in e}
        vals = [n for n, e in ents.items() if e.get('kind') == 'value' and 1 <= n <= len(ch)]
        codes = [n for n, e in ents.items() if e.get('kind') == 'code' and 1 <= n <= len(ch)]
        claims = [n for n, e in ents.items() if e.get('kind') == 'claim' and 1 <= n <= len(ch)]
        if vals:
            def f():
                v = ev(check.get('answer_expr'))
                hit = sorted(n for n in vals if match_text(ch[n - 1]['text'], v, ents[n].get('first'), tol)[0])
                # two choices one unit apart (0.6 and 0.7) both pass the loose rule: the one that rounds to the value is the one that states it
                near = [n for n in hit if match_text(ch[n - 1]['text'], v, ents[n].get('first'), tol, True)[0]] if len(hit) > 1 else []
                hit = near or hit
                # a word answer two choices contain ("elastic", "unit elastic"): the choice that is the answer and no more states it
                same = [n for n in hit if isinstance(v, str) and ' '.join(nloc(ch[n - 1]['text']).replace('\x60', '').split()).casefold().strip(' .') == ' '.join(v.split()).casefold().strip(' .')]
                hit = same or hit
                # several values at once (two quartiles, a fence and a verdict) matched against choices that word them their own way:
                # when none fits, it is the form that does not fit
                if not hit and (len(flat(v) or []) > 1 or (isinstance(v, (tuple, list)) and len(v) > 1)): raise Invalid('computed several values and no choice states them in that form')
                return hit == [keyed], f'choices stating the computed value: {hit}; keyed: {keyed}; computed {str(v)[:80]!r}'
            guard('key', 'computed answer is stated by the keyed choice and by no other', f); key_checked = True
        if codes:
            def f():
                hit = []; notes = []
                for n in sorted(codes):
                    ns = fresh(); err = run_code(strip_ticks(ch[n - 1]['text']), ns, check.get('probe'))
                    j = check.get('judge')
                    if not isinstance(j, str) or not j.strip() or not not_literal(j): raise Invalid('judge missing or literal')
                    try: ok = bool(eval(compile(j, '<cell judge>', 'eval'), ns))
                    except BaseException as e: ok = False; notes.append(f'{n}: judge raised {type(e).__name__}')
                    if err is not None: notes.append(f'{n}: {type(err).__name__}')
                    if ok: hit.append(n)
                return hit == [keyed], f'choices whose stored code does the job: {hit}; keyed: {keyed}; {"; ".join(notes)}'
            guard('key', 'stored code of the keyed choice, and of no other, does what is asked', f); key_checked = True
        for n in sorted(claims):
            def f(n=n):
                t = bool(ev(ents[n].get('truth_expr')))
                return t == (n == keyed), f'statement computed {t}; keyed: {n == keyed}'
            guard(f'choice{n}', 'truth of the choice agrees with the key', f); key_checked = key_checked or n == keyed
        for n, e in sorted(ents.items()):
            if not 1 <= n <= len(ch): add(f'choice{n}', 'entry', 'invalid', 'no such choice'); continue
            if e.get('origin_expr'):
                def f(n=n, e=e):
                    v = ev(e['origin_expr'])
                    if flat(v) and not numbers(ch[n - 1]['text'].replace('\x60', '')): raise Invalid('the choice states no number to compare')
                    return match_text(ch[n - 1]['text'], v, e.get('first'), tol)
                guard(f'origin{n}', 'the mistake the explanation names gives this distractor', f)
            if e.get('says_expr') and e.get('kind') == 'code':
                def f(n=n, e=e):
                    ns = fresh()
                    if e.get('kind') == 'code': run_code(strip_ticks(ch[n - 1]['text']), ns, check.get('probe'))
                    if not not_literal(e['says_expr']): raise Invalid('says_expr is a literal')
                    try: return bool(eval(compile(e['says_expr'], '<cell says>', 'eval'), ns)), f"choice {n}, tested as: {e['says_expr'][:160]}"
                    except BaseException as x: raise Invalid(f'says_expr raised {type(x).__name__}: {x}')
                guard(f'says{n}', 'what the explanation says this choice does is what it does', f)
    elif fmt == 'truefalse':
        if check.get('truth_expr'):
            def f():
                ch = item['choices']; kt = [c['text'] for c in ch if c['id'] == item['correct']][0].strip().lower()
                t = bool(ev(check['truth_expr'])); return t == (kt == 'true'), f'statement computed {t}; keyed {kt}'
            guard('key', 'computed truth of the statement equals the keyed choice', f); key_checked = True
    elif fmt in ('numeric', 'short'):
        kind = check.get('answer_kind') or ('value' if fmt == 'numeric' else None)
        if kind == 'value':
            guard('key', 'computed answer equals the stored answer', lambda: match_text(item.get('answer') or '', ev(check.get('answer_expr')), check.get('first'), tol)); key_checked = True
        elif kind == 'code':
            def f():
                ns = fresh(); err = run_code(strip_ticks(item.get('answer') or ''), ns, check.get('probe'))
                if err is not None: return False, f'stored answer does not run as written: {type(err).__name__}: {err}'
                j = check.get('judge')
                if not isinstance(j, str) or not j.strip() or not not_literal(j): raise Invalid('judge missing or literal')
                try: return bool(eval(compile(j, '<cell judge>', 'eval'), ns)), 'stored answer ran; judge evaluated'
                except BaseException as e: raise Invalid(f'judge raised {type(e).__name__}: {e}')
            guard('key', 'stored answer runs as written and does what is asked', f); key_checked = True
    # ---- stated values anywhere in the item ----
    for k, s in enumerate(check.get('stated') or []):
        def f(s=s):
            text = field(item, s.get('where', '')); pos = locate(text, s.get('before', ''), s.get('occurrence'))
            tail = text[pos:pos + 400]; v = ev(s.get('expr'))
            if s.get('kind') == 'range':
                ns_ = numbers(tail)[:2]; fv = flat(v)
                if len(ns_) < 2 or not fv or len(fv) != 1: raise Invalid('range needs two stored numbers and a scalar')
                return ns_[0][0] <= fv[0] <= ns_[1][0], f'computed {fv[0]:.6g}; stored range {ns_[0][2]}..{ns_[1][2]}'
            fv = flat(v)
            if fv is not None:
                # the computed values in order among the numbers that follow: a key says "2.45 for n = 4 and 1.64 for n = 9",
                # and the 4 and the 9 are not results
                stored = numbers(tail.replace('\x60', ''))[:3 * len(fv) + 4]; at = 0; bad = []
                for c in fv:
                    # a whole number further on is the value only when the value is whole: "SD approximately 1.427 … 100*(1-level)/2"
                    # passed for a computed 1.4588, by the 1 in the formula
                    whole = float(c).is_integer()
                    hit = next((k for k in range(at, len(stored)) if num_ok(stored[k][0], stored[k][1], c, s.get('tolerance')) and (stored[k][1] > 0 or k == at or whole)), None)
                    if hit is None: bad.append(round(c, 6))
                    else: at = hit + 1
                return not bad, (f'computed {bad[:6]} not among the stored {[n[2] for n in stored][:8]}' if bad else f'{len(fv)} numbers found in order')
            import numpy as np
            if isinstance(v, (bool, np.bool_)): return match_text(tail, v)
            want = ' '.join(str(v).split()); got = ' '.join(tail.replace('\x60', '').split()).lstrip('"\'“‘ ')
            return got.startswith(want), f'stored {got[:60]!r} computed {want[:60]!r}'
        guard(f'stated{k + 1}', f"{s.get('where')}: …{str(s.get('before'))[-50:]}", f)
        if s.get('where') in ('answerKey', 'answer'): key_checked = True
    # ---- code in the stored text that must run as written ----
    for k, s in enumerate(check.get('verbatim') or []):
        def f(s=s):
            text = field(item, s.get('where', '')); t = s.get('text', '')
            pos = locate(text, t, s.get('occurrence'), end=False); stored = text[pos:pos + len(nloc(t))]
            ns = fresh(); err = run_code(stored, ns, s.get('probe'))
            # a line lifted from a key ("current.next = new") has no list to act on: not run is not wrong; and an error the item
            # itself names (what happens on the input "]"? IndexError) is the answer, not a fault
            if isinstance(err, NameError) or (isinstance(err, SyntaxError) and 'outside' in str(err)): raise Invalid(f'stored code is a fragment: {str(err)[:80]}')
            if err is not None and type(err).__name__ in json.dumps(item): return True, f'raises {type(err).__name__}, as the item says'
            if err is not None: return False, f'stored code does not run as written: {type(err).__name__}: {str(err)[:120]} | {stored[:80]!r}'
            if s.get('expect'):
                if not not_literal(s['expect']): raise Invalid('expect is a literal')
                try: return bool(eval(compile(s['expect'], '<cell expect>', 'eval'), ns)), 'ran; expectation evaluated'
                except BaseException as e: raise Invalid(f'expect raised {type(e).__name__}: {e}')
            return True, 'ran'
        guard(f'verbatim{k + 1}', f"{s.get('where')}: {str(s.get('text'))[:50]}", f)
    st = [c['status'] for c in out]
    status = 'UNCHECKABLE' if not out else 'FAIL' if 'fail' in st else 'INVALID' if 'invalid' in st else 'PASS'
    return {'status': status, 'checks': out, 'key_checked': key_checked, 'n_checks': len(out), 'unchecked': check.get('unchecked') or []}

def run_check(item_path, check_path):
    """One item and its form in, one line of JSON out. Whatever goes wrong, a verdict comes back."""
    try:
        item = json.load(open(item_path))
        check = json.load(open(check_path))
        r = check_item(item, check)
    except BaseException as e:
        r = {'status': 'INVALID', 'checks': [], 'why': f'harness: {type(e).__name__}: {e}'[:300]}
    return json.dumps(r, ensure_ascii=False, default=str)
`;
