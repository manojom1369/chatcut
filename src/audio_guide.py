"""
audio_guide.py — original royalty-free TEMP guide track for the 9:16 lyric template.

This is NOT the song. It is a synthetic 90 BPM scratch track built only so the beat-synced
typography can be verified and so the preview is not silent. The real edit must be cut to the
actual master recording ("Manasa Nuvvunde Chote" — Munna, Mani Sharma).

Everything below is generated with numpy: pad, sub, kick, hats, claps, bell and section
risers. Output: 48 kHz stereo WAV.
"""

from __future__ import annotations

import math
import wave

import numpy as np

from show_config import BEAT, TOTAL_BEATS

SR = 48000

NOTE = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}


def freq(name: str, octave: int) -> float:
    return 440.0 * 2 ** ((NOTE[name] + (octave - 4) * 12 - 9) / 12.0)


def _env(n: int, attack: float, decay: float, sr: int = SR) -> np.ndarray:
    a = max(1, int(attack * sr))
    d = max(1, int(decay * sr))
    e = np.ones(n, dtype=np.float32)
    e[: min(a, n)] = np.linspace(0, 1, min(a, n)) ** 1.5
    if d < n:
        e[-d:] = np.linspace(1, 0, d) ** 1.6
    return e


def pad(dur: float, notes: list[float], amp: float = 0.10) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n, dtype=np.float32) / SR
    out = np.zeros(n, dtype=np.float32)
    for f in notes:
        for det in (-0.0025, 0.0, 0.0025):
            fd = f * (1 + det)
            out += np.sin(2 * math.pi * fd * t) * 0.5
            out += np.sin(2 * math.pi * fd * 2 * t) * 0.16
            out += np.sin(2 * math.pi * fd * 3 * t) * 0.05
    trem = 1.0 + 0.10 * np.sin(2 * math.pi * 0.35 * t)
    return out / (len(notes) * 3) * _env(n, 0.55, 0.9) * trem * amp


def sub(dur: float, f: float, amp: float = 0.14) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n, dtype=np.float32) / SR
    return np.sin(2 * math.pi * f * t) * _env(n, 0.03, 0.35) * amp


def kick(amp: float = 0.55) -> np.ndarray:
    n = int(0.38 * SR)
    t = np.arange(n, dtype=np.float32) / SR
    f = 118 * np.exp(-t * 26) + 44
    body = np.sin(2 * math.pi * np.cumsum(f) / SR)
    click = np.exp(-t * 320) * 0.35
    return (body * np.exp(-t * 6.5) + click) * amp


def hat(amp: float = 0.09, dur: float = 0.06) -> np.ndarray:
    n = int(dur * SR)
    rng = np.random.default_rng(3)
    noise = rng.normal(0, 1, n).astype(np.float32)
    noise = np.diff(noise, prepend=0.0)          # crude high-pass
    return noise * np.exp(-np.arange(n) / (SR * 0.012)) * amp


def clap(amp: float = 0.22) -> np.ndarray:
    n = int(0.25 * SR)
    rng = np.random.default_rng(5)
    noise = rng.normal(0, 1, n).astype(np.float32)
    env = np.exp(-np.arange(n) / (SR * 0.035)) + 0.4 * np.exp(-np.arange(n) / (SR * 0.16))
    return noise * env * amp


def bell(f: float, dur: float = 0.9, amp: float = 0.075) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n, dtype=np.float32) / SR
    out = np.sin(2 * math.pi * f * t) + 0.4 * np.sin(2 * math.pi * f * 2.01 * t) + 0.16 * np.sin(2 * math.pi * f * 3.02 * t)
    return out * np.exp(-t * 4.2) * amp


def riser(dur: float, amp: float = 0.16) -> np.ndarray:
    n = int(dur * SR)
    rng = np.random.default_rng(9)
    noise = rng.normal(0, 1, n).astype(np.float32)
    # rising one-pole low-pass gives the classic sweep
    out = np.zeros(n, dtype=np.float32)
    a = 0.0
    cut = np.linspace(0.02, 0.55, n, dtype=np.float32)
    for i in range(0, n, 1):
        a += (noise[i] - a) * cut[i]
        out[i] = a
    return out * np.linspace(0, 1, n, dtype=np.float32) ** 2.2 * amp


