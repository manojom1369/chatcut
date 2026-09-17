"""
backdrops.py — procedural cinematic plates for the 9:16 lyric template.

These are *placeholder plates*. In a real job they are replaced by reframed 8K footage; the
point of generating them here is to prove the composition rules: the upper two-thirds stay
clean for the hero/heroine's faces, the lyric band sits below the eye line, and the grade
matches the section palette. Everything is deterministic (seeded) so renders are repeatable.

Each backdrop renders at 1/2 resolution and is upscaled — which is both fast and correct for
defocused footage.
"""

from __future__ import annotations

import math

import numpy as np

from show_config import HEIGHT, WIDTH

BW, BH = WIDTH // 2, HEIGHT // 2          # backdrop working resolution
BQ_W, BQ_H = WIDTH // 4, HEIGHT // 4      # bokeh working resolution (cached, interpolated)


def _vgrad(top: tuple[int, int, int], bottom: tuple[int, int, int], h: int = BH, w: int = BW) -> np.ndarray:
    t = np.linspace(0.0, 1.0, h, dtype=np.float32)[:, None]
    out = np.zeros((h, w, 3), dtype=np.float32)
    for c in range(3):
        out[..., c] = (top[c] * (1 - t) + bottom[c] * t)
    return out


def _sky(section: dict, t: float) -> np.ndarray:
    """
    Multi-stop vertical sky, plus a 'floor' falloff that darkens the lower band.

    The floor is doing real work: in a 9:16 frame the lyric band sits in the bottom third, and
    a dark, slightly cool base under the type buys contrast without a hard scrim - the same
    trick as lighting a stage floor so the performer reads against it.
    """
    stops = section["sky"]
    n = len(stops)
    ys = np.linspace(0.0, 1.0, BH, dtype=np.float32)
    out = np.zeros((BH, BW, 3), dtype=np.float32)
    pos = np.linspace(0.0, 1.0, n)
    pos = pos + np.sin((pos * math.pi) + t * 0.35) * 0.02 * (pos > 0.3)
    for c in range(3):
        out[..., c] = np.interp(ys, pos, [s[c] for s in stops])[:, None]

    floor = np.clip((ys - 0.42) / 0.58, 0.0, 1.0) ** 1.25
    factor = 1.0 - 0.46 * floor
    vig_top = 1.0 - 0.20 * np.clip((0.16 - ys) / 0.16, 0.0, 1.0) ** 1.2
    out *= (factor * vig_top)[:, None, None]
    return out


def _bokeh(section: dict, t: float, seed_arr: np.ndarray, res: tuple[int, int] | None = None) -> np.ndarray:
    """
    Additive soft bokeh discs. Precomputed blob parameters come from seed_arr
    (count, 5): x, y, radius, speed, drift.

    Rendered at `res` (default a quarter of the frame) and cached/interpolated by
    Backdrop, because the exp() falloffs are by far the most expensive part of a frame.
    """
    rw, rh = res or (BQ_W, BQ_H)
    yy, xx = np.mgrid[0:rh, 0:rw].astype(np.float32)
    acc = np.zeros((rh, rw, 3), dtype=np.float32)
    cols = section["bokeh"]
    k = rw / float(BW)
    for i, (bx, by, r, sp, dr) in enumerate(seed_arr):
        r = r * k
        x = (bx * rw + math.sin(t * 0.21 + i * 1.7) * dr * rw * 0.06) % rw
        y = (by * rh - (t * sp * 6.0) % (rh * 1.4)) % (rh * 1.4) - rh * 0.2
        d2 = ((xx - x) ** 2 + (yy - y) ** 2) / max(r * r, 1.0)
        glow = np.exp(-d2 * 1.6) + 0.55 * np.exp(-d2 * 0.35)
        col = np.array(cols[i % len(cols)], dtype=np.float32)
        acc += glow[..., None] * col[None, None, :] * (0.85 + 0.15 * math.sin(t * 1.3 + i))
    return acc * 0.24


def _light_leak(section: dict, t: float) -> np.ndarray:
    """Diagonal anamorphic-ish streak that drifts across the frame."""
    yy, xx = np.mgrid[0:BH, 0:BW].astype(np.float32)
    ang = math.radians(-19)
    u = (xx * math.cos(ang) + yy * math.sin(ang)) / BW
    centre = 0.5 + 0.30 * math.sin(t * 0.11)
    band = np.exp(-((u - centre) ** 2) / (2 * 0.10**2))
    core = np.exp(-((u - centre) ** 2) / (2 * 0.045**2))
    # a soft vertical falloff stops the streak ending in a hard edge
    fall = 1.0 - 0.55 * np.clip((yy / BH - 0.35) / 0.65, 0, 1)
    col = np.array(section["leak"], dtype=np.float32)
    strength = section["leak_strength"] * (0.7 + 0.3 * math.sin(t * 0.7))
    return (band * 0.55 + core * 0.45)[..., None] * fall[..., None] * col[None, None, :] * strength


