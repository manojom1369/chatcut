# chatcut

Turn a landscape source video into a 9:16 vertical edit that keeps the main
performer (the "hero") in frame, using a per-frame auto-reframe crop.

## Deliverable

Source: <https://www.youtube.com/watch?v=9Pc6cHKB4B4> — *SteppaMaar Full Video
Song | Double ISMART* (Aditya Music), 3840x2160, 24 fps, 4:11.

Output: **`out/short_9x16_59s.mp4`** — 1080x1920, 59.000 s, 24 fps, with the
original audio track, cropped from the 4K master so the lead performer stays
centred while the frame pans with them.

### How the request was read

| Request | Implementation |
| --- | --- |
| *analysis this link* | probe duration/fps/resolution, detect scene cuts, per-frame face detection, motion and loudness (`scripts/analyze.py`) |
| *edit this video 9:16 ratio* | 1080x1920 output; source is 16:9 so the crop keeps full height and pans horizontally |
| *59sec* | exactly 59.000 s = 1416 frames @ 24 fps |
| *track hero* | sticky face tracker restarted at every cut, smoothed per shot, converted into a crop-x trajectory |

## Pipeline

```
scripts/fetch_until.sh   download an HLS rendition (resumable, survives CDN 403s)
scripts/analyze.py       work/analysis.json   scenes + faces + motion + loudness
scripts/plan_cut.py      work/plan.json       best 59 s window + crop trajectory
scripts/slice_hls.sh     grab just that window from a higher-resolution rendition
scripts/render.sh        out/short_9x16_59s.mp4
scripts/make.sh          runs all of the above
```

`make.sh` analyses a cheap 480p rendition to choose the window, slices only the
needed ~70 s out of the 1440p/2160p rendition, re-analyses that slice (so the
crop track is measured on the frames actually used) and renders.

### Crop geometry

    crop_h = source_h
    crop_w = round(source_h * 9 / 16)      # 1215 px at 4K
    x(t)   in [0, source_w - crop_w]

Because the crop spans the full height there is no vertical drift and no
zooming, so there is no pumping. The trajectory is written as a flat sum of
clamped ramps evaluated by ffmpeg's `crop` filter:

    crop=W:H:x='x0+(dx0*min(max((n-n0)/dn,0),1))+...':y=0,scale=1080:1920

(ffmpeg's expression parser fails past ~100 levels of nesting, hence the flat,
balanced-tree form rather than nested `if`s.)

## Toolchain

`scripts/setup_tools.sh` installs ffmpeg, yt-dlp, deno (needed for YouTube's JS
challenges), numpy/opencv and the YuNet face model into `tools/` and `models/`.
Neither directory is committed. `scripts/setup_potoken.sh` optionally builds
the bgutil PO-token provider, which is what makes yt-dlp's `mweb` client work
from a datacenter IP.

## Source acquisition notes

YouTube serves this sandbox's egress IP `403` on `*.googlevideo.com` content
intermittently — bursts of a few dozen segments succeed, then everything is
refused for a while, and DASH `videoplayback` URLs are refused almost always.
The HLS renditions behave better than DASH, so:

* `fetch_until.sh` + `hls_fetch.py` download HLS segments one at a time, cache
each successful segment on disk and re-mint the media playlist every round, so
a run makes progress across several windows instead of failing wholesale;
* `slice_hls.sh` asks ffmpeg to seek straight into the HLS playlist so only the
segments covering the wanted 70 s are requested.
