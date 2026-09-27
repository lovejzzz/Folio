"""Small, soft interface sounds, synthesised: click, key, whoosh, chime, pop, swell."""
import numpy as np
from scipy.signal import butter, sosfilt
SR = 48000
rng = np.random.default_rng(11)
def lp(x, f): return sosfilt(butter(2, f, 'low', fs=SR, output='sos'), x)
def hp(x, f): return sosfilt(butter(2, f, 'high', fs=SR, output='sos'), x)
def bp(x, lo, hi): return sosfilt(butter(2, [lo, hi], 'band', fs=SR, output='sos'), x)
def t_(d): return np.arange(int(d * SR)) / SR

def click():
    t = t_(0.06)
    body = np.sin(2 * np.pi * 1800 * t) * np.exp(-t * 180)
    tick = bp(rng.standard_normal(len(t)), 2500, 7000) * np.exp(-t * 400)
    return 0.35 * body + 0.25 * tick

def key():
    t = t_(0.045)
    f = rng.uniform(900, 1300)
    x = bp(rng.standard_normal(len(t)), 1200, 3200) * np.exp(-t * 320) * 0.45
    x += np.sin(2 * np.pi * f * t) * np.exp(-t * 300) * 0.15
    return x * rng.uniform(0.6, 1.0)

def whoosh(d=0.7, up=True):
    t = t_(d); n = len(t)
    noise = rng.standard_normal(n)
    # Sweep a band through the noise.
    out = np.zeros(n); step = 1200
    for i in range(0, n, step):
        frac = i / n if up else 1 - i / n
        c = 300 + 3500 * frac
        seg = bp(noise[max(0, i - 2000): i + step], c * 0.6, c * 1.4)[-min(step, n - i):]
        out[i:i + len(seg)] = seg
    env = np.sin(np.pi * np.linspace(0, 1, n)) ** 2
    return 0.35 * out * env

def chime():
    t = t_(1.8)
    x = np.zeros(len(t))
    for f, a, dec in ((1318.5, 0.5, 2.2), (1975.5, 0.3, 3.0), (2637.0, 0.15, 4.5), (987.8, 0.35, 1.8)):
        x += a * np.sin(2 * np.pi * f * t) * np.exp(-t * dec)
    x2 = np.zeros(len(t)); k = int(0.11 * SR)
    t2 = t[: len(t) - k]
    for f, a, dec in ((1760.0, 0.45, 2.4), (2637.0, 0.2, 3.5)):
        x2[k:] += a * np.sin(2 * np.pi * f * t2) * np.exp(-t2 * dec)
    return 0.22 * (x + x2) * np.minimum(1, t / 0.003)

def pop():
    t = t_(0.12)
    f = 500 + 900 * np.exp(-t * 40)
    return 0.3 * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 35)

def swell(d=1.6):
    t = t_(d); n = len(t)
    x = sum(np.sin(2 * np.pi * f * t) for f in (293.7, 440.0, 587.3, 739.99)) / 4
    x = lp(x + 0.2 * rng.standard_normal(n) * 0.05, 2500)
    env = (np.linspace(0, 1, n) ** 2) * np.exp(-np.maximum(0, t - d * 0.85) * 20)
    return 0.3 * x * env

SOUNDS = {'click': click, 'key': key, 'whoosh': whoosh, 'whoosh_down': lambda: whoosh(0.6, False), 'chime': chime, 'pop': pop, 'swell': swell}