def build(duration_s: float, chords: list[str], chords_per_bar: int = 1) -> np.ndarray:
    total = int((duration_s + 1.6) * SR)
    mix = np.zeros(total, dtype=np.float32)
    rng = np.random.default_rng(21)

    chord_notes = {
        "Am": [freq("A", 3), freq("C", 4), freq("E", 4)],
        "F": [freq("F", 3), freq("A", 3), freq("C", 4)],
        "C": [freq("C", 4), freq("E", 4), freq("G", 4)],
        "G": [freq("G", 3), freq("B", 3), freq("D", 4)],
        "Dm": [freq("D", 3), freq("F", 3), freq("A", 3)],
        "E": [freq("E", 3), freq("G#", 3), freq("B", 3)],
    }
    roots = {"Am": freq("A", 2), "F": freq("F", 2), "C": freq("C", 3), "G": freq("G", 2),
             "Dm": freq("D", 2), "E": freq("E", 2)}

    bar = BEAT * 4
    n_bars = int(math.ceil(duration_s / bar)) + 1
    pent = [freq("A", 4), freq("C", 5), freq("D", 5), freq("E", 5), freq("G", 5), freq("A", 5)]

    def add(sig: np.ndarray, at_s: float, gain: float = 1.0) -> None:
        i = int(at_s * SR)
        if i >= total:
            return
        j = min(i + len(sig), total)
        mix[i:j] += sig[: j - i] * gain

    for b in range(n_bars):
        t0 = b * bar
        chord = chords[b % len(chords)]
        notes = chord_notes[chord]
        # pad: one chord per bar, re-attacked at the halfway point for movement
        add(pad(bar * 1.05, notes, amp=0.085), t0)
        add(pad(bar * 0.55, notes, amp=0.05), t0 + bar * 0.5)
        add(sub(bar * 0.9, roots[chord], amp=0.13), t0)

        # drums
        for beat_i in range(4):
            tb = t0 + beat_i * BEAT
            if beat_i in (0, 2):
                add(kick(0.5 if beat_i == 0 else 0.38), tb)
            if beat_i in (1, 3):
                add(clap(0.16), tb)
            add(hat(0.085 if beat_i % 2 == 0 else 0.05), tb, 1.0 if beat_i % 2 == 0 else 0.7)
            add(hat(0.045), tb + BEAT / 2)

        # sparse bell melody in the chorus bars
        if b >= 9 and b % 2 == 0:
            for k, off in enumerate((0, 1.5, 2.5)):
                add(bell(pent[rng.integers(0, len(pent))], 0.8, 0.06), t0 + off * BEAT)

    # section risers at A->B, B->C, C->end
    for beat_mark in (22, 37, 65):
        add(riser(BEAT * 2), beat_mark * BEAT - BEAT * 2)
        add(clap(0.30), beat_mark * BEAT)

    # gentle feedback delay + soft limiter
    d = int(BEAT / 2 * SR)
    echo = np.zeros_like(mix)
    for k in range(1, 4):
        idx = int(k * d * 1.0)
        echo[idx:] += mix[:-idx] * (0.22**k)
    mix = mix + echo * 0.35
    mix = np.tanh(mix * 1.25) * 0.85

    # stereo width: slight haas on the tail, plus a wider pad copy
    left = mix.copy()
    right = mix.copy()
    off = int(0.012 * SR)
    right[off:] = right[off:] * 1.0 + mix[:-off] * 0.12
    left = left * 0.98 + np.roll(mix, -off) * 0.10
    right = right * 0.98
    stereo = np.stack([left, right], axis=1)
    peak = float(np.max(np.abs(stereo)) or 1.0)
    stereo = stereo / peak * 0.92
    return stereo


def write_wav(path: str, stereo: np.ndarray, sr: int = SR) -> None:
    data = np.clip(stereo, -1.0, 1.0)
    pcm = (data * 32767.0).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())


if __name__ == "__main__":
    import sys

    dur = TOTAL_BEATS * BEAT
    progression = ["Am", "F", "C", "G"]
    mix = build(dur, progression)
    out = sys.argv[1] if len(sys.argv) > 1 else "output/tests/guide.wav"
    write_wav(out, mix)
    print(f"wrote {out}  {len(mix)/SR:.2f}s")
