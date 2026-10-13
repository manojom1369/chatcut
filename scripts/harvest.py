#!/usr/bin/env python3
"""Resumable downloader/orchestrator for the 9:16 edit.

YouTube answers 403 on this egress in bursts: a few dozen segments succeed,
then everything is refused for a while.  Rather than failing wholesale, this
script

  * mints an HLS media playlist through yt-dlp,
  * downloads segments one at a time, caching every success on disk,
  * stops the round as soon as it is blocked and waits before trying again,
  * concatenates the fragments once a rendition is complete,
  * and drives the rest of the pipeline (analyse -> plan -> slice -> render).

Stages are idempotent, so re-running after an interruption resumes.
"""
import argparse
import json
import os
import re
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FFMPEG = os.path.join(ROOT, "tools", "ffmpeg")
PY = os.path.join(ROOT, "tools", "venv", "bin", "python")
YDLP = [os.path.join(ROOT, "tools", "venv", "bin", "yt-dlp"),
        "--js-runtimes", "deno", "--no-warnings"]
VIDEO = "https://www.youtube.com/watch?v=9Pc6cHKB4B4"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")


def log(*a):
    print(time.strftime("[%H:%M:%S]"), *a, flush=True)


def mint(itag):
    """Return a fresh HLS media-playlist URL for `itag`."""
    try:
        r = subprocess.run(YDLP + ["-f", str(itag), "--print", "urls", VIDEO],
                           capture_output=True, text=True, timeout=120)
    except subprocess.TimeoutExpired:
        return None
    for line in r.stdout.splitlines():
        line = line.strip()
        if line.startswith("http"):
            return line
    return None


def curl(url, dest, tries=2, base=4.0):
    """Fetch url -> dest. Returns True/False; never leaves a partial file."""
    sleep = base
    for attempt in range(1, tries + 1):
        tmp = dest + ".tmp"
        try:
            r = subprocess.run(
                ["curl", "-sS", "-L", "--max-time", "120", "-A", UA,
                 "-o", tmp, "-w", "%{http_code}", url],
                capture_output=True, text=True, timeout=180)
            code = (r.stdout or "").strip().splitlines()[-1] if r.stdout else ""
        except subprocess.TimeoutExpired:
            code = "timeout"
        if code == "200" and os.path.exists(tmp) and os.path.getsize(tmp) > 0:
            os.replace(tmp, dest)
            return True
        if os.path.exists(tmp):
            os.unlink(tmp)
        if attempt < tries:
            time.sleep(sleep)
            sleep *= 2
    return False


def parse_playlist(path):
    """Return (init_url|None, [(start, dur, url)], total_duration)."""
    txt = open(path, encoding="utf-8", errors="replace").read()
    init = None
    segs = []
    t = 0.0
    dur = None
    for line in txt.splitlines():
        line = line.strip()
        if line.startswith("#EXT-X-MAP"):
            m = re.search(r'URI="([^"]+)"', line)
            if m:
                init = m.group(1)
        elif line.startswith("#EXTINF:"):
            dur = float(line.split(":", 1)[1].split(",")[0])
        elif line and not line.startswith("#"):
            segs.append((round(t, 3), dur or 0.0, line))
            t += dur or 0.0
            dur = None
    return init, segs, round(t, 3)


def fetch_rendition(itag, workdir, t0=None, t1=None, delay=0.6, budget=80):
    """Download the segments covering [t0, t1] (or everything).

    Returns (status, start, end) where status is 'done', 'blocked' or 'error'.
    `start` is the absolute time of the first downloaded segment.
    """
    os.makedirs(workdir, exist_ok=True)
    plist = os.path.join(workdir, "index.m3u8")
    murl = mint(itag)
    if not murl:
        log(f"  [{itag}] could not mint a media playlist")
        return "error", None, None
    if not curl(murl, plist, tries=2, base=5.0):
        log(f"  [{itag}] playlist blocked")
        return "blocked", None, None
    init, segs, total = parse_playlist(plist)
    if not segs:
        log(f"  [{itag}] empty playlist")
        return "error", None, None

    if t0 is None:
        lo, hi = 0, len(segs) - 1
    else:
        lo = max(0, max(i for i, s in enumerate(segs) if s[0] <= t0)
                 if any(s[0] <= t0 for s in segs) else 0)
        hi = min(len(segs) - 1,
                 next((i for i, s in enumerate(segs) if s[0] + s[1] > t1),
                      len(segs) - 1))
    start_time = segs[lo][0]
    end_time = segs[hi][0] + segs[hi][1]

    want = list(range(lo, hi + 1))
    have = sum(1 for i in want
               if os.path.exists(os.path.join(workdir, f"seg_{i:05d}.bin")))
    log(f"  [{itag}] segments {lo}..{hi} ({len(want)}), cached {have}, "
        f"t={start_time:.2f}..{end_time:.2f}")

    if init:
        ip = os.path.join(workdir, "init.bin")
        if not (os.path.exists(ip) and os.path.getsize(ip) > 0):
            if not curl(init, ip):
                return "blocked", start_time, end_time

    new = 0
    for idx in want:
        seg = os.path.join(workdir, f"seg_{idx:05d}.bin")
        if os.path.exists(seg) and os.path.getsize(seg) > 0:
            continue
        if new >= budget:
            return "blocked", start_time, end_time
        if not curl(segs[idx][2], seg):
            log(f"  [{itag}] blocked at segment {idx}")
            return "blocked", start_time, end_time
        new += 1
        time.sleep(delay)

    log(f"  [{itag}] complete ({len(want)} segments)")
    return "done", start_time, end_time