def particle_seeds(kind: str, n: int, rng: np.random.Generator) -> np.ndarray:
    """(n, 5): x, y, size, speed, phase — deterministic per section."""
    base = np.stack(
        [
            rng.random(n),                       # x
            rng.random(n),                       # y
            rng.uniform(0.5, 1.4, n),            # size
            rng.uniform(0.5, 1.6, n),            # speed
            rng.uniform(0, math.tau, n),         # phase
        ],
        axis=1,
    )
    if kind == "rain":
        base[:, 2] = rng.uniform(0.7, 1.8, n)   # longer streaks
        base[:, 3] = rng.uniform(1.6, 3.0, n)   # faster
    return base


def draw_particles(canvas: np.ndarray, kind: str, seeds: np.ndarray, t: float, tint: tuple[int, int, int]) -> None:
    """Draw the section's atmospheric particles directly on the full-res canvas."""
    H, W = canvas.shape[:2]
    col = np.array(tint, dtype=np.float32)
    for i, (px, py, size, speed, phase) in enumerate(seeds):
        if kind == "rain":
            x = int(px * W)
            y = int(((py + t * speed * 0.35) % 1.2 - 0.1) * H)
            length = int(26 * size)
            x2, y2 = x + int(length * 0.22), y + length
            if not (0 <= x < W and 0 <= y < H):
                continue
            a = 0.16 * (0.6 + 0.4 * math.sin(t * 3 + phase))
            sl = canvas[max(y, 0) : min(y2, H), max(x, 0) : min(x + 2, W)]
            if sl.size:
                sl[:] = sl * (1 - a) + col * a
        elif kind == "dust":
            x = int(((px + math.sin(t * 0.3 + phase) * 0.02) % 1.0) * W)
            y = int(((py - t * speed * 0.012) % 1.0) * H)
            r = max(1, int(size * 2.2))
            a = 0.20 * (0.5 + 0.5 * math.sin(t * 0.9 + phase))
            _soft_dot(canvas, x, y, r, col, a)
        else:  # petals — small rotated quads
            x = int(((px + math.sin(t * 0.24 + phase) * 0.05) % 1.0) * W)
            y = int(((py + t * speed * 0.05) % 1.15 - 0.1) * H)
            s = size * 7
            a = 0.30 * (0.55 + 0.45 * math.sin(t * 1.1 + phase))
            _petal(canvas, x, y, s, phase + t * 0.5, col * 0.5 + np.array([255, 120, 170]) * 0.5, a)


def _soft_dot(canvas: np.ndarray, cx: int, cy: int, r: int, col: np.ndarray, a: float) -> None:
    H, W = canvas.shape[:2]
    x0, x1 = max(cx - r, 0), min(cx + r + 1, W)
    y0, y1 = max(cy - r, 0), min(cy + r + 1, H)
    if x1 <= x0 or y1 <= y0:
        return
    yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
    d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / max(r, 1)
    m = np.clip(1.0 - d, 0, 1) ** 1.8 * a
    canvas[y0:y1, x0:x1] = canvas[y0:y1, x0:x1] * (1 - m[..., None]) + col * m[..., None]


def _petal(canvas: np.ndarray, cx: int, cy: int, s: float, ang: float, col: np.ndarray, a: float) -> None:
    H, W = canvas.shape[:2]
    r = int(s)
    x0, x1 = max(cx - r, 0), min(cx + r + 1, W)
    y0, y1 = max(cy - r, 0), min(cy + r + 1, H)
    if x1 <= x0 or y1 <= y0:
        return
    yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
    c, sn = math.cos(ang), math.sin(ang)
    u = (xx - cx) * c + (yy - cy) * sn
    v = -(xx - cx) * sn + (yy - cy) * c
    m = np.clip(1.0 - ((u / (s * 0.55)) ** 2 + (v / (s * 0.28)) ** 2), 0, 1) ** 0.7 * a
    canvas[y0:y1, x0:x1] = canvas[y0:y1, x0:x1] * (1 - m[..., None]) + col * m[..., None]


