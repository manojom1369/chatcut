"""
render_kinetic.py — renders the 9:16 vertical lyric template to MP4.

    python src/render_kinetic.py --out output/manasa-9x16-lyric-teaser.mp4 \
                                 --audio output/manasa-9x16-guide.wav [--preview] [--frames N]

Pipeline per frame
  1. procedural plate for the active section (half-res sky/bokeh/leak + vignette + scrim, upscaled)
  2. full-res atmosphere (dust / rain / petals)
  3. beat pulse (background gain)
  4. typography: glow -> shadow -> transliteration -> Telugu line -> keyword (gold, scaled)
  5. film grain

Text placement honours the master prompt's 9:16 rules: the faces' prime zone (12%–62% of
frame height) is left completely clear, lyrics sit below the eye line and above the platform
UI dead zone, and nothing is ever drawn over a character's eyes or mouth.
"""

from __future__ import annotations

import argparse
import math
import os
import subprocess
import sys
import time

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from backdrops import BW, BH, Backdrop, grain_bank, upscale_half  # noqa: E402
from kinetic_text import Font, Line, composite, layout  # noqa: E402
from show_config import (BEAT, CARDS, END, FPS, HEIGHT, LATIN_CENTER, LYRIC_CENTER,  # noqa: E402
                         SECTIONS, SHOW, TITLE, TOTAL_FRAMES, WIDTH, Card)

FONT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "fonts")


def ease_out_cubic(x: float) -> float:
    x = min(max(x, 0.0), 1.0)
    return 1.0 - (1.0 - x) ** 3


def ease_in_out(x: float) -> float:
    x = min(max(x, 0.0), 1.0)
    return x * x * (3 - 2 * x)


def clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return min(max(x, lo), hi)


