#!/usr/bin/env python3
"""Fetch the source video through a public Invidious instance.

YouTube refuses media bytes to this sandbox's egress IP (see STATUS.md) for
every player client and transport we tried. An Invidious instance running with
`local=true` proxies the media through *its* server instead, which works.

Instances protected by Anubis serve a proof-of-work challenge; we solve it
(SHA-256 with `difficulty` leading zero hex digits over randomData+nonce) and
reuse the resulting auth cookie for the media requests.

    mirror_fetch.py --host HOST --video ID --itag N --out FILE [--jar FILE]
    mirror_fetch.py --host HOST --video ID --list
"""
import argparse
import hashlib
import http.cookiejar
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")


def opener(jar_path):
    jar = http.cookiejar.MozillaCookieJar(jar_path)
    if os.path.exists(jar_path):
        try:
            jar.load(ignore_discard=True, ignore_expires=True)
        except Exception:
            pass
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    op.addheaders = [("User-Agent", UA), ("Accept", "*/*")]
    return op, jar


def get(op, url, n=400000):
    try:
        r = op.open(url, timeout=60)
        return r.status, r.headers.get("Content-Type"), r.read(n)
    except urllib.error.HTTPError as e:
        return e.code, e.headers.get("Content-Type"), e.read(n)


def solve_anubis(op, jar, jar_path, base):
    """Solve the Anubis proof-of-work challenge if the site uses one."""
    st, ct, body = get(op, base + "/")
    html = body.decode("utf-8", "replace")
    m = re.search(r'id="anubis_challenge"[^>]*>(.*?)</script>', html, re.S)
    if not m:
        return False
    ch = json.loads(m.group(1))
    diff = ch["rules"]["difficulty"]
    rd = ch["challenge"]["randomData"]
    cid = ch["challenge"]["id"]
    nonce, pref, digest = 0, "0" * diff, ""
    while True:
        digest = hashlib.sha256((rd + str(nonce)).encode()).hexdigest()
        if digest.startswith(pref):
            break
        nonce += 1
    q = urllib.parse.urlencode({"id": cid, "response": digest, "nonce": nonce,
                                "redir": base + "/", "elapsedTime": "1200"})
    st2, _, _ = get(op, f"{base}/.within.website/x/cmd/anubis/api/pass-challenge?{q}")
    jar.save(ignore_discard=True, ignore_expires=True)
    print(f"[mirror] anubis solved (difficulty {diff}, nonce {nonce}, status {st2})",
          flush=True)
    return True


def api(op, base, vid):
    st, ct, body = get(op, f"{base}/api/v1/videos/{vid}?local=true", n=8 << 20)
    if "json" not in (ct or ""):
        raise SystemExit(f"instance did not return JSON (status {st}, {ct})")
    return json.loads(body)


def formats(info):
    out = {}
    for key in ("formatStreams", "adaptiveFormats"):
        for f in (info.get(key) or []):
            out.setdefault(int(f["itag"]), f)
    return out


def download(url, out, jar_path, tries=8):
    """Resumable curl download; returns True on success."""
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    for attempt in range(1, tries + 1):
        cmd = ["curl", "-sS", "-L", "--fail", "-C", "-",
               "--retry", "5", "--retry-delay", "5", "--retry-all-errors",
               "--max-time", "3600",
               "-b", jar_path, "-A", UA, "-o", out, url]
        r = subprocess.run(cmd)
        if r.returncode == 0 and os.path.exists(out) and os.path.getsize(out) > 0:
            return True
        print(f"[mirror] retry {attempt}/{tries} for {out}", flush=True)
    return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="invidious.f5.si")
    ap.add_argument("--video", default="9Pc6cHKB4B4")
    ap.add_argument("--itag", type=int)
    ap.add_argument("--out")
    ap.add_argument("--jar")
    ap.add_argument("--list", action="store_true")
    args = ap.parse_args()

    base = f"https://{args.host}"
    jar_path = args.jar or os.path.join("/tmp", f"mirror_{args.host}.jar")
    op, jar = opener(jar_path)
    solve_anubis(op, jar, jar_path, base)
    info = api(op, base, args.video)

    fmts = formats(info)
    if args.list or args.itag is None:
        print(f"{info.get('title')}  ({info.get('lengthSeconds')}s)")
        for it, f in sorted(fmts.items()):
            print(f"  itag {it:>4}  {str(f.get('resolution') or f.get('qualityLabel') or 'audio'):>8}"
                  f"  {f.get('container')}  {f.get('bitrate') or f.get('audioBitrate')}")
        return 0

    f = fmts.get(args.itag)
    if not f:
        raise SystemExit(f"itag {args.itag} not offered by {args.host}")
    if not args.out:
        raise SystemExit("--out is required with --itag")

    url = f["url"]
    print(f"[mirror] itag {args.itag} -> {args.out}", flush=True)
    ok = download(url, args.out, jar_path)
    if not ok:
        raise SystemExit("download failed")
    print(f"[mirror] wrote {args.out} ({os.path.getsize(args.out)} bytes)", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