def vignette_mask(strength: float, w: int = BW, h: int = BH) -> np.ndarray:
    """Multiplicative vignette at (h, w, 3)."""
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    nx = (xx / w - 0.5) * 2.0
    ny = (yy / h - 0.5) * 2.0
    r = np.sqrt((nx * 0.85) ** 2 + (ny * 0.62) ** 2)
    v = np.clip(1.0 - strength * np.clip(r - 0.35, 0, None) ** 1.6, 0, 1)
    return np.repeat(v[..., None], 3, axis=2)


def text_scrim(centre: float, band: float = 0.16, strength: float = 0.30, h: int = BH) -> np.ndarray:
    """Soft gradient scrim behind the lyric band (never a hard box)."""
    ys = np.linspace(0.0, 1.0, h, dtype=np.float32)
    d = np.abs(ys - centre) / band
    m = np.clip(1.0 - d**2, 0, 1) ** 1.4 * strength
    return np.repeat(m[:, None, None], 3, axis=2)


def grain_bank(n: int = 8, seed: int = 7) -> np.ndarray:
    """A small bank of film-grain tiles, cycled per frame (cheap, no per-frame RNG)."""
    rng = np.random.default_rng(seed)
    return rng.normal(0.0, 1.0, (n, HEIGHT // 2, WIDTH // 2)).astype(np.float32)


def up2(a: np.ndarray) -> np.ndarray:
    """Fast exact 2x bilinear upscale (numpy slicing; wraps by one pixel at the edges)."""
    out = np.empty((a.shape[0] * 2, a.shape[1] * 2, a.shape[2]), dtype=np.float32)
    r0 = (a + np.roll(a, -1, axis=0)) * 0.5
    c0 = (a + np.roll(a, -1, axis=1)) * 0.5
    rc = (r0 + np.roll(r0, -1, axis=1)) * 0.5
    out[0::2, 0::2] = a
    out[1::2, 0::2] = r0
    out[0::2, 1::2] = c0
    out[1::2, 1::2] = rc
    return out


def upscale_half(img: np.ndarray) -> np.ndarray:
    """Half-res plate -> full frame."""
    return up2(np.clip(img, 0.0, 255.0).astype(np.float32))


class Backdrop:
    """Per-section procedural plate with cached statics."""

    def __init__(self, key: str, section: dict, seed: int = 11):
        self.key = key
        self.s = section
        rng = np.random.default_rng(seed)
        self.bokeh_seeds = np.stack(
            [
                rng.random(section["bokeh_count"]),
                rng.random(section["bokeh_count"]),
                rng.uniform(28, 150, section["bokeh_count"]),
                rng.uniform(0.4, 1.0, section["bokeh_count"]),
                rng.uniform(0.2, 1.0, section["bokeh_count"]),
            ],
            axis=1,
        )
        self.particles = particle_seeds(section["particles"], section["particle_count"], rng)
        self.vig = vignette_mask(section["vignette"])
        self.scrim = text_scrim(0.60, 0.17, section["scrim"])
        self.bokeh_step = 0.40               # seconds between cached bokeh fields
        self._bcache: dict[int, np.ndarray] = {}

    def _bokeh_field(self, i: int) -> np.ndarray:
        """Quarter-res bokeh field at cache slot i, kept small and reused across frames."""
        if i not in self._bcache:
            if len(self._bcache) > 3:
                self._bcache.clear()
            self._bcache[i] = _bokeh(self.s, i * self.bokeh_step, self.bokeh_seeds)
        return self._bcache[i]

    def bokeh(self, t: float) -> np.ndarray:
        q = t / self.bokeh_step
        i0 = int(q)
        frac = q - i0
        a = self._bokeh_field(i0)
        b = a if frac < 1e-4 else self._bokeh_field(i0 + 1)
        return a * (1.0 - frac) + b * frac if frac >= 1e-4 else a

    def half(self, t: float, leak_boost: float = 0.0) -> np.ndarray:
        """Half-resolution plate: sky + bokeh + leak, vignette and text scrim already applied."""
        img = _sky(self.s, t)
        img += up2(self.bokeh(t))          # quarter-res field -> half-res plate
        if leak_boost:
            img += _light_leak(self.s, t) * leak_boost
        img += _light_leak(self.s, t)
        img *= self.vig
        img *= 1.0 - self.scrim
        return img

    def particles_only(self, img: np.ndarray, t: float) -> None:
        draw_particles(img, self.s["particles"], self.particles, t, self.s["leak"])
