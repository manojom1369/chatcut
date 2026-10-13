# chatcut

Vertical (9:16) auto-reframe pipeline for a source video, with subject ("hero")
tracking.

## Task

Source: <https://www.youtube.com/watch?v=9Pc6cHKB4B4>
("SteppaMaar Full Video Song | Double ISMART", Aditya Music, 3840x2160 @ 24 fps,
4:11 long.)

Deliverable: **59 second, 9:16 (1080x1920) edit** of that source where the
frame continuously follows the main performer ("hero") instead of using a
fixed centre crop.

### Interpretation of the request

| Request | Implemented as |
| --- | --- |
| `analysis this link` | probe the video (duration, fps, resolution, scene cuts, audio energy, face/person tracks) |
| `edit this video 9:16 ratio` | render 1080x1920 portrait, dynamic crop window |
| `59sec` | 59.000 s runtime (1416 frames @ 24 fps) |
| `track hero` | per-frame subject detection + smoothed crop trajectory so the lead performer stays in frame |

## Pipeline

```
scripts/analyze.py      -> work/analysis.json   (scenes, faces, motion, loudness)
scripts/plan_cut.py     -> work/plan.json       (chosen 59 s window + crop track)
scripts/render.sh       -> out/short_9x16_59s.mp4
```

`tools/` holds the pinned binaries (ffmpeg/ffprobe, yt-dlp, deno) and is not
committed; `work/` and `logs/` are scratch space.

## Source acquisition notes

`yt-dlp` is used with a JS runtime (deno) for the YouTube signature/`n`
challenge. The DASH `videoplayback` URLs answer `403` for this egress, so the
HLS renditions are used instead (`scripts/hls_fetch.py`), which downloads
segments individually with backoff and caches them so a run survives the CDN's
intermittent `403` windows.
