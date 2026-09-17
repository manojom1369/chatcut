"""
Layout tests for the Telugu text engine.

Run:  /home/user/.venv/bin/python -m pytest tests/ -q      (or plain `python tests/test_layout.py`)

These lock down the two bugs most likely to silently ruin a lyric video:
  1. glyph advances being accumulated twice (lines spread out across the frame)
  2. complex-script shaping being bypassed (Telugu matras landing in the wrong order)
"""

from __future__ import annotations

import os
import sys

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "src"))

import uharfbuzz as hb  # noqa: E402

from kinetic_text import Font, layout  # noqa: E402
from show_config import CARDS, SHOW  # noqa: E402

FONT = os.path.join(ROOT, "assets", "fonts", "noto-sans-telugu-telugu-700-Bold.ttf")
LATIN = os.path.join(ROOT, "assets", "fonts", "inter-latin-600-SemiBold.ttf")

LINES = [
    "ఓ సోనా వెన్నెల సోనా",
    "నీవే తోడని నిజంగా",
    "నీవుంటే ఒక యుగమే",
    "తెలుసా తెలుసా ఇది తెలుసా",
    "ముద్దుల్తో ముంచేసేయ్నా",
    "కౌగిళికే",
]


def hb_total_advance(font: Font, text: str) -> float:
    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    hb.shape(font.hb_font, buf, {"kern": True, "liga": True})
    return sum(p.x_advance for p in buf.glyph_positions) * font.scale


def test_advance_matches_harfbuzz() -> None:
    """The laid-out pen must match HarfBuzz's own total advance (catches double accumulation)."""
    f = Font(FONT, 80)
    for text in LINES:
        line = layout(text, f)
        hb_adv = hb_total_advance(f, text)
        ink_left = min(g.x for g in line.glyphs if g.mask.size)
        ink_right = max(g.x + g.mask.shape[1] for g in line.glyphs if g.mask.size)
        assert ink_left >= -1.0, f"{text!r}: first glyph starts off-pen ({ink_left})"
        # a glyph's ink may overhang its advance by a side bearing; allow 3% + 4px
        assert ink_right <= hb_adv * 1.03 + 4, f"{text!r}: ink {ink_right:.0f}px exceeds advance {hb_adv:.0f}px"
        # no glyph may sit further right than the total advance
        for g in line.glyphs:
            assert g.x <= hb_adv, f"{text!r}: glyph placed past the line advance"


def test_lines_are_not_spread_out() -> None:
    """Ink width must be a sane multiple of the pen advance — this is what broke before."""
    f = Font(FONT, 80)
    for text in LINES:
        line = layout(text, f)
        hb_adv = hb_total_advance(f, text)
        ratio = line.width / hb_adv
        assert 0.45 < ratio < 1.05, f"{text!r}: ink/advance ratio {ratio:.2f} looks spread out"


def test_words_are_segmented() -> None:
    """word_ranges() must return one range per space-separated word, in order."""
    f = Font(FONT, 72)
    for text in LINES:
        line = layout(text, f)
        expected = len(text.split())
        ranges = line.word_ranges()
        assert len(ranges) == expected, f"{text!r}: {len(ranges)} ranges for {expected} words"
        assert ranges[0][0] == 0, f"{text!r}: first range must start at glyph 0"
        assert ranges[-1][1] == len(line.glyphs)
        for (a, b), (c, d) in zip(ranges, ranges[1:]):
            assert a < b <= c < d, f"{text!r}: overlapping ranges {ranges}"

        # the word under each range must match the source word
        chars_by_glyph = [min(g.cluster, len(text) - 1) for g in line.glyphs]
        for (a, b), word in zip(ranges, text.split()):
            i0 = chars_by_glyph[a]
            i1 = chars_by_glyph[b - 1]
            assert text[i0 : i1 + 1].startswith(word[:1]), f"{text!r}: range {a}-{b} != {word!r}"


def test_telugu_shaping_applies_gsub() -> None:
    """Telugu must shape to fewer glyphs than characters for conjuncts/matras."""
    f = Font(FONT, 80)
    text = "చెక్కిల్లో"          # has a conjunct + matras
    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    hb.shape(f.hb_font, buf, {"kern": True, "liga": True})
    assert len(buf.glyph_infos) < len(text), "GSUB did not fire — Telugu shaping is broken"


def test_keyword_lookup() -> None:
    """The keyword emphasis must find its glyphs in every card that declares one."""
    f = Font(FONT, 74)
    for card in SHOW:
        if not card.keyword:
            continue
        assert card.keyword in card.telugu, f"{card.keyword!r} not found in {card.telugu!r}"
        line = layout(card.telugu, f)
        i0 = card.telugu.index(card.keyword)
        idx = line.glyph_indices_for_chars(i0, i0 + len(card.keyword))
        assert idx, f"no glyphs mapped for keyword {card.keyword!r}"
        assert max(idx) < len(line.glyphs)


def test_no_card_overflows_the_frame() -> None:
    """Nothing may be wider than the 1080px frame, or it would be clipped at export."""
    for card in SHOW:
        f = Font(FONT, card.size)
        line = layout(card.telugu, f, tracking=0.6)
        assert line.width <= 1010, f"{card.telugu!r} is {line.width:.0f}px wide at size {card.size}"
        if card.latin:
            fl = Font(LATIN, 28)
            ll = layout(card.latin, fl, tracking=1.2)
            assert ll.width <= 1010, f"{card.latin!r} is {ll.width:.0f}px wide"
        # the lyric band must not reach the platform UI dead zone
        assert card.size * 1.4 + 0.585 * 1920 < 0.94 * 1920, f"{card.telugu!r} sits too low"


def test_timeline_is_contiguous() -> None:
    """Cards must tile the timeline without gaps or overlaps."""
    order = sorted(SHOW, key=lambda c: c.start_beat)
    for a, b in zip(order, order[1:]):
        assert abs(a.start_beat + a.beats - b.start_beat) < 1e-6, (
            f"gap/overlap between {a.telugu!r} and {b.telugu!r}"
        )


def test_render_is_deterministic() -> None:
    f = Font(FONT, 64)
    line = layout("ఓ సోనా వెన్నెల సోనా", f)
    a = line.render(gradient=((255, 255, 255), (255, 200, 150)))
    b = line.render(gradient=((255, 255, 255), (255, 200, 150)))
    assert np.array_equal(a, b)
    assert a.shape[2] == 4 and a[..., 3].max() == 255


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for t in tests:
        try:
            t()
            print(f"  PASS  {t.__name__}")
        except AssertionError as e:
            failed += 1
            print(f"  FAIL  {t.__name__}: {e}")
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    sys.exit(1 if failed else 0)
