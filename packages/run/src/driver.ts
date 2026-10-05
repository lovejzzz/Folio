/**
 * The notebook driver: Python that runs inside the interpreter, the same text in the browser and in Node.
 * Cells run in order in one namespace. What a cell prints is kept up to a limit, the value of a last
 * expression comes back as its repr, and every figure left open is saved as a PNG and closed.
 */
export const DRIVER = String.raw`
import sys, io, os, ast, gc, time, traceback, linecache, warnings, functools

os.environ.setdefault("MPLBACKEND", "Agg")
# Under Agg, plt.show() only warns; a notebook shows nothing for it.
warnings.filterwarnings("ignore", message=".*FigureCanvasAgg is non-interactive.*")
warnings.filterwarnings("ignore", message=".*non-interactive, and thus cannot be shown.*")

_ns = {"__name__": "__main__", "__builtins__": __builtins__}
_count = 0
_figs_since_gc = 0
_prepared = set()


class _Capped(io.TextIOBase):
    """Text sink that keeps at most limit characters and counts the rest."""

    def __init__(self, limit):
        self.limit, self.parts, self.kept, self.total = limit, [], 0, 0

    def writable(self):
        return True

    def write(self, s):
        if not isinstance(s, str):
            raise TypeError("write() argument must be str")
        n = len(s)
        self.total += n
        room = self.limit - self.kept
        if room > 0:
            piece = s if n <= room else s[:room]
            self.parts.append(piece)
            self.kept += len(piece)
        return n

    def getvalue(self):
        return "".join(self.parts)


def _widen(np):
    """This platform is 32-bit, so numpy's default integer is int32 and sums past two billion wrap around
    without a word. A teacher's computer gives int64. Arrays the course's own code makes, and that are int32
    only by that default, are widened; one the code asked to be int32 is left alone, and so is every call a
    library makes, since libraries count and index in the platform's own size."""
    if np.dtype(int).itemsize >= 8:
        return
    ours = lambda: sys._getframe(2).f_code.co_filename.startswith("<cell ")

    def wide(fn, at):
        """at: where the dtype goes when it is given by position."""
        @functools.wraps(fn)
        def made(*a, **k):
            r = fn(*a, **k)
            if not (isinstance(r, np.ndarray) and r.dtype == np.int32 and ours()):
                return r
            dtype = k.get("dtype", a[at] if len(a) > at and isinstance(a[at], (type, np.dtype, str)) else None)
            asked = dtype is not None and dtype not in (int, "int")  # plain int means the platform's default
            given = bool(a) and isinstance(a[0], (np.ndarray, np.generic)) and a[0].dtype == np.int32
            return r if asked or given else r.astype(np.int64)
        return made

    def narrow(fn, at):
        """Counts must fit the platform's size: take the course's wide ones back where they do."""
        @functools.wraps(fn)
        def made(*a, **k):
            a = list(a)
            if len(a) > at and isinstance(a[at], np.ndarray) and a[at].dtype == np.int64 and ours():
                if a[at].size == 0 or (a[at].min() >= -2**31 and a[at].max() < 2**31):
                    a[at] = a[at].astype(np.int32)
            return fn(*a, **k)
        return made

    for name, at in (("array", 1), ("asarray", 1), ("zeros", 1), ("ones", 1), ("empty", 1), ("full", 2), ("arange", 3)):
        setattr(np, name, wide(getattr(np, name), at))
    np.bincount, np.repeat = narrow(np.bincount, 0), narrow(np.repeat, 1)
    # An array shows its dtype only when it is not the default. Here two sizes are in play: the course's own
    # arrays (64 bits, the default on a teacher's computer) and what libraries count and index in (32).
    # Neither is shown, as neither would be there.
    from numpy._core import arrayprint
    implied = arrayprint.dtype_is_implied
    arrayprint.dtype_is_implied = lambda dtype: np.dtype(dtype) == np.int64 or implied(dtype)
    randint = np.random.randint
    np.random.randint = lambda *a, **k: randint(*a, **({"dtype": np.int64} | k))


def prepare(names):
    """Settle a library the first time a cell brings it in, before the cell's own code touches it. Each is
    imported here: on a slow machine the first import of pandas takes longer than a cell is allowed, and that
    time is the library's, not the cell's."""
    for name in names:
        if name in _prepared:
            continue
        _prepared.add(name)
        module = {"scikit-learn": "sklearn", "pillow": "PIL", "python-dateutil": "dateutil"}.get(name, name.replace("-", "_"))
        try:
            lib = __import__(module)
        except Exception:
            continue  # the cell's own import will say what is wrong, where the student would see it
        if name == "numpy":
            _widen(lib)
        elif name == "pandas":
            lib.set_option("display.max_columns", 20)  # as a notebook shows a table
        elif name == "matplotlib":
            import matplotlib.pyplot


def _figures(max_figs, dpi):
    figs, dropped = [], 0
    plt = sys.modules.get("matplotlib.pyplot")
    if plt is None:
        return figs, dropped
    for num in list(plt.get_fignums()):
        fig = plt.figure(num)
        try:
            if len(figs) >= max_figs:
                dropped += 1
                continue
            png = io.BytesIO()
            # Twice a screen's dots: a figure is shown at a page's width and printed, where one dot a pixel is soft.
            fig.savefig(png, format="png", dpi=dpi or 200, metadata={"Software": None})
            w, h = fig.get_size_inches()
            figs.append({"png": png.getvalue(), "width_in": float(w), "height_in": float(h)})
        except Exception as e:  # a broken figure must not lose what the cell printed
            figs.append({"png": b"", "error": f"{type(e).__name__}: {e}"})
        finally:
            plt.close(fig)
    # Closed figures are reference cycles: left alone the heap grows with every figure. One collection in ten
    # keeps it flat for a few milliseconds a figure.
    global _figs_since_gc
    _figs_since_gc += len(figs) + dropped
    if _figs_since_gc >= 10:
        gc.collect()
        _figs_since_gc = 0
    return figs, dropped


def _failure(e, fname):
    line = e.lineno if isinstance(e, SyntaxError) and e.filename == fname else None
    tb = e.__traceback__
    while tb is not None:
        if tb.tb_frame.f_code.co_filename == fname:
            line = tb.tb_lineno
        tb = tb.tb_next
    tb = e.__traceback__
    while tb is not None and tb.tb_frame.f_code.co_filename != fname:
        tb = tb.tb_next  # the driver's own frames are not the course's business
    text = "".join(traceback.format_exception(type(e), e, tb))
    return {"type": type(e).__name__, "message": str(e)[:4000], "line": line, "traceback": text[-20000:]}


def run_cell(code, max_out=200000, max_figs=6, dpi=None, stdin=""):
    global _count
    _count += 1
    fname = f"<cell {_count}>"
    out, err = _Capped(max_out), _Capped(max_out)
    res = {"stdout": "", "stderr": "", "value": None, "error": None, "figures": [], "figures_dropped": 0}
    linecache.cache[fname] = (len(code), None, code.splitlines(True), fname)
    old = sys.stdout, sys.stderr, sys.stdin
    sys.stdout, sys.stderr, sys.stdin = out, err, io.StringIO(stdin)
    t0 = time.perf_counter()
    try:
        tree = ast.parse(code, fname)
        last = tree.body.pop() if tree.body and isinstance(tree.body[-1], ast.Expr) else None
        exec(compile(tree, fname, "exec"), _ns)
        if last is not None:
            v = eval(compile(ast.Expression(last.value), fname, "eval"), _ns)
            if v is not None:
                res["value"] = repr(v)[:max_out]
                _ns["_"] = v
    except BaseException as e:  # SystemExit and KeyboardInterrupt are a cell's errors too
        res["error"] = _failure(e, fname)
    finally:
        sys.stdout, sys.stderr, sys.stdin = old
    t1 = time.perf_counter()
    try:
        res["figures"], res["figures_dropped"] = _figures(max_figs, dpi)
    except BaseException as e:
        res["figures"] = [{"png": b"", "error": f"{type(e).__name__}: {e}"}]
    res["stdout"], res["stderr"] = out.getvalue(), err.getvalue()
    res["cut"] = out.total > out.kept or err.total > err.kept
    res["exec_ms"] = (t1 - t0) * 1000
    return res


def versions():
    v = {"python": sys.version.split()[0]}
    for m in ("numpy", "pandas", "matplotlib", "scipy", "sklearn", "statsmodels", "sympy"):
        if m in sys.modules:
            v[m] = getattr(sys.modules[m], "__version__", "?")
    return v
`;
