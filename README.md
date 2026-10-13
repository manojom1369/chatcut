# chatcut

Turn a landscape source video into a **59 s, 9:16 vertical edit that keeps the
main performer (the "hero") in frame**, using a per-frame auto-reframe crop.

## One command

```bash
scripts/ingest.sh --src  <analysis copy, any resolution> \
                  --hires <render copy, 1080p+>         \
                  --out   out/short_9x16_59s.mp4
```

`--hires` is optional (defaults to `--src`). The crop trajectory is stored in
normalised units, so a plan measured on a 480p proxy renders correctly from a
4K master — which is exactly the split this repo uses to keep the analysis
cheap.

Useful flags: `--start SEC` to force the window, `--duration SEC`,
`--hero-hint 0..1` (where the hero usually is, default centred),
`--sample-fps N`, `--reuse` to skip re-analysis.

```bash
scripts/selftest.sh        # synthesises a clip, runs the pipeline, verifies framing
scripts/verify.sh OUT.mp4  # container/duration/geometry/audio + contact sheet
```

## How it works

```
scripts/analyze.py      work/analysis.json   scene cuts, face track, motion, loudness
scripts/plan_cut.py     work/plan.json       best 59 s window + crop trajectory
scripts/render.sh       out/…mp4             ffmpeg crop + scale, per-frame x(t)
```

**Window selection.** Candidate 59 s windows are scored on loudness (chorus),
face presence and cut density, with a bonus for starting exactly on a cut.

**Hero tracking.** A sticky face tracker picks the face nearest the previous
one (with size-consistency and centre-weighting); it is *restarted at every
scene cut* so motion never smears across a cut, and falls back to the centroid
of the frame-to-frame difference in shots where no face is found. Each shot is
smoothed independently (median + gaussian), speed-limited, and then resampled.

**Crop geometry.** The source is 16:9 and the target is 9:16, so the crop keeps
the full frame height and pans horizontally only — no vertical drift, no zoom
pumping:

    crop_w = 2*floor(src_h * 9 / 32)
    crop_h = 2*floor(src_h / 2)
    x(t)   in [0, src_w - crop_w]

The trajectory is handed to ffmpeg as a flat sum of clamped ramps evaluated by
`crop`'s `x` expression:

    crop=w='2*floor(in_h*9/32)':h='2*floor(in_h/2)':
         x='x0+(dx0*min(max((n-n0)/dn,0),1))+…':y=0, scale=1080:1920

Two ffmpeg gotchas are handled: the expression parser gives up past ~100
levels of nesting (so the ramps are summed as a *balanced binary tree*), and an
option value containing commas must be single-quoted inside the filter graph.

**Review.** `scripts/framing_overlay.py --plan work/plan.json --video SRC`
draws the crop rectangle over source frames so the tracking can be eyeballed.

## Toolchain

`scripts/setup_tools.sh` installs ffmpeg, yt-dlp, deno (for YouTube's JS
challenges), numpy/opencv and the YuNet face model into `tools/` + `models/`
(not committed). `scripts/setup_potoken.sh` optionally builds the bgutil
PO-token provider for yt-dlp's `mweb` client.

## Source acquisition

`scripts/harvest.py` downloads the source resumably: it mints an HLS media
playlist through yt-dlp, pulls segments one at a time, caches every success,
backs off when the CDN starts refusing, and drives analyse → plan → slice →
render once it has what it needs.

See `STATUS.md` for why that path could not complete inside this sandbox.
