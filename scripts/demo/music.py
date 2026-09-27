"""A calm, warm underscore for the demo: soft electric piano, a pad, a light pulse.
D major, 92 bpm, I–V–vi–IV with a lifted bridge. Written from scratch, so no licence to worry about."""
import numpy as np, sys
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

SR = 48000
BPM = 92
BEAT = 60 / BPM
DUR = float(sys.argv[1]) if len(sys.argv) > 1 else 110.0
OUT = sys.argv[2] if len(sys.argv) > 2 else 'music.wav'
N = int(DUR * SR)
rng = np.random.default_rng(7)

def hz(midi): return 440.0 * 2 ** ((midi - 69) / 12)
def env_adsr(n, a, d, s, r, sr=SR):
    a, d, r = int(a * sr), int(d * sr), int(r * sr)
    e = np.full(n, s, dtype=np.float64)
    e[:a] = np.linspace(0, 1, a, endpoint=False) if a else e[:a]
    e[a:a + d] = np.linspace(1, s, d, endpoint=False)[: max(0, min(d, n - a))]
    if r: e[-r:] *= np.linspace(1, 0, r)
    return e
def lowpass(x, f, order=2): return sosfilt(butter(order, f, 'low', fs=SR, output='sos'), x)
def highpass(x, f, order=2): return sosfilt(butter(order, f, 'high', fs=SR, output='sos'), x)

def epiano(f, dur, vel=0.5):
    n = int(dur * SR); t = np.arange(n) / SR
    # Tine-ish: fundamental, a bright partial that dies fast, a touch of bell.
    x = np.sin(2 * np.pi * f * t) * np.exp(-t * 1.6)
    x += 0.35 * np.sin(2 * np.pi * 2 * f * t + 0.3) * np.exp(-t * 3.5)
    x += 0.12 * np.sin(2 * np.pi * 4.02 * f * t) * np.exp(-t * 9)
    x *= np.minimum(1, t / 0.004)
    x *= np.linspace(1, 0, n) ** 0.4
    return vel * x

def pad(freqs, dur):
    n = int(dur * SR); t = np.arange(n) / SR
    x = np.zeros(n)
    for f in freqs:
        for det in (-0.12, 0.0, 0.11):
            ff = f * 2 ** (det / 12)
            ph = rng.uniform(0, 2 * np.pi)
            # A softened saw: few harmonics.
            for k in range(1, 7):
                x += (1 / k) * np.sin(2 * np.pi * ff * k * t + ph * k) * 0.08
    x = lowpass(x, 1400)
    return x * env_adsr(n, 1.2, 0.5, 0.85, 1.4)

def kick(vel=0.6):
    n = int(0.35 * SR); t = np.arange(n) / SR
    f = 110 * np.exp(-t * 18) + 42
    return vel * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9)

def shaker(vel=0.15):
    n = int(0.09 * SR); t = np.arange(n) / SR
    return vel * highpass(rng.standard_normal(n), 6000) * np.exp(-t * 55)

mix_keys = np.zeros(N + SR * 4); mix_pad = np.zeros_like(mix_keys); mix_drums = np.zeros_like(mix_keys)
def put(buf, x, at):
    i = int(at * SR); j = min(len(buf), i + len(x)); buf[i:j] += x[: j - i]

# D major: D=62. Chords as (root, notes)
CH = {
  'D': [62, 66, 69], 'A': [57, 61, 64], 'Bm': [59, 62, 66], 'G': [55, 59, 62],
  'Em': [52, 55, 59], 'F#m': [54, 57, 61],
}
verse = ['D', 'A', 'Bm', 'G']
bridge = ['Em', 'G', 'D', 'A']
bar = 4 * BEAT
bars = int(DUR / bar) + 1
for b in range(bars):
    t0 = b * bar
    section = (b // 8) % 3
    name = (bridge if section == 2 else verse)[b % 4]
    notes = CH[name]
    root = notes[0] - 12 if notes[0] >= 57 else notes[0]
    put(mix_pad, pad([hz(n) for n in notes] + [hz(root - 12)], bar + 1.0), t0)
    # Piano: a gentle arpeggio, sparser in the intro.
    pattern = [0, 1, 2, 1, 2, 0, 1, 2] if b >= 2 else [0, 2, 1, 2]
    step = bar / len(pattern)
    for i, k in enumerate(pattern):
        oct_ = 12 if (i % 4 == 3) else 0
        put(mix_keys, epiano(hz(notes[k] + oct_), 1.6, 0.18 + 0.05 * (i % 2 == 0)), t0 + i * step)
    if b % 2 == 1:  # a melody note on top, from the chord
        put(mix_keys, epiano(hz(notes[2] + 12), 2.2, 0.16), t0 + 2 * BEAT)
    # Pulse from bar 4 on, eased out in the last two bars.
    if 4 <= b < bars - 2:
        for beat in range(4):
            put(mix_drums, kick(0.35 if beat % 2 == 0 else 0.22), t0 + beat * BEAT)
            put(mix_drums, shaker(0.07), t0 + beat * BEAT + BEAT / 2)

mix = 0.9 * mix_keys + 0.55 * mix_pad + 0.8 * mix_drums
# A little room: two short delays, low-passed.
for d, g in ((0.23, 0.22), (0.41, 0.14)):
    k = int(d * SR); echo = np.zeros_like(mix); echo[k:] = mix[:-k] * g; mix += lowpass(echo, 3000)
mix = mix[:N]
fade_in, fade_out = int(1.5 * SR), int(4.0 * SR)
mix[:fade_in] *= np.linspace(0, 1, fade_in); mix[-fade_out:] *= np.linspace(1, 0, fade_out) ** 1.5
mix = np.tanh(mix / np.max(np.abs(mix)) * 1.2) * 0.8
stereo = np.stack([mix, np.roll(mix, int(0.012 * SR))], axis=1)
wavfile.write(OUT, SR, (stereo * 32767).astype(np.int16))
print('wrote', OUT, DUR, 's')
