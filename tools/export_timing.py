"""
export_timing.py — writes the deliverables that sit alongside the render:

    output/manasa-9x16-lyrics.srt      styled-cue-ready subtitle file for the lyric cards
    output/manasa-9x16-timeline.json   machine-readable timing map (frames + beats + seconds)
    docs/timing-map.md                 human-readable map for the edit bay
"""

from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src"))

from show_config import BPM, FPS, SHOW, TOTAL_BEATS, TOTAL_FRAMES  # noqa: E402


def srt_time(seconds: float) -> str:
    ms = int(round(seconds * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def main() -> None:
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out = os.path.join(root, "output")
    docs = os.path.join(root, "docs")
    os.makedirs(out, exist_ok=True)
    os.makedirs(docs, exist_ok=True)

    beat_s = 60.0 / BPM

    rows = []
    for c in SHOW:
        start_s = c.start_beat * beat_s
        end_s = (c.start_beat + c.beats) * beat_s
        rows.append(
            dict(
                telugu=c.telugu,
                transliteration=c.latin,
                meaning=c.meaning,
                section=c.section,
                anim=c.anim,
                keyword=c.keyword,
                start_beat=c.start_beat,
                beats=c.beats,
                start_frame=c.start_frame,
                end_frame=c.end_frame,
                start_s=round(start_s, 3),
                end_s=round(end_s, 3),
                size_px=c.size,
            )
        )

    with open(os.path.join(out, "manasa-9x16-timeline.json"), "w", encoding="utf-8") as f:
        json.dump(
            dict(
                song="Manasa Nuvvunde Chote (Munna, Mani Sharma) — charanam",
                bpm=BPM,
                fps=FPS,
                resolution=[1080, 1920],
                total_beats=TOTAL_BEATS,
                total_frames=TOTAL_FRAMES,
                duration_s=round(TOTAL_BEATS * beat_s, 3),
                cards=rows,
            ),
            f,
            ensure_ascii=False,
            indent=2,
        )

    with open(os.path.join(out, "manasa-9x16-lyrics.srt"), "w", encoding="utf-8") as f:
        for i, r in enumerate(rows, 1):
            f.write(f"{i}\n{srt_time(r['start_s'])} --> {srt_time(r['end_s'])}\n{r['telugu']}\n{r['transliteration']}\n\n")

    with open(os.path.join(docs, "timing-map.md"), "w", encoding="utf-8") as f:
        f.write("# Timing map — 9:16 lyric render\n\n")
        f.write(f"BPM **{BPM}** · {FPS} fps · 1080×1920 · {TOTAL_BEATS:.0f} beats · "
                f"{TOTAL_FRAMES} frames · {TOTAL_BEATS * beat_s:.1f}s\n\n")
        f.write("| # | In | Out | Beats | Section | Telugu | Transliteration | Meaning | Anim | Keyword |\n")
        f.write("|---|----|----|-------|---------|--------|-----------------|---------|------|---------|\n")
        for i, r in enumerate(rows, 1):
            f.write(
                f"| {i} | {srt_time(r['start_s'])[3:]} | {srt_time(r['end_s'])[3:]} | {r['beats']:.1f} | "
                f"{r['section']} | {r['telugu']} | {r['transliteration']} | {r['meaning']} | "
                f"{r['anim']} | {r['keyword'] or '—'} |\n"
            )
    print("wrote output/manasa-9x16-timeline.json, output/manasa-9x16-lyrics.srt, docs/timing-map.md")


if __name__ == "__main__":
    main()