# --------------------------------------------------------------------------------------
# A single lyric card rendered as a set of animatable layers
# --------------------------------------------------------------------------------------
class CardLayer:
    """Pre-computes the type for one card and animates it frame by frame."""

    IN_FRAMES = 13
    OUT_FRAMES = 12

    def __init__(self, card: Card, telugu_fonts: dict[int, Font], latin_fonts: dict[int, Font]):
        self.card = card
        self.s = SECTIONS[card.section]

        tf = telugu_fonts[card.size]
        self.telugu: Line = layout(card.telugu, tf, tracking=0.6)
        self.latin: Line | None = (
            layout(card.latin, latin_fonts[28], tracking=1.2) if card.latin else None
        )
        self.note: Line | None = None
        if card.kwargs.get("note"):
            self.note = layout(card.kwargs["note"], latin_fonts[24], tracking=0.9)

        # glyph -> word index (for word-staggered reveals)
        words = self.telugu.word_ranges()
        gw = np.zeros(len(self.telugu.glyphs), dtype=np.int32)
        for wi, (a, b) in enumerate(words):
            gw[a:b] = wi
        self.glyph_word = gw
        self.n_words = max(len(words), 1)

        # keyword glyph mask (kept out of the base layer so it can scale & colour separately)
        self.kw_idx = np.zeros(len(self.telugu.glyphs), dtype=bool)
        if card.keyword and card.keyword in card.telugu:
            i0 = card.telugu.index(card.keyword)
            self.kw_idx[self.telugu.glyph_indices_for_chars(i0, i0 + len(card.keyword))] = True
        self.base_vis0 = np.where(self.kw_idx, 0.0, 1.0).astype(np.float32)

        # colour ramps
        self.base_color = np.array(self.s["text"], dtype=np.float32)
        self.kw_color = np.array(self.s["keyword"], dtype=np.float32)

        # static glow + shadow tiles (built once from the full line)
        full = self.telugu.render(color=(255, 255, 255, 255))
        mask = full[..., 3].astype(np.float32)
        self.glow_tile = self._glow(mask, self.s["glow"], 11, 0.55)
        self.bloom_tile = self._glow(mask, self.s["glow"], 34, 0.34)
        self.shadow_tile = self._glow(mask, (0, 0, 0), 9, 0.85)

    # -- helpers -----------------------------------------------------------------------
    @staticmethod
    def _glow(mask: np.ndarray, color, radius: int, alpha: float) -> np.ndarray:
        from kinetic_text import blur_alpha_fill

        b = blur_alpha_fill(mask, radius)
        m = np.clip(b, 0, 255) * alpha
        out = np.zeros((*m.shape, 4), dtype=np.uint8)
        out[..., 0], out[..., 1], out[..., 2] = color
        out[..., 3] = np.clip(m, 0, 255).astype(np.uint8)
        return out

    @staticmethod
    def _gradient(colors, h: int) -> np.ndarray:
        top, bot = np.array(colors[0], float), np.array(colors[1], float)
        t = np.linspace(0.0, 1.0, h, dtype=np.float32)[:, None]
        rgb = top[None, :] * (1 - t) + bot[None, :] * t
        return np.concatenate([rgb, np.full((h, 1), 255.0, np.float32)], axis=1)

    def _anim(self, f: int) -> tuple[np.ndarray, np.ndarray, float]:
        """-> (per-glyph visibility, per-glyph (dx,dy) offsets, line opacity)"""
        n = len(self.telugu.glyphs)
        vis = np.ones(n, dtype=np.float32)
        offs = np.zeros((n, 2), dtype=np.float32)
        kind = self.card.anim
        D = self.IN_FRAMES

        if kind == "rise":
            per_word = 4.0
            for wi in range(self.n_words):
                p = clamp((f - wi * per_word) / D)
                e = ease_out_cubic(p)
                m = self.glyph_word == wi
                vis[m] = e
                offs[m, 1] = (1 - e) * 44
        elif kind == "stagger":
            for gi in range(n):
                p = clamp((f - gi * 1.7) / 10.0)
                e = ease_out_cubic(p)
                vis[gi] = e
                offs[gi, 1] = (1 - e) * 24
        elif kind == "wipe":
            p = clamp((f - 1) / 15.0)
            width = max(self.telugu.width, 1.0)
            for gi, g in enumerate(self.telugu.glyphs):
                x = (g.x - self.telugu.left) / width
                vis[gi] = clamp((p - x) / 0.14)
        elif kind == "pop":
            p = ease_out_cubic(clamp(f / D))
            vis[:] = p
            offs[:, 1] = (1 - p) * 20
        elif kind == "title":
            p = ease_out_cubic(clamp(f / 20.0))
            vis[:] = p
        else:
            vis[:] = clamp(f / D)

        # tail: everything drifts up and fades in the last frames
        total = self.card.frames
        o = 1.0
        if f > total - self.OUT_FRAMES:
            q = clamp((f - (total - self.OUT_FRAMES)) / self.OUT_FRAMES)
            qe = ease_in_out(q)
            o = 1.0 - qe
            offs[:, 1] -= qe * 22
            vis *= (1.0 - 0.15 * qe)
        return vis, offs, o

    # -- per-frame draw ----------------------------------------------------------------
    def draw(self, frame: np.ndarray, f: int, pulse: float) -> None:
        vis, offs, opacity = self._anim(f)
        if opacity <= 0.004:
            return

        W = frame.shape[1]
        # glow / shadow follow the line's own drift so they never detach
        ldy = float(np.mean(offs[:, 1])) if len(offs) else 0.0
        gw = self.glow_tile.shape[1] // 2
        gh = self.glow_tile.shape[0] // 2
        gx = W // 2 - gw
        gy = int(LYRIC_CENTER * HEIGHT - gh)
        composite(frame, self.bloom_tile, gx, gy + ldy, opacity * (0.75 + 0.9 * pulse))
        composite(frame, self.shadow_tile, gx, gy + 7 + ldy, opacity * 0.85)
        composite(frame, self.glow_tile, gx, gy + ldy, opacity * (0.8 + 0.9 * pulse))

        # transliteration
        if self.latin is not None:
            lp = ease_out_cubic(clamp((f - (16 if self.card.anim == "title" else 6)) / 14.0))
            if lp > 0.004:
                tile = self.latin.render(
                    color=(*[int(c) for c in self.s["latin"]], int(230 * lp))
                )
                composite(frame, tile, W // 2 - tile.shape[1] // 2,
                          int(LATIN_CENTER * HEIGHT - tile.shape[0] // 2), opacity * lp)
        if self.note is not None:
            # the slate line sits *above* the title on the title card, clear of the platform
            # dead zone at 75% and clear of the transliteration below
            np_ = ease_out_cubic(clamp((f - 24) / 16.0))
            if np_ > 0.004:
                tile = self.note.render(color=(*[int(c) for c in self.s["latin"]], int(150 * np_)))
                composite(frame, tile, W // 2 - tile.shape[1] // 2,
                          int((LYRIC_CENTER - 0.082) * HEIGHT - tile.shape[0] // 2), opacity * np_)

        # Telugu base line (keyword glyphs hidden so the gold layer can own them)
        base_vis = vis * self.base_vis0
        if base_vis.max() > 0.004:
            tile = self.telugu.render(visible=base_vis, offsets=offs, gradient=self.base_color)
            composite(frame, tile, W // 2 - tile.shape[1] // 2,
                      int(LYRIC_CENTER * HEIGHT - tile.shape[0] // 2), opacity)

        # keyword layer: gold, with its own punch-in on the beat
        if self.kw_idx.any():
            kw_vis = np.where(self.kw_idx, vis, 0.0).astype(np.float32)
            q = clamp((f - (self.IN_FRAMES - 3)) / 11.0)
            s = 1.0 + 0.085 * math.sin(math.pi * q)
            tile = self.telugu.render(
                visible=kw_vis, offsets=offs, scale=s, pad=24, gradient=self.kw_color
            )
            composite(frame, tile, W // 2 - tile.shape[1] // 2,
                      int(LYRIC_CENTER * HEIGHT - tile.shape[0] // 2), opacity)


# --------------------------------------------------------------------------------------
# Timeline
# --------------------------------------------------------------------------------------
class FootagePlate:
    """
    A still supplied as stand-in footage for a section, treated like reframed 8K material:
    cover-cropped to 1080x1920, graded with the section scrim/vignette, then given a slow
    Ken Burns push so the composition motion of a real reframe is visible.

    The crop is resampled to exactly (HEIGHT, WIDTH) every frame — returning a larger buffer
    here corrupts the downstream composite (text would be laid out for a different frame size).
    In a real job this class is replaced by a decoder that returns the reframed frame; the
    typography, timing and rules downstream do not change.
    """

    def __init__(self, path: str, section: dict, oversample: float = 1.14):
        from PIL import Image

        from backdrops import text_scrim, vignette_mask

        im = Image.open(path).convert("RGB")
        tw, th = int(WIDTH * oversample), int(HEIGHT * oversample)
        scale = max(tw / im.width, th / im.height)
        nw, nh = int(round(im.width * scale)), int(round(im.height * scale))
        im = im.resize((nw, nh), Image.LANCZOS)
        left = (nw - tw) // 2
        top = int((nh - th) * 0.17)          # bias to the upper third, where faces live
        self.base = np.asarray(im.crop((left, top, left + tw, top + th)), dtype=np.uint8)
        self.tw, self.th = tw, th

        # grade as full-res multipliers, applied once per frame instead of blending a second image
        self.mult = vignette_mask(section["vignette"], WIDTH, HEIGHT) * (
            1.0 - text_scrim(0.62, 0.19, section["scrim"] * 1.5, HEIGHT)
        )

    def frame(self, t: float, push: float) -> np.ndarray:
        """push in [0,1] takes the crop from the base framing to the tight end of the move."""
        from PIL import Image

        zoom = 1.0 + push * 0.055
        h = max(2, int(self.th / zoom))
        w = max(2, int(self.tw / zoom))
        x0 = (self.tw - w) // 2 + int(math.sin(t * 0.7) * (self.tw - w) * 0.25)
        y0 = (self.th - h) // 2 - int((self.th - h) * 0.45)   # keep headroom, push toward the eyes
        x0 = max(0, min(self.tw - w, x0))
        y0 = max(0, min(self.th - h, y0))
        crop = self.base[y0 : y0 + h, x0 : x0 + w]
        img = np.asarray(
            Image.fromarray(crop).resize((WIDTH, HEIGHT), Image.BILINEAR), dtype=np.float32
        )
        img *= self.mult
        return img


class Show:
    def __init__(self, plates: dict[str, str] | None = None):
        self.plates = {k: FootagePlate(p, SECTIONS[k]) for k, p in (plates or {}).items()}
        sizes = sorted({c.size for c in SHOW})
        self.telugu_fonts = {
            s: Font(os.path.join(FONT_DIR, "noto-sans-telugu-telugu-700-Bold.ttf"), s)
            for s in sizes
        }
        self.latin_fonts = {
            s: Font(os.path.join(FONT_DIR, "inter-latin-600-SemiBold.ttf"), s) for s in (24, 28)
        }
        self.backdrops = {k: Backdrop(k, v) for k, v in SECTIONS.items()}
        self.cards = [CardLayer(c, self.telugu_fonts, self.latin_fonts) for c in SHOW]
        # one large noise field, cropped with a moving window so grain never visibly repeats
        hw, hh = WIDTH // 2, HEIGHT // 2
        self.grain = np.random.default_rng(4).normal(0.0, 1.0, (HEIGHT * 2, WIDTH * 2)).astype(np.float32)
        self.hw, self.hh = hw, hh
        self.frame_index = 0

    def grain_window(self, f: int, h: int, w: int) -> np.ndarray:
        """A moving window of the noise field, sized to whatever the frame needs."""
        H, W = self.grain.shape
        gy = (f * 5) % (H - h) if H > h else 0
        gx = (f * 11) % (W - w) if W > w else 0
        return self.grain[gy : gy + h, gx : gx + w]

    # -- section / time helpers --------------------------------------------------------
    @staticmethod
    def card_at(frame: int) -> tuple[Card, int] | None:
        for c in SHOW:
            if c.start_frame <= frame < c.end_frame:
                return c, frame - c.start_frame
        return None

    def section_blend(self, frame: int) -> tuple[str, str, float]:
        """(section_a, section_b, mix) — gives a short crossfade at section changes."""
        cur = self.card_at(frame)
        prev = self.card_at(frame - 1)
        if cur is None or prev is None or cur[0].section == prev[0].section:
            key = (cur or prev)[0].section
            return key, key, 0.0
        # on a section boundary: 10-frame crossfade into the new plate
        a, b = prev[0].section, cur[0].section
        bl = clamp(cur[1] / 10.0)
        return a, b, ease_in_out(bl)

    def frame(self, f: int) -> np.ndarray:
        t = f / FPS
        beat_frac = (t / BEAT) % 1.0
        pulse = math.exp(-beat_frac * 7.0)          # kick-driven gain, used on plates and glow

        sa, sb, mix = self.section_blend(f)

        if self.plates and (sa in self.plates or sb in self.plates):
            key = sb if sb in self.plates else sa
            active0 = self.card_at(f)
            push = 0.0
            if active0 is not None:
                push = clamp(active0[1] / max(active0[0].frames - 1, 1))
            img = self.plates[key].frame(t, push)
            self.backdrops[key].particles_only(img, t)
            if mix > 0 and sa != sb:
                # brief light-leak wipe on the section change, same language as the plate render
                col = np.array(self.backdrops[sb].s["leak"], dtype=np.float32)
                img += (mix * (1 - mix) * 0.75) * col[None, None, :]
            active = self.card_at(f)
            if active is not None and self.cards:
                self.cards[SHOW.index(active[0])].draw(img, active[1], pulse)
            ih, iw = img.shape[:2]
            img += self.grain_window(f, ih, iw)[:, :, None] * 2.6
            return img

        ha = self.backdrops[sa].half(t)
        if mix > 0:
            hb_ = self.backdrops[sb].half(t)
            plate = ha * (1 - mix) + hb_ * mix
            leak = mix * (1 - mix) * 1.6             # light-leak wipe across the cut
        else:
            plate = ha
            leak = 0.0

        # grain and beat pulse are applied at half resolution: same look, a quarter of the work
        gy = (f * 5) % self.hh
        gx = (f * 11) % self.hw
        plate += self.grain_window(f, self.hh, self.hw)[:, :, None] * 4.6
        plate *= 1.0 + 0.030 * pulse

        img = upscale_half(plate)
        self.backdrops[sb].particles_only(img, t)

        active = self.card_at(f)
        if active is not None and self.cards:
            card, local = active
            self.cards[SHOW.index(card)].draw(img, local, pulse)

        if leak:
            col = np.array(self.backdrops[sb].s["leak"], dtype=np.float32)
            img += leak * col[None, None, :] * 0.55
        return img


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="output/manasa-9x16-lyric-teaser.mp4")
    ap.add_argument("--audio", default=None)
    ap.add_argument("--preview", action="store_true", help="fast, half-size render")
    ap.add_argument("--frames", type=int, default=0, help="render only the first N frames")
    ap.add_argument("--crf", type=int, default=17)
    ap.add_argument("--plates", default="", help='section=image pairs, e.g. "A=docs/images/plate-amber.jpg,C=..."')
    ap.add_argument("--no-text", action="store_true", help="export the clean reframed version (no typography)")
    args = ap.parse_args()

    import imageio_ffmpeg

    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    total = args.frames or TOTAL_FRAMES

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    cmd = [ffmpeg, "-y", "-loglevel", "error",
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{WIDTH}x{HEIGHT}", "-r", str(FPS), "-i", "-"]
    if args.audio:
        cmd += ["-i", args.audio, "-c:a", "aac", "-b:a", "320k", "-shortest"]
    cmd += ["-c:v", "libx264", "-preset", "medium", "-crf", str(args.crf),
            "-pix_fmt", "yuv420p", "-profile:v", "high", "-level", "4.1",
            "-movflags", "+faststart", "-color_primaries", "bt709", "-color_trc", "bt709",
            "-colorspace", "bt709", args.out]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)

    plates: dict[str, str] = {}
    for pair in filter(None, args.plates.split(",")):
        sec, _, path = pair.partition("=")
        plates[sec.strip()] = path.strip()
    show = Show(plates=plates)
    if args.no_text:
        show.cards = []          # clean plate export: composition and grade only
    t0 = time.time()
    for f in range(total):
        img = show.frame(f)
        proc.stdin.write(np.clip(img, 0, 255).astype(np.uint8).tobytes())
        if f % 60 == 0:
            el = time.time() - t0
            rate = (f + 1) / max(el, 1e-6)
            print(f"  frame {f}/{total}  {rate:5.1f} fps  eta {max(total - f, 0) / max(rate, 1e-6):5.0f}s", flush=True)
    proc.stdin.close()
    proc.wait()
    print(f"done -> {args.out}  ({total} frames, {time.time() - t0:.1f}s)")


if __name__ == "__main__":
    main()
