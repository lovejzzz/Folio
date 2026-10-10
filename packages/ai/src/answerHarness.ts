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
FRAC = re.compile(r'(?<![\w./])((?<![\w)\]])[-−])?(?:(\d+)\s+)?(\d+)\s*/\s*(\d+)(?![\w/]|\.\d)')
def numbers(text):
    """the numbers a text states, in order, each with the decimal places it is given to. Read as a class writes
    them: 3.011 × 10²³ is one number, and so is 2/3, and 1 1/2"""
    # a debt is written with its sign before the currency mark: −$24 is −24
    text = re.sub(r'([-−])([$€£])(?=\d)', r'\2\1', text)
    # a root is the number it names: √5/2, 3√2 and √(10) are read as values, to the digits a float carries
    def root(m):
        v = float(m.group(1) or 1) * math.sqrt(float(m.group(2) or m.group(3)))
        return ' ' + repr(round(v / float(m.group(4)) if m.group(4) else v, 9)) + ' '
    text = re.sub(r'(?<![\w.])(\d+(?:\.\d+)?)?\s*√\s*(?:\((\d+(?:\.\d+)?)\)|(\d+(?:\.\d+)?))(?:\s*/\s*(\d+(?:\.\d+)?))?', root, text)
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
        whole, top, bottom = m.group(2), int(m.group(3)), int(m.group(4))
        if bottom: out.append(((-1 if m.group(1) else 1) * ((int(whole) if whole else 0) + top / bottom), 9, m.group(0)))   # a fraction is exact, and −19/6 is one number
    plain(text[at:])
    return out
def terms(token):
    """the top and bottom of a quotient as it is written, each a whole number of its own"""
    m = re.fullmatch(r'[−-]?(\d+)/(\d+)', token.strip())
    return [(float(m.group(1)), 0, m.group(1)), (float(m.group(2)), 0, m.group(2))] if m else []
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
    # a number the form wrote out as text ('82.0000') is that number: as words, no choice "stated" it
    if isinstance(v, str) and re.fullmatch(r'\s*[-+−]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?\s*', v): return [float(v.replace('−', '-'))]
    # numbers and truths answered together (an IQR, two fences, "is 40 an outlier?") are no one value to find in a sentence
    if isinstance(v, (list, tuple)) and any(isinstance(x, bool) for x in v) and any(not isinstance(x, bool) for x in v): raise Invalid('the form computed numbers and truths together')
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
WORDS = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty'.split()
def is_mantissa(tok, c):
    """6.3e-4 against a computed 6.31: the form worked out the digits and left the power of ten"""
    p = re.split('[eE]', tok.replace('−', '-').replace(',', ''))
    if len(p) != 2: return False
    try: return num_ok(float(p[0]), len(p[0].split('.')[1]) if '.' in p[0] else 0, c)
    except ValueError: return False
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
    # two statements, each on a line in its own ticks, are the code of both lines
    rows = [r.strip() for r in s.split('\n') if r.strip()]
    if len(rows) > 1 and all(len(r) > 1 and r[0] == '\x60' and r[-1] == '\x60' and '\x60' not in r[1:-1] for r in rows): return '\n'.join(r[1:-1] for r in rows)
    return s
def all_code(texts):
    """every choice is code and nothing else: a command to pick, not a value stated"""
    return all(strip_ticks(t) != t.strip() for t in texts)