def concat(workdir, lo, hi, out):
    files = []
    init = os.path.join(workdir, "init.bin")
    if os.path.exists(init):
        files.append(init)
    for i in range(lo, hi + 1):
        p = os.path.join(workdir, f"seg_{i:05d}.bin")
        if not os.path.exists(p):
            raise SystemExit(f"missing {p}")
        files.append(p)
    tmp = out + ".raw"
    with open(tmp, "wb") as o:
        for f in files:
            with open(f, "rb") as fh:
                for chunk in iter(lambda: fh.read(1 << 20), b""):
                    o.write(chunk)
    subprocess.run([FFMPEG, "-y", "-v", "error", "-i", tmp, "-c", "copy",
                    "-movflags", "+faststart", out], check=True)
    os.unlink(tmp)
    log(f"  wrote {out} ({os.path.getsize(out)} bytes)")


def run(cmd):
    log("$ " + " ".join(cmd))
    return subprocess.run(cmd, cwd=ROOT).returncode == 0


def mux_audio(video, audio, out, ss=None, dur=None):
    """Attach the audio rendition to a video-only rendition."""
    cmd = [FFMPEG, "-y", "-v", "error"]
    if ss is not None:
        cmd += ["-ss", f"{ss:.3f}"]
    if dur is not None:
        cmd += ["-t", f"{dur:.3f}"]
    cmd += ["-i", audio, "-i", video, "-map", "1:v:0", "-map", "0:a:0",
            "-c", "copy", "-movflags", "+faststart", out]
    subprocess.run(cmd, check=True)
    log(f"  muxed -> {out} ({os.path.getsize(out)} bytes)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--audio-itag", default="234")
    ap.add_argument("--proxy-itag", default="231")
    ap.add_argument("--src-itag", default="620")
    ap.add_argument("--sleep", type=float, default=300.0)
    ap.add_argument("--max-rounds", type=int, default=1000)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    work = os.path.join(ROOT, "work")
    os.makedirs(work, exist_ok=True)
    audio = os.path.join(work, "audio.m4a")
    proxy_v = os.path.join(work, "proxy480.v.mp4")
    proxy = os.path.join(work, "proxy480.mp4")
    slice_v = os.path.join(work, "slice.v.mp4")
    slice_out = os.path.join(work, "slice.mp4")
    plan_p = os.path.join(work, "plan.json")
    start_p = os.path.join(work, "slice_start.json")
    final = os.path.join(ROOT, "out", "short_9x16_59s.mp4")

    def grab(itag, workdir, out, t0=None, t1=None):
        """One round at a rendition; returns True when the file exists."""
        if os.path.exists(out):
            return True
        st, lo, hi = fetch_rendition(itag, workdir, t0, t1)
        if st != "done":
            return False
        _, segs, _ = parse_playlist(os.path.join(workdir, "index.m3u8"))
        concat(workdir, lo, hi, out)
        json.dump({"start": segs[lo][0], "end": segs[hi][0] + segs[hi][1]},
                  open(out + ".json", "w"))
        return True

    for rnd in range(1, args.max_rounds + 1):
        log(f"=== round {rnd} ===")
        blocked = False

        if not grab(args.audio_itag, os.path.join(work, "p_audio"), audio):
            blocked = True

        if not grab(args.proxy_itag, os.path.join(work, "p_proxy"), proxy_v):
            blocked = True
        elif os.path.exists(audio) and not os.path.exists(proxy):
            mux_audio(proxy_v, audio, proxy)

        if os.path.exists(proxy) and not os.path.exists(plan_p):
            run([PY, "scripts/analyze.py", "--video", proxy,
                 "--out", os.path.join(work, "analysis.json")])
            run([PY, "scripts/plan_cut.py", "--analysis",
                 os.path.join(work, "analysis.json"), "--out", plan_p])

        if os.path.exists(plan_p) and not os.path.exists(slice_v):
            plan = json.load(open(plan_p))
            s0 = max(0.0, plan["start"] - 3.0)
            s1 = plan["start"] + plan["duration"] + 3.0
            if not grab(args.src_itag, os.path.join(work, "p_slice"), slice_v, s0, s1):
                blocked = True

        if os.path.exists(slice_v) and os.path.exists(audio) and not os.path.exists(slice_out):
            info = json.load(open(slice_v + ".json"))
            mux_audio(slice_v, audio, slice_out,
                      ss=info["start"], dur=info["end"] - info["start"])

        if os.path.exists(slice_out) and not os.path.exists(final):
            run([PY, "scripts/analyze.py", "--video", slice_out,
                 "--out", os.path.join(work, "slice_analysis.json")])
            run([PY, "scripts/plan_cut.py", "--analysis",
                 os.path.join(work, "slice_analysis.json"),
                 "--out", os.path.join(work, "slice_plan.json")])
            run(["bash", "scripts/render.sh",
                 os.path.join(work, "slice_plan.json"), slice_out, final])

        if os.path.exists(final):
            log("DONE -> " + final)
            return 0
        if args.dry_run:
            return 0
        log(f"blocked={blocked}; sleeping {args.sleep:.0f}s")
        time.sleep(args.sleep)
    return 1


if __name__ == "__main__":
    sys.exit(main())
