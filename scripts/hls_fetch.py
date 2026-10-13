#!/usr/bin/env python3
"""Robust HLS segment fetcher for YouTube media playlists.

YouTube's video CDN intermittently answers 403 for this sandbox's egress IP.
yt-dlp gives up and skips fragments; this script instead downloads each
fragment individually with long backoff and caches progress on disk so a run
can be resumed after a block window passes.

Usage:
  hls_fetch.py --manifest-url URL --out OUT.(mp4|ts) [--only SEG_OFFSET SEG_COUNT]
"""
import argparse
import os
import re
import subprocess
import sys
import time
import urllib.parse

CURL = "curl"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")


def log(*a):
    print("[hls]", *a, flush=True)


def curl(url, dest, tries=12, base_sleep=3.0, max_sleep=90.0, retry_403=True):
    """Fetch url to dest. Returns True on success."""
    sleep = base_sleep
    for attempt in range(1, tries + 1):
        cmd = [CURL, "-sS", "-L", "--max-time", "90", "-A", UA,
               "-H", "Accept: */*", "-o", dest, "-w", "%{http_code}",
               url]
        try:
            r = subprocess.run(cmd, capture_output=True, text=True,
                               timeout=120)
            code = (r.stdout or "").strip().splitlines()[-1] if r.stdout else ""
        except subprocess.TimeoutExpired:
            code = "timeout"
        ok = code == "200" and os.path.exists(dest) and os.path.getsize(dest) > 0
        if ok:
            return True
        if code in ("403", "404") and not retry_403:
            return False
        if attempt < tries:
            log(f"  retry {attempt}/{tries} code={code} sleeping {sleep:.0f}s")
            time.sleep(sleep)
            sleep = min(sleep * 1.8, max_sleep)
    return False


def fetch_manifest(url, dest):
    return curl(url, dest, tries=8, base_sleep=4.0)


def parse_playlist(path):
    """Return (init_url_or_None, [segment_urls])."""
    txt = open(path, encoding="utf-8", errors="replace").read()
    init = None
    segs = []
    for line in txt.splitlines():
        line = line.strip()
        if line.startswith("#EXT-X-MAP"):
            m = re.search(r'URI="([^"]+)"', line)
            if m:
                init = m.group(1)
        elif line and not line.startswith("#"):
            segs.append(line)
    if not segs:
        raise SystemExit("no segments found in playlist")
    return init, segs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest-url")
    ap.add_argument("--manifest-file")
    ap.add_argument("--out", required=True)
    ap.add_argument("--workdir")
    ap.add_argument("--seg-start", type=int, default=0)
    ap.add_argument("--seg-count", type=int, default=0, help="0 = all")
    ap.add_argument("--delay", type=float, default=1.2)
    args = ap.parse_args()

    workdir = args.workdir or (args.out + ".parts")
    os.makedirs(workdir, exist_ok=True)
    mpath = os.path.join(workdir, "index.m3u8")

    if args.manifest_file:
        mpath = args.manifest_file
    else:
        for i in range(20):
            if fetch_manifest(args.manifest_url, mpath):
                break
            log("manifest blocked, waiting before retry")
            time.sleep(60)
        else:
            raise SystemExit("could not fetch manifest")

    init, segs = parse_playlist(mpath)
    log(f"segments: {len(segs)}, init: {'yes' if init else 'no'}")

    start = args.seg_start
    end = len(segs) if args.seg_count <= 0 else min(len(segs), start + args.seg_count)
    wanted = list(range(start, end))

    files = []
    if init:
        ip = os.path.join(workdir, "init.bin")
        if not (os.path.exists(ip) and os.path.getsize(ip) > 0):
            if not curl(init, ip):
                raise SystemExit("init segment failed")
        files.append(ip)

    for n, idx in enumerate(wanted):
        seg = os.path.join(workdir, f"seg_{idx:05d}.bin")
        if not (os.path.exists(seg) and os.path.getsize(seg) > 0):
            if not curl(segs[idx], seg):
                log(f"FAILED segment {idx} (giving up for now)")
                raise SystemExit(2)
        files.append(seg)
        if n % 10 == 9:
            log(f"  {n + 1}/{len(wanted)} done")
        time.sleep(args.delay)

    with open(args.out, "wb") as out:
        for f in files:
            with open(f, "rb") as fh:
                while True:
                    chunk = fh.read(1 << 20)
                    if not chunk:
                        break
                    out.write(chunk)
    log("wrote", args.out, os.path.getsize(args.out), "bytes")


if __name__ == "__main__":
    main()
