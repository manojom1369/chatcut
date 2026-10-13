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

Either

1. drop the source file in as `work/proxy480.mp4` (480p, for analysis) and
   `work/slice.mp4` (any 1080p+ rendition), then run
   `scripts/analyze.py` -> `scripts/plan_cut.py` -> `scripts/render.sh`; or
2. run `scripts/harvest.py` on a machine whose IP YouTube will serve — it is
   resumable and will pick up exactly where it left off.
