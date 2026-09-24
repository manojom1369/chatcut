"""Synthesize a 20 s demo track (stand-in for the real song) so the renderer
can be previewed without it. Drops are placed at the script's hardcoded drop
times 1.60 s and 16.83 s so the event system (bursts, shells, contraction)
is exercised.

Usage:  venv/bin/python visualizer/make_demo_track.py [out.mp3]
"""
import os, sys, subprocess
import numpy as np, soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
SR = 44100
DUR = 20.0


def make() -> np.ndarray:
    t = np.arange(int(SR * DUR)) / SR
    out = np.zeros_like(t)
    TWO_PI = 2 * np.pi

    def add(amp, f0, f1, t0, decay, sweep=0.12):
        tt = t - t0
        m = (tt >= 0) & (tt < decay)
        tt = tt[m]
        env = np.exp(-tt * 4.0)
        ph = f0 * tt + (f1 - f0) * np.minimum(tt, sweep) ** 2 / (2 * sweep)
        out[m] += amp * np.sin(TWO_PI * ph) * env

    def noise_burst(t0, decay, amp, lp=0.4):
        tt = t - t0; m = (tt >= 0) & (tt < decay)
        n = np.random.default_rng(int(t0 * 1000)).normal(0, 1, m.sum())
        y = np.zeros_like(n); a = lp
        for i in range(1, len(n)):
            y[i] = y[i - 1] + a * (n[i] - y[i - 1])
        out[m] += amp * y * np.exp(-tt[m] * 8)

    # kicks on the beat (120 bpm), skipped around the drop hits
    for k in np.arange(0, DUR, 0.5):
        if 1.3 < k < 1.95 or 16.4 < k < 17.0:
            continue
        add(0.55, 110, 45, k, 0.3)
    # off-beat hats
    for k in np.arange(0.25, DUR, 0.5):
        noise_burst(k, 0.08, 0.22, lp=0.5)

    def pad(chord, t0, t1, amp=0.10):
        m = (t >= t0) & (t < t1); tt = t[m]
        env = np.minimum((tt - t0) / 0.8, 1) * np.minimum((t1 - tt) / 0.8, 1)
        s = np.zeros_like(tt)
        for f in chord:
            s += np.sin(TWO_PI * f * tt + 0.3 * np.sin(TWO_PI * 0.2 * tt))
        out[m] += amp * s / len(chord) * env * (0.8 + 0.2 * np.sin(TWO_PI * 0.5 * tt))
    pad([110, 165, 220, 262], 0, 16.8)
    pad([98, 147, 220, 294], 16.8, 20)

    # mid plucks after the first drop
    rng = np.random.default_rng(7)
    for k in np.arange(2.0, 16.5, 0.125):
        f = rng.choice([660, 880, 990, 1100, 1320])
        add(0.10, f, f, k, 0.10, sweep=0.05)

    # the two drops
    for d in (1.60, 16.83):
        add(1.0, 90, 38, d, 1.4)
        add(0.8, 180, 60, d, 0.9)
        noise_burst(d, 0.5, 0.7, lp=0.3)
        for j in range(8):
            add(0.3, 60, 40, d + 0.5 * (j + 1), 0.25)

    return out / np.abs(out).max() * 0.92


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(HERE), 'audio', 'demo_track.mp3')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    wav = out.rsplit('.', 1)[0] + '.wav'
    sf.write(wav, make().astype(np.float32), SR)
    ff = os.path.join(os.path.dirname(HERE), 'venv', 'bin', 'ffmpeg')
    subprocess.run([ff, '-y', '-loglevel', 'error', '-i', wav, '-c:a', 'libmp3lame', '-b:a', '192k', out], check=True)
    print('wrote', out)
