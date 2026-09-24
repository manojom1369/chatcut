# chatcut

Music-video visualizer for the **Jagada** track — a fully procedural 1080×1920 @ 30fps
render (no 3D engine): a glowing core sphere, a spinning particle sheet, bokeh rain,
burst/shell/ring events on every strong onset, camera keyframes, contraction
"inhale" before each drop, bloom, vignette, grain and chromatic aberration, with
Poppins text hooks.

## Layout

- `visualizer/render_jagada.py` — the renderer (audio analysis + scene + ffmpeg encode)
- `visualizer/assets/fonts/` — Poppins Bold (latin 700, woff2)
- `visualizer/setup.sh` — idempotent toolchain bootstrap (venv + deps + ffmpeg + font)
- `audio/` — source audio (`jagada.mp3` is the real track; `demo_track.mp3` is a
  synthesized stand-in)
- `demo_clip.mp4` — demo render of the synthesized 20 s track

## Usage

```bash
bash visualizer/setup.sh                    # once per fresh environment

# frame preview sheet (comma list of timestamps, cols, output path)
venv/bin/python visualizer/render_jagada.py test 0.5,1.6,3.0 3 visualizer/test_sheet.jpg

# full encode (defaults: audio/jagada.mp3 -> stdout path arg)
MP3="$PWD/audio/jagada.mp3" PATH="$PWD/venv/bin:$PATH" \
  venv/bin/python visualizer/render_jagada.py full jagada_final.mp4

# optional env overrides
RW=1080 RH=1920 FPS via code constant; MP3, RW, RH, FONT are env-overridable
```

Notes:
- Drops are hardcoded to the Jagada song: `DROPS = [1.60, 16.83, 33.11, 49.20]`
  (plus the camera keyframe schedule `KF` and contraction windows `IMPL` around
  16.83 / 33.11 / 49.20). For a different song, retime these to its drops.
- `ffmpeg` on PATH must support `libx264` + `aac` (setup.sh symlinks the static
  build shipped with the `imageio-ffmpeg` pip package).
- Render speed ≈ 0.5 s/frame at 1080×1920 → full 52 s track ≈ 13–16 min.
