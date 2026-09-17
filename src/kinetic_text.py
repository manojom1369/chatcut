"""
kinetic_text.py — script-correct text layout + rasterisation for the ChatCut 9:16 renderer.

Pillow available in this environment is built without libraqm, so it cannot shape Indic
scripts (Telugu matras/conjuncts would be rendered in the wrong order). This module does the
shaping itself: HarfBuzz (uharfbuzz) for GSUB/GPOS shaping, FreeType (freetype-py) for
glyph rasterisation with sub-pixel positioning. The result is a per-glyph alpha mask
structure that the animation layer can reveal glyph by glyph, word by word, or as whole lines,
and tint with solid colours or vertical gradients.

Public API
----------
    Font(path, px)                    -> loaded face + shaper
    layout(text, font, tracking=0)    -> Line  (placed glyph masks, real ink bbox)
    Line.mask(color, ...)             -> np.uint8 HxWx4 RGBA
    Line.word_ranges()                -> [(glyph_i0, glyph_i1), ...]
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable, Sequence

import freetype
import numpy as np
import uharfbuzz as hb

RenderTarget = np.ndarray  # HxWx4 uint8, straight (non-premultiplied) alpha


# --------------------------------------------------------------------------------------
# Font
# --------------------------------------------------------------------------------------
class Font:
    """A single font face usable for shaping (HarfBuzz) and rasterising (FreeType)."""

    def __init__(self, path: str, px: float):
        self.path = path
        self.px = px

        self.face = freetype.Face(path)
        self.face.set_pixel_sizes(0, int(round(px)))

        blob = hb.Blob.from_file_path(path)
        self.hb_face = hb.Face(blob)
        self.hb_font = hb.Font(self.hb_face)
        upem = self.hb_face.upem
        self.hb_font.scale = (upem, upem)  # shape in font units; convert to px ourselves
        self.upem = upem
        self.scale = px / upem  # font units -> px

        self.ascender = self.face.size.ascender / 64.0
        self.descender = self.face.size.descender / 64.0
        self.height = self.face.size.height / 64.0

    # -- shaping -----------------------------------------------------------------------
    def shape(self, text: str) -> list["PlacedGlyph"]:
        buf = hb.Buffer()
        buf.add_str(text)
        buf.guess_segment_properties()
        hb.shape(self.hb_font, buf, {"kern": True, "liga": True})

        out: list[PlacedGlyph] = []
        for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
            gid = info.codepoint
            cluster = info.cluster
            self.face.load_glyph(gid, freetype.FT_LOAD_NO_HINTING | freetype.FT_LOAD_RENDER)
            bmp = self.face.glyph.bitmap
            if bmp.width and bmp.rows:
                arr = np.frombuffer(bytes(bmp.buffer), dtype=np.uint8)
                arr = arr.reshape(bmp.rows, bmp.pitch)[:, : bmp.width].copy()
            else:
                arr = np.zeros((0, 0), dtype=np.uint8)

            # x/y are offsets from this glyph's own pen position; layout() accumulates the pen.
            out.append(
                PlacedGlyph(
                    gid=gid,
                    cluster=cluster,
                    mask=arr,
                    x=float(self.face.glyph.bitmap_left + pos.x_offset * self.scale),
                    y=float(-self.face.glyph.bitmap_top - pos.y_offset * self.scale),
                    advance=pos.x_advance * self.scale,
                )
            )
        return out


@dataclass
class PlacedGlyph:
    gid: int
    cluster: int          # byte offset into the shaped string
    mask: np.ndarray      # HxW uint8 coverage
    x: float              # px, relative to pen origin (y down)
    y: float              # px, relative to baseline (top of bitmap)
    advance: float


# --------------------------------------------------------------------------------------
# Line layout
# --------------------------------------------------------------------------------------
@dataclass
class Line:
    text: str
    font: Font
    glyphs: list[PlacedGlyph] = field(default_factory=list)
    tracking: float = 0.0
    baseline: float = 0.0   # px from top of the ink box to the baseline
    top: float = 0.0        # min ink y
    bottom: float = 0.0     # max ink y
    left: float = 0.0       # min ink x
    right: float = 0.0      # max ink x

    # -- metrics -----------------------------------------------------------------------
    @property
    def width(self) -> float:
        return self.right - self.left

    @property
    def ink_height(self) -> float:
        return self.bottom - self.top

    @property
    def cap_height(self) -> float:
        """Visual height of the line's ink — used for the prompt's legibility rules."""
        return self.ink_height

    def word_ranges(self) -> list[tuple[int, int]]:
        """
        Glyph index ranges, one per whitespace-separated word.

        uharfbuzz's Buffer.add_str() sets cluster values to *character* indices (add_utf8
        would use byte offsets), which is what this mapping assumes.
        """
        ranges: list[tuple[int, int]] = []
        n = len(self.text)
        start = 0
        for gi, g in enumerate(self.glyphs):
            ci = min(g.cluster, n - 1) if n else 0
            if n and self.text[ci].isspace():
                if gi > start:
                    ranges.append((start, gi))
                start = gi + 1
        if start < len(self.glyphs):
            ranges.append((start, len(self.glyphs)))
        return ranges

    def glyph_indices_for_chars(self, i0: int, i1: int) -> list[int]:
        """Glyph indices whose clusters fall in [i0, i1) — used for keyword emphasis."""
        return [gi for gi, g in enumerate(self.glyphs) if i0 <= g.cluster < i1]

    def word_index_of_char(self, char_index: int) -> int:
        """Which word (0-based) a given character index belongs to."""
        n = len(self.text)
        ci = min(max(char_index, 0), max(n - 1, 0))
        words = self.word_ranges()
        gi = next((g for g, gl in enumerate(self.glyphs) if gl.cluster == ci), None)
        if gi is None:
            return -1
        for wi, (a, b) in enumerate(words):
            if a <= gi < b:
                return wi
        return -1

    def ink_box_for_glyphs(self, indices: Iterable[int]) -> tuple[float, float, float, float]:
        """(left, top, right, bottom) of the ink of a subset of glyphs, in line space."""
        xs0, ys0, xs1, ys1 = [], [], [], []
        for gi in indices:
            g = self.glyphs[gi]
            if g.mask.size == 0:
                continue
            xs0.append(g.x)
            ys0.append(g.y)
            xs1.append(g.x + g.mask.shape[1])
            ys1.append(g.y + g.mask.shape[0])
        if not xs0:
            return (0.0, 0.0, 0.0, 0.0)
        return (min(xs0), min(ys0), max(xs1), max(ys1))

    # -- rasterisation -----------------------------------------------------------------
    def render(
        self,
        color: Sequence[int] | np.ndarray = (255, 255, 255, 255),
        visible: np.ndarray | None = None,
        offsets: np.ndarray | None = None,
        pad: int = 6,
        scale: float = 1.0,
        scale_origin: tuple[float, float] | None = None,
        gradient: tuple[Sequence[int], Sequence[int]] | None = None,
    ) -> RenderTarget:
        """
        Composite the glyph masks into an RGBA image.

        color        : (r, g, b, a) or an (H, 4) array for a vertical gradient tint
        visible      : per-glyph alpha multiplier in [0, 1]; None means everything visible
        offsets      : (n_glyphs, 2) per-glyph (dx, dy) in px — used for word stagger / drift
        scale        : uniform scale, applied about scale_origin (line space) or the ink centre
        gradient     : (top_rgb, bottom_rgb) — built at the final tile height, so the ramp
                       always matches the ink box no matter how the glyphs are offset
        """
        n = len(self.glyphs)
        offs = np.zeros((n, 2), dtype=np.float32) if offsets is None else np.asarray(offsets, np.float32)
        vis = np.ones(n, dtype=np.float32) if visible is None else np.asarray(visible, np.float32)

        # ink bounds including offsets
        left, top, right, bot = [], [], [], []
        for gi, g in enumerate(self.glyphs):
            if g.mask.size == 0:
                continue
            left.append(g.x + offs[gi, 0])
            top.append(g.y + offs[gi, 1])
            right.append(g.x + offs[gi, 0] + g.mask.shape[1])
            bot.append(g.y + offs[gi, 1] + g.mask.shape[0])
        if not left:
            return np.zeros((pad * 2, pad * 2, 4), dtype=np.uint8)
        L, T, R, B = min(left), min(top), max(right), max(bot)
        ox, oy = ((L + R) / 2.0, (T + B) / 2.0) if scale_origin is None else scale_origin

        # ink bounds after scaling about the origin
        Ls = (L - ox) * scale + ox
        Ts = (T - oy) * scale + oy
        Rs = (R - ox) * scale + ox
        Bs = (B - oy) * scale + oy

        w = int(np.ceil(Rs - Ls)) + pad * 2
        h = int(np.ceil(Bs - Ts)) + pad * 2
        w, h = max(w, 1), max(h, 1)
        alpha = np.zeros((h, w), dtype=np.float32)

        for gi, g in enumerate(self.glyphs):
            v = float(vis[gi])
            if v <= 0.002 or g.mask.size == 0:
                continue
            m = g.mask.astype(np.float32) * v
            if scale != 1.0:
                m = _resize_alpha(m, scale)
            gx = (g.x + offs[gi, 0] - ox) * scale + ox - Ls
            gy = (g.y + offs[gi, 1] - oy) * scale + oy - Ts
            ix, iy = int(round(gx)) + pad, int(round(gy)) + pad
            mh, mw = m.shape
            x0, y0 = max(ix, 0), max(iy, 0)
            x1, y1 = min(ix + mw, w), min(iy + mh, h)
            if x1 <= x0 or y1 <= y0:
                continue
            alpha[y0:y1, x0:x1] = np.maximum(
                alpha[y0:y1, x0:x1], m[y0 - iy : y1 - iy, x0 - ix : x1 - ix]
            )

        out = np.zeros((h, w, 4), dtype=np.uint8)
        if gradient is not None:
            top, bot = np.asarray(gradient[0], np.float32), np.asarray(gradient[1], np.float32)
            t = np.linspace(0.0, 1.0, h, dtype=np.float32)[:, None]
            rgb = top[None, :] * (1 - t) + bot[None, :] * t
            out[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)[:, None, :]
            out[..., 3] = np.clip(alpha, 0, 255).astype(np.uint8)
            return out

        col = np.asarray(color, dtype=np.float32)
        if col.ndim == 2 and col.shape[0] == h:
            out[..., 0] = col[:, 0:1].astype(np.uint8)
            out[..., 1] = col[:, 1:2].astype(np.uint8)
            out[..., 2] = col[:, 2:3].astype(np.uint8)
            base_a = col[:, 3:4]
        else:
            out[..., 0] = int(col[0])
            out[..., 1] = int(col[1])
            out[..., 2] = int(col[2])
            base_a = float(col[3]) if col.shape[0] > 3 else 255.0
        out[..., 3] = np.clip(alpha * (base_a / 255.0), 0, 255).astype(np.uint8)
        return out

    def mask(
        self,
        visible: np.ndarray | None = None,
        offsets: np.ndarray | None = None,
        pad: int = 6,
    ) -> tuple[np.ndarray, tuple[float, float]]:
        """Same placement maths as render(), but returns the raw alpha mask and its origin."""
        t = self.render(color=(255, 255, 255, 255), visible=visible, offsets=offsets, pad=pad)
        return t[..., 3].astype(np.float32), (self.left, self.top)


def layout(text: str, font: Font, tracking: float = 0.0) -> Line:
    """Shape and place a single line, applying optional letter-spacing (in px per glyph)."""
    glyphs = font.shape(text)
    if not glyphs:
        return Line(text=text, font=font, tracking=tracking, baseline=0, top=0, bottom=0, left=0, right=0)

    pen = 0.0
    placed: list[PlacedGlyph] = []
    for g in glyphs:
        placed.append(
            PlacedGlyph(g.gid, g.cluster, g.mask, g.x + pen, g.y, g.advance + tracking)
        )
        pen += g.advance + tracking

    line = Line(text=text, font=font, glyphs=placed, tracking=tracking)
    tops, bottms, lefts, rights = [], [], [], []
    for g in placed:
        if g.mask.size == 0:
            continue
        tops.append(g.y)
        bottms.append(g.y + g.mask.shape[0])
        lefts.append(g.x)
        rights.append(g.x + g.mask.shape[1])
    if not tops:  # all-whitespace line
        line.top = line.bottom = line.left = line.right = 0.0
        return line
    line.top = float(min(tops))
    line.bottom = float(max(bottms))
    line.left = float(min(lefts))
    line.right = float(max(rights))
    line.baseline = -line.top + font.ascender * 0.0  # baseline sits at y = 0 in glyph space
    line.baseline = float(-line.top)
    return line


def _resize_alpha(a: np.ndarray, scale: float) -> np.ndarray:
    """Nearest/bilinear alpha resize without extra dependencies."""
    if scale == 1.0:
        return a
    from PIL import Image

    h, w = a.shape
    nh, nw = max(1, int(round(h * scale))), max(1, int(round(w * scale)))
    img = Image.fromarray(a.astype(np.uint8), mode="L").resize((nw, nh), Image.BILINEAR)
    return np.asarray(img, dtype=np.float32) / 255.0 * 255.0


# --------------------------------------------------------------------------------------
# Compositing helpers (straight-alpha "over")
# --------------------------------------------------------------------------------------
def composite(dst: np.ndarray, src: np.ndarray, x: int, y: int, opacity: float = 1.0) -> np.ndarray:
    """Alpha-composite an RGBA tile onto an RGB/RGBA canvas in place, clipped to bounds."""
    x, y = int(round(x)), int(round(y))
    H, W = dst.shape[:2]
    sh, sw = src.shape[:2]
    x0, y0 = max(x, 0), max(y, 0)
    x1, y1 = min(x + sw, W), min(y + sh, H)
    if x1 <= x0 or y1 <= y0:
        return dst

    tile = src[y0 - y : y1 - y, x0 - x : x1 - x]
    sa = tile[..., 3:4].astype(np.float32) / 255.0 * opacity
    srgb = tile[..., :3].astype(np.float32)

    d = dst[y0:y1, x0:x1, :3].astype(np.float32) if dst.shape[2] >= 3 else dst[y0:y1, x0:x1].astype(np.float32)
    blend = srgb * sa + d * (1.0 - sa)
    dst[y0:y1, x0:x1, :3] = np.clip(blend, 0, 255).astype(dst.dtype)
    if dst.shape[2] == 4:
        da = dst[y0:y1, x0:x1, 3:4].astype(np.float32) / 255.0
        na = sa + da * (1.0 - sa)
        dst[y0:y1, x0:x1, 3:4] = np.clip(na * 255.0, 0, 255).astype(dst.dtype)
    return dst


def blur_alpha_fill(mask: np.ndarray, radius: float) -> np.ndarray:
    """Cheap separable blur used for glows and soft shadows (kernel: repeated box blur)."""
    if radius <= 0:
        return mask.astype(np.float32)
    a = mask.astype(np.float32)
    r = max(1, int(round(radius)))
    for _ in range(2):
        pad = np.pad(a, ((r, r), (0, 0)))
        cs = np.cumsum(pad, axis=0)
        a = (cs[2 * r :, :] - cs[:-2 * r, :]) / (2 * r)
        pad = np.pad(a, ((0, 0), (r, r)))
        cs = np.cumsum(pad, axis=1)
        a = (cs[:, 2 * r :] - cs[:, :-2 * r]) / (2 * r)
    return a


def tint(mask: np.ndarray, color: Sequence[int], opacity: float = 1.0) -> RenderTarget:
    """Build an RGBA tile from a single-channel mask."""
    h, w = mask.shape
    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[..., 0] = color[0]
    out[..., 1] = color[1]
    out[..., 2] = color[2]
    out[..., 3] = np.clip(mask * opacity, 0, 255).astype(np.uint8)
    return out


def gradient_fill(h: int, stops: Sequence[tuple[float, tuple[int, int, int]]]) -> np.ndarray:
    """Vertical gradient colour ramp: stops = [(0.0, (r,g,b)), (1.0, (r,g,b)), ...]."""
    xs = np.linspace(0.0, 1.0, h, dtype=np.float32)
    out = np.zeros((h, 3), dtype=np.float32)
    stops = sorted(stops, key=lambda s: s[0])
    for c in range(3):
        out[:, c] = np.interp(xs, [s[0] for s in stops], [s[1][c] for s in stops])
    return out
