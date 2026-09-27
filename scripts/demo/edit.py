"""Cut the demo: remap time by the recorded speed marks, lay sound effects on the
recorded events, add the music, and encode."""
import bisect, json, os, subprocess, sys
import numpy as np
from scipy.io import wavfile
import sfx

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get('DEMO_DIR', os.path.join(HERE, '../../apps/web/live-results/demo'))
FFMPEG = __import__('imageio_ffmpeg').get_ffmpeg_exe()
FPS = 30
d = json.load(open(f'{OUT}/rec/timeline.json'))
frames, events = d['frames'], d['events']
t0 = next(e['t'] for e in events if e['type'] == 'start')
end = next(e['t'] for e in events if e['type'] == 'end') - t0
fts = [f['t'] - t0 for f in frames]

# Speed: each mark sets the rate until the next one.
# Waiting on the AI plays faster than it was recorded; the export at the end a little faster too.
REMAP = {5: 10, 14: 20, 10: 16}
marks = sorted((e['t'] - t0, REMAP.get(e['data']['factor'], e['data']['factor'])) for e in events if e['type'] == 'speed')
last_chime = max(e['t'] - t0 for e in events if e['type'] == 'chime')
swell_at = next(e['t'] - t0 for e in events if e['type'] == 'swell')
marks = sorted(marks + [(last_chime + 1.2, 1.35), (swell_at - 0.6, 1.0)])
def speed(s):
    i = bisect.bisect_right([m[0] for m in marks], s) - 1
    return marks[i][1] if i >= 0 else 1.0

# Walk the source at the output frame rate.
src, out_frames, src_at_out = 0.0, [], []
while src < end:
    i = max(0, bisect.bisect_right(fts, src) - 1)
    out_frames.append(i); src_at_out.append(src)
    src += speed(src) / FPS
duration = len(out_frames) / FPS
def to_out(s):
    return bisect.bisect_left(src_at_out, s) / FPS
print(f'output {duration:.1f}s from {end:.1f}s of recording, {len(frames)} frames')

# Video: runs of the same frame become one entry in a concat list.
with open(f'{OUT}/list.txt', 'w') as fh:
    k = 0
    while k < len(out_frames):
        j = k
        while j + 1 < len(out_frames) and out_frames[j + 1] == out_frames[k]: j += 1
        fh.write(f"file '{frames[out_frames[k]]['file']}'\nduration {(j - k + 1) / FPS:.6f}\n")
        k = j + 1
    fh.write(f"file '{frames[out_frames[-1]]['file']}'\n")
bg = '0xF2EFE7'
vf = (f'fps={FPS},scale=1920:1200:flags=lanczos,unsharp=5:5:0.35,'
      f'fade=t=in:st=0:d=0.5:color={bg},fade=t=out:st={duration - 0.8:.2f}:d=0.8:color={bg},format=yuv420p')
subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', f'{OUT}/list.txt', '-vf', vf,
                '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-t', f'{duration:.3f}', f'{OUT}/video.mp4'], check=True)

# Sound effects on the events.
SR = sfx.SR
fx = np.zeros(int((duration + 3) * SR))
def put(x, at, gain=1.0):
    i = int(max(0, at) * SR); j = min(len(fx), i + len(x)); fx[i:j] += gain * x[: j - i]
keys = 0
for e in events:
    s = e['t'] - t0; o = to_out(s); kind = e['type']
    if kind == 'click': put(sfx.click(), o, 0.8)
    elif kind == 'key':
        keys += 1
        # One key sound in three: every keystroke at this speed blurs into a hiss.
        if keys % 3 == 0 and speed(s) < 2: put(sfx.key(), o, 0.32)
    elif kind == 'whoosh': put(sfx.whoosh(), o - 0.3, 0.55)
    elif kind == 'pop': put(sfx.pop(), o, 0.6)
    elif kind == 'chime': put(sfx.chime(), o, 0.8)
    elif kind == 'swell': put(sfx.swell(), o - 0.2, 0.7)
    elif kind == 'speed' and e['data']['factor'] >= 4: put(sfx.whoosh(0.9, True), o - 0.1, 0.35)

subprocess.run([sys.executable, f'{HERE}/music.py', f'{duration:.2f}', f'{OUT}/music.wav'], check=True)
_, music = wavfile.read(f'{OUT}/music.wav')
music = music.astype(np.float64) / 32767
n = len(music)
fxs = np.stack([fx[:n], fx[:n]], axis=1)
# The music sits under the interface sounds, a little lower while a chime rings.
mix = 0.42 * music + 0.9 * fxs
wavfile.write(f'{OUT}/mix.wav', SR, (np.clip(mix, -1, 1) * 32767).astype(np.int16))
subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-i', f'{OUT}/video.mp4', '-i', f'{OUT}/mix.wav',
                '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
                '-shortest', '-movflags', '+faststart', f'{OUT}/folio-demo.mp4'], check=True)
print('wrote', f'{OUT}/folio-demo.mp4')