def symbolic(text):
    """the number a choice writes as an expression ("x = (ln 9 − 2)/4", "√5/2"), or None"""
    import math
    t = text.replace('\x60', '').replace('−', '-').replace('×', '*').replace('·', '*').replace('÷', '/').replace('^', '**').replace('π', ' pi ')
    t = t.split('=')[-1].strip().rstrip('.')
    t = re.sub(r'√\s*\(', 'sqrt(', t); t = re.sub(r'√\s*(\d+(?:\.\d+)?)', r'sqrt(\1)', t)
    t = re.sub(r'\b(ln|log|sqrt|exp|sin|cos|tan)\s+(\d+(?:\.\d+)?)', r'\1(\2)', t)
    t = re.sub(r'\be\s*\*\*', 'E**', t)
    names = {'ln': math.log, 'log': math.log10, 'sqrt': math.sqrt, 'exp': math.exp, 'sin': math.sin, 'cos': math.cos, 'tan': math.tan, 'pi': math.pi, 'E': math.e}
    if not re.fullmatch(r'[\d\s.+\-*/()a-zA-Z]+', t) or any(w not in names for w in re.findall(r'[a-zA-Z]+', t)) or not re.search(r'[a-zA-Z]', t): return None
    try: v = eval(compile(t, '<choice>', 'eval'), {'__builtins__': {}}, names)
    except BaseException: return None
    return float(v) if isinstance(v, (int, float)) and v == v else None
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
    if len(ns_) > len(f) and not first:
        # an answer in prose says more than the result ("Q1 7, Q3 13, IQR 6, fences -2 and 22; 30 is beyond 22, so the whisker ends at 14"):
        # the computed values are looked for in order among its numbers, as for a value stated in a key
        at = 0; missed = []
        for c in f:
            hit = next((k for k in range(at, len(ns_)) if num_ok(ns_[k][0], ns_[k][1], c, tol, tight)), None)
            if hit is None: missed.append(round(c, 6))
            else: at = hit + 1
        return not missed, (f'computed {missed[:6]} not among the stored {[n[2] for n in ns_][:8]}' if missed else f'{len(f)} numbers found in order')
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
                # "8.7 g" and "9 g" both state a computed 8.7 by the rules above: the choice nearest the value is the one that states it
                fv = flat(v)
                if len(hit) > 1 and fv and len(fv) == 1:
                    off = {n: min((abs(x[0] - fv[0]) for x in numbers(ch[n - 1]['text'].replace('\x60', ''))), default=9e99) for n in hit}
                    hit = [n for n in hit if off[n] <= min(off.values()) + 1e-12]
                # "10 km at 37° north of west" and "…north of east" state the same computed numbers: words the numbers cannot judge
                if len(hit) > 1 and keyed in hit:
                    stated = lambda n: [x[0] for x in numbers(ch[n - 1]['text'].replace('\x60', ''))]
                    if all(stated(n) == stated(keyed) for n in hit): return True, f'choices {hit} state the computed numbers and differ in words; the keyed one is among them'
                # a word answer two choices contain ("elastic", "unit elastic"): the choice that is the answer and no more states it
                same = [n for n in hit if isinstance(v, str) and ' '.join(nloc(ch[n - 1]['text']).replace('\x60', '').split()).casefold().strip(' .') == ' '.join(v.split()).casefold().strip(' .')]
                hit = same or hit
                # several values computed, and two choices that hold them among others: the one that states just those, in that order
                if len(hit) > 1 and fv and len(fv) > 1:
                    exact = [n for n in hit if len(numbers(ch[n - 1]['text'].replace('\x60', ''))) == len(fv) and all(num_ok(x[0], x[1], c, tol) for x, c in zip(numbers(ch[n - 1]['text'].replace('\x60', '')), fv))]
                    hit = exact or hit
                # several values at once (two quartiles, a fence and a verdict) matched against choices that word them their own way:
                # when none fits, it is the form that does not fit
                if not hit and (len(flat(v) or []) > 1 or (isinstance(v, (tuple, list)) and len(v) > 1)): raise Invalid('computed several values and no choice states them in that form')
                # choices written as expressions ("(ln 9 − 2)/4") state their values: worked out, the keyed one is the computed 0.0493
                if not hit and fv and len(fv) == 1:
                    hit = sorted(n for n in vals if (lambda x: x is not None and abs(x - fv[0]) <= 1e-6 * max(1.0, abs(fv[0])))(symbolic(ch[n - 1]['text'])))
                # every choice a command to pick (which call returns the mean?): a value was computed, and none of them states one
                if not hit and all_code([c['text'] for c in ch]): raise Invalid('the choices are code, and the form compared them as values')
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
                # code that none of the choices could be read as is not their fault: nothing was tested
                if not hit and sum('SyntaxError' in x for x in notes) >= len(codes): raise Invalid('no choice could be read as code')
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
                    err = run_code(strip_ticks(ch[n - 1]['text']), ns, check.get('probe')) if e.get('kind') == 'code' else None
                    # a line out of a method (return self._items[-1]) is not a program: run alone it stops for where it stands,
                    # and nothing is learned of what it does
                    if (isinstance(err, SyntaxError) and 'outside' in str(err)) or (isinstance(err, NameError) and "'self'" in str(err)): raise Invalid('the choice is a line out of a function and does not run alone')
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
                def missed(words):
                    # a quotient written out states its terms too: "s = √(50/5)" gives the 50 a form computed, and "438 / 8" the 438
                    stored = [x for n in numbers(re.sub(r'(\d)\s+/\s+(?=\d)', r'\1/', words.replace('\x60', '')))[:3 * len(fv) + 4] for x in (terms(n[2]) + [n])]; at = 0; bad = []
                    for c in fv:
                        # a whole number further on is the value only when the value is whole: "SD approximately 1.427 … 100*(1-level)/2"
                        # passed for a computed 1.4588, by the 1 in the formula
                        whole = float(c).is_integer()
                        hit = next((k for k in range(at, len(stored)) if num_ok(stored[k][0], stored[k][1], c, s.get('tolerance')) and (stored[k][1] > 0 or k == at or whole)), None)
                        if hit is None: bad.append(round(c, 6))
                        else: at = hit + 1
                    return stored, bad
                # the anchor fell inside a format string ("Total cost: $%.2f"), where no value stands
                if tail.lstrip().startswith('%'): raise Invalid('the anchor points into a format string')
                stored, bad = missed(tail)
                # components of a vector or terms of a sum are written with the sign set off: "3î − 5ĵ − 7k̂" states −5 and −7
                # and a component of one is written without its 1: "−9î − ĵ − 14k̂" states −9, −1 and −14
                vec = lambda t: re.sub(r'([−-])\s+(?=[\d.])', r'\1', re.sub(r'(?<![\d.])([+−-]?)\s*(?=[îĵ]|k̂|[ijk]\u0302)', r' \g<1>1 ', t))
                if bad and (not missed(re.sub(r'([−-])\s+(?=[\d.])', r'\1', tail))[1] or not missed(vec(tail))[1]): bad = []
                # a count a key spells out ("totaling four", "more than eight of the 16") is that number
                bad = [c for c in bad if not (float(c).is_integer() and 0 <= c <= 20 and re.search(r'(?<![\w-])' + WORDS[int(c)] + r'(?![\w-])', tail[:120], re.I))]
                # the form's anchor ran past the value it was to find: the number is in the words it quoted
                # (also when those words end on "=" and an expression follows: "Then 80 = 5P" is an equation whose left side the
                # form computed, and what comes after is its other side, not a value to compare)
                ends = str(s.get('before') or '').rstrip()[-1:]
                algebra = re.match(r'\s*[-−]?\d+(?:\.\d+)?(?:[A-Za-z](?![A-Za-z])|\(|\s*[*/×·])', tail) is not None
                if bad and (ends not in ('=', '≈', ':', '') or (ends == '=' and algebra)) and all(any(num_ok(n[0], n[1], c, s.get('tolerance')) for n in [x for m in numbers(str(s.get('before') or '')) for x in (terms(m[2]) + [m])]) for c in bad): raise Invalid('the anchor already holds the value')
                if bad and all(any(is_mantissa(n[2], c) for n in stored) for c in bad): raise Invalid('the form computed the digits of a number the text gives with its power of ten')
                # a table in thousands: the form worked out 48 where the key says $48,000. The form's unit, not the key's fault
                if bad and all(any(n[0] != 0 and abs(n[0]) in (abs(c) * 1e3, abs(c) * 1e6, abs(c) / 1e3, abs(c) / 1e6) for n in stored) for c in bad): raise Invalid('the form worked in thousands or millions of what the text states')
                # several values computed, none of them there, and the sentence lists another number of values ("frequencies 3, 3, 1,
                # 0, 0, 1" against a computed pair): the form worked out something else than the key states
                said = len(numbers(re.split(r'\.\s|[;\n]', tail.replace('\x60', ''), maxsplit=1)[0]))
                if len(fv) > 1 and len(bad) == len(fv) and said != len(fv): raise Invalid('the form computed another number of values than the text states there')
                return not bad, (f'computed {bad[:6]} not among the stored {[n[2] for n in stored][:8]}' if bad else f'{len(fv)} numbers found in order')
            import numpy as np
            if isinstance(v, (bool, np.bool_)): return match_text(tail, v)
            want = ' '.join(str(v).split()); got = ' '.join(tail.replace('\x60', '').split()).lstrip('"\'“‘ ')
            if got.startswith(want): return True, f'stored {got[:60]!r} computed {want[:60]!r}'
            # an expression is written many ways: t² for t**2, 2x for 2*x. The same once powers and products are written one
            # way holds; any other difference in an expression a program printed is its notation, and nobody's mistake
            sup = str.maketrans('⁰¹²³⁴⁵⁶⁷⁸⁹', '0123456789')
            one = lambda t: re.sub(r'[\s*·×]', '', re.sub(r'([⁰¹²³⁴⁵⁶⁷⁸⁹]+)', lambda m: '^' + m.group(1).translate(sup), t.replace('**', '^').replace('−', '-')))
            if one(got).startswith(one(want)): return True, 'the same expression, written another way'
            if not isinstance(v, str): raise Invalid('the form computed an expression, which the text may write another way')
            return False, f'stored {got[:60]!r} computed {want[:60]!r}'
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
