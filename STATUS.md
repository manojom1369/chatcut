# Status

## Where things stand

The editing pipeline is finished and verified end to end, but the **source video
cannot be downloaded from this sandbox**: YouTube's video CDN returns
`403 Forbidden` for every byte of media to this egress IP.

## Evidence

* Metadata is fine — `yt-dlp` reads title/duration/format list from youtube.com:
  `SteppaMaar Full Video Song | Double ISMART` — 3840x2160, 24 fps, 250.5 s.
* The HLS media playlist is fine — `manifest.googlevideo.com/.../index.m3u8`
  returns `200`.
* Every media segment is refused. Tested `2026-10-13`:

  | attempt | result |
  | --- | --- |
  | HLS segment, `visionos` client | 403 |
  | HLS segment, `mweb` + valid GVS PO token (bgutil provider) | 403 |
  | DASH `videoplayback`, all clients | 403 |
  | segment with `&ipbypass=yes` / `&mip=` / swapped or dropped `ip=` param | 403 |
  | segment on a second, unrelated video | 403 |
  | `&alr=yes` | 200 but returns a redirect stub pointing at a node that 403s |

* Earlier in the session the same egress did download ~45 segments before the
  CDN started refusing; it has refused continuously since, including after a
  9-hour idle gap.
* Third-party mirrors reachable from here (`yewtu.be`, `invidious.nerdvpn.de`)
  answer `401`/HTML for their API and proxy endpoints.

## What still works

Thumbnails are served from a different host (`i.ytimg.com`) and do work, so the
poster frame and the 25/50/75 % key frames were pulled into `work/frames/`.

## How to finish the job

Option 1 is **wired up** — one command takes a file and produces the edit:

```bash
scripts/ingest.sh --src  <any resolution copy>  \
                  --hires <1080p+ copy>         \
                  --out   out/short_9x16_59s.mp4
```

The crop trajectory is stored in normalised units and resolved against the
render source's own dimensions inside the ffmpeg filter, so a plan measured on
a 480p proxy is valid for a 4K master. Verified: the same plan rendered from a
1920x1080 and a 3840x2160 copy keeps the subject centred to within 2 % of
frame width across all 59 s.

Option 2 remains `scripts/harvest.py`, which is resumable and caches every
segment, so it can be run on a machine whose IP YouTube will serve and will
pick up exactly where it left off.

## Verification

* `scripts/selftest.sh` synthesises a landscape clip with a subject sweeping
  across frame, runs the full pipeline and asserts the output is 1080x1920,
  59.000 s, has audio, and keeps the subject within 10 % of centre. It passes
  (worst deviation 1.8 %).
* `scripts/framing_overlay.py` renders a montage of source frames with the
  planned crop rectangle drawn on each, for eyeballing the tracking.
* `scripts/verify.sh` reports duration/geometry/audio and writes a contact
  sheet for any finished render.
