# Vertical 9:16 Lyric Render — “Manasa Nuvvunde Chote” (charanam)

A working 9:16 render built to the [master prompt](../prompts/vertical-9x16-hero-heroine-master-prompt.md):
Telugu kinetic typography, beat-snapped cue map, section-wise cinematic grading, and a
composition that keeps the upper two-thirds of the frame clear for the hero and heroine.

- **Deliverable:** `output/manasa-9x16-lyric-teaser.mp4` — 1080 × 1920, 30 fps, 49.3 s
- **Clean version:** `output/manasa-9x16-clean-reframe.mp4` — no typography, composition + grade only
- **Preview UI:** `python3 tools/serve.py --port 8000` → player, live cue panel, timing map, QC checklist
- **Timing:** 90 BPM grid, 74 beats, 18 cues — `output/manasa-9x16-timeline.json`, [`timing-map.md`](timing-map.md)

## What is real in this render

| Element | Status |
|---|---|
| Telugu typesetting | **Real.** HarfBuzz shaping + FreeType rasterisation; conjuncts and matras shaped correctly (Pillow here has no libraqm, so the engine is hand-rolled). |
| Composition rules | **Real.** Lyrics sit below 60% frame height, the 12–62% prime zone stays clear for faces, nothing enters the top 12% / bottom 25% platform dead zones. |
| Cue timing | **Real.** Every cue is a whole or half beat, snapped to a derived BPM grid; keyword emphasis lands on the downbeat. |
| Animation system | **Real.** Per-glyph presets (rise, wipe, stagger, pop, title), custom easing, beat-pulsed glow, exit drift, film grain, section crossfades with a light-leak wipe. |
| Grading | **Real treatment, placeholder source.** Three section palettes (warm amber romance / desaturated moody / night neon) with vignette, floor falloff, scrim, halation and grain. |
| Footage | **Placeholder.** Three photographic plates stand in for the 8K master and are treated exactly as real footage would be (cover-crop, upper-third bias, slow push, section grade). |
| Audio | **Placeholder, original.** A synthetic 90 BPM guide track (royalty-free) so the beat-synced type can be verified. Not the song. |
| Reference match | **Not done.** The Drive reference could not be downloaded in this environment, so no font or colour was borrowed from it. Run [`reference-extraction-worksheet.md`](../prompts/reference-extraction-worksheet.md), then apply Task D. |

## Layout

```
src/kinetic_text.py      script-correct text engine: HarfBuzz shaping, FreeType masks,
                         per-glyph animation offsets, gradient tints, blitting, blur
src/show_config.py       lyric sheet, beat map, type sizes, section palettes, safe zones
src/backdrops.py         procedural plates (sky, bokeh, light leak, particles, grain, vignette)
src/render_kinetic.py    compositor + encoder: FootagePlate, CardLayer animation, Show.frame()
src/audio_guide.py       synthetic 90 BPM guide track (numpy)
tools/export_timing.py   SRT + JSON + markdown timing deliverables
tools/serve.py           read-only preview server (dotfiles blocked, binds 0.0.0.0)
tests/test_layout.py     layout/typography regression tests
site/                    the preview UI
```

## Commands

```bash
# venv (Pillow, numpy, fontTools, uharfbuzz, freetype-py, imageio-ffmpeg)
python3 -m venv .venv && .venv/bin/pip install pillow numpy fonttools brotli uharfbuzz freetype-py imageio-ffmpeg

# guide audio + render (≈4 min for 1480 frames)
.venv/bin/python src/audio_guide.py /tmp/guide.wav
.venv/bin/python src/render_kinetic.py \
  --out output/manasa-9x16-lyric-teaser.mp4 --audio /tmp/guide.wav --crf 16 \
  --plates "A=docs/images/plate-amber.jpg,B=docs/images/plate-moody.jpg,C=docs/images/plate-neon.jpg"

# clean version (no typography) and the light preview
.venv/bin/python src/render_kinetic.py --out output/manasa-9x16-clean-reframe.mp4 --no-text \
  --plates "A=docs/images/plate-amber.jpg,B=docs/images/plate-moody.jpg,C=docs/images/plate-neon.jpg"
ffmpeg -i output/manasa-9x16-lyric-teaser.mp4 -vf scale=540:960 -crf 27 output/preview-540x960.mp4

# timing deliverables + tests + preview
.venv/bin/python tools/export_timing.py
.venv/bin/python tests/test_layout.py
python3 tools/serve.py --port 8000
```

## Retiming to the real track

Everything is expressed in **beats**, not frames. Change `BPM` in `src/show_config.py` and the
frame maths follows; then nudge each `start_beat` to the real vocal's phrase entries. The cue
list (`output/manasa-9x16-timeline.json`) is the contract between the edit and the render.

## Corrected lyric text

The source text supplied had two garbled words and a missing final word; the render uses the
transcription of the recording:

| Supplied | Used | Note |
|---|---|---|
| `ika shkname` | `ఇక క్షణమే` (*ika kshaname*) | “and then, a single moment” |
| `oka ugame` | `ఒక యుగమే` (*oka yugame*) | “an age” |
| `kougilike` | `కౌగిళికే` (*kougilike*) | “into the embrace” |

## Fonts

Noto Sans Telugu (Regular/Bold/Black), Noto Serif Telugu, Anton, Inter — all SIL Open Font
License, converted from WOFF2 to TTF in `assets/fonts/`. Inter and Anton are not used by the
current cut; they are kept for the texted/Latin treatments.

## Notes on quality

- The 9:16 render is a 1080 × 1920 **proof**. The 8K (4320 × 7680) master belongs in a Resolve
  or Baselight finish, where the reframe, the grade and the text pass are done natively — this
  pipeline exists to lock the composition rules, the cue map and the type system first.
- `FootagePlate` returns an exactly 1080 × 1920 frame every time. Returning an oversampled
  buffer corrupts the composite (text is laid out for a different frame size) — see the comment
  in the class before you change the crop maths.
