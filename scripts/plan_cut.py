#!/usr/bin/env python3
"""Pick the 59 s window and build the "hero" tracking crop trajectory.

Reads analysis.json (see analyze.py), writes plan.json: the chosen window plus
the ffmpeg crop-x expression used by render.sh.

The source is 16:9 and the target is 9:16, so the crop keeps the full frame
height and pans horizontally only:

    crop_h = src_h
    crop_w = round(src_h * 9 / 16)
    x(t)   in [0, src_w - crop_w]

The hero track is built shot by shot (a shot ends at every detected scene
cut) so that smoothing never smears motion across a cut.
"""
import argparse
import json
import math

DURATION = 59.0
OUT_FPS = 24.0
OUT_W, OUT_H = 1080, 1920
SEG = 0.25  # seconds per piecewise-linear crop segment


def interp(times, values, t):
    """Linear interpolation with clamping."""
    if not times:
        return values[0] if values else 0.0
    if t <= times[0]:
        return values[0]
    if t >= times[-1]:
        return values[-1]
    lo, hi = 0, len(times) - 1
    while hi - lo > 1:
        mid = (lo + hi) // 2
        if times[mid] <= t:
            lo = mid
        else:
            hi = mid
    span = times[hi] - times[lo]
    if span <= 0:
        return values[lo]
    f = (t - times[lo]) / span
    return values[lo] + (values[hi] - values[lo]) * f


def smooth(values, fps, sigma_s, median_s):
    """Median then gaussian smoothing (no scipy dependency)."""
    n = len(values)
    if n == 0:
        return values
    k = max(1, int(median_s * fps) | 1)
    half = k // 2
    med = []
    for i in range(n):
        lo, hi = max(0, i - half), min(n, i + half + 1)
        w = sorted(values[lo:hi])
        med.append(w[len(w) // 2])
    sigma = max(1e-3, sigma_s * fps)
    rad = int(3 * sigma)
    kernel = [math.exp(-0.5 * (i / sigma) ** 2) for i in range(-rad, rad + 1)]
    s = sum(kernel)
    kernel = [v / s for v in kernel]
    out = []
    for i in range(n):
        acc = 0.0
        for j, kv in enumerate(kernel):
            idx = min(n - 1, max(0, i + j - rad))
            acc += med[idx] * kv
        out.append(acc)
    return out


def limit_speed(values, fps, max_per_s):
    out = list(values)
    lim = max_per_s / fps
    for i in range(1, len(out)):
        d = out[i] - out[i - 1]
        if abs(d) > lim:
            out[i] = out[i - 1] + math.copysign(lim, d)
    return smooth(out, fps, 0.35, 0.4)


def build_hero_track(samples, t0, t1, hero_hint, cuts):
    """Sticky face tracker, restarted at every scene cut.

    Returns (times, centres, present, shot) where `shot` is the index of the
    shot each sample belongs to.
    """
    times, centres, present, shots = [], [], [], []
    prev_x, prev_w = None, None
    shot = 0
    cut_times = [c for c in cuts if t0 < c < t1]
    ci = 0
    for s in samples:
        if s["t"] < t0 - 0.001 or s["t"] > t1 + 0.001:
            continue
        while ci < len(cut_times) and cut_times[ci] <= s["t"]:
            shot += 1
            prev_x, prev_w = None, None  # re-acquire after the cut
            ci += 1
        faces = [f for f in s["faces"] if f["score"] >= 0.6]
        pick = None
        if faces:
            if prev_x is None:
                pick = max(faces, key=lambda f: (f["w"] * f["h"])
                           - 0.15 * abs(f["x"] + f["w"] / 2 - hero_hint))
            else:
                best, best_cost = None, 1e9
                for f in faces:
                    cx = f["x"] + f["w"] / 2
                    cy = f["y"] + f["h"] / 2
                    cost = abs(cx - prev_x) * 3.0 + abs(cy - 0.5) * 0.4
                    if prev_w:
                        cost += abs(f["w"] / prev_w - 1.0) * 0.8
                    if cost < best_cost:
                        best, best_cost = f, cost
                if best_cost < 0.55:
                    pick = best
        if pick is not None:
            prev_x = pick["x"] + pick["w"] / 2
            prev_w = pick["w"]
            centres.append(prev_x)
            present.append(1.0)
        else:
            centres.append(prev_x if prev_x is not None else hero_hint)
            present.append(0.0)
        times.append(s["t"])
        shots.append(shot)
    return times, centres, present, shots


def track_to_crop(times, centres, shots, present, src_w, crop_w, max_x, fps_s):
    """Convert normalised hero centres into a smoothed, speed-limited crop x."""
    det = sum(present) / len(present) if present else 0.0
    raw = [min(max(cx * src_w - crop_w / 2.0, 0.0), float(max_x)) for cx in centres]

    out = list(raw)
    start = 0
    for i in range(1, len(shots) + 1):
        if i == len(shots) or shots[i] != shots[start]:
            seg = raw[start:i]
            if len(seg) >= 2:
                seg = smooth(seg, fps_s, sigma_s=0.55, median_s=0.5)
                seg = limit_speed(seg, fps_s, max_per_s=max_x * 0.30)
            out[start:i] = seg
            start = i
    return out, det


def _balanced_sum(terms):
    """Sum terms as a balanced binary tree: keeps ffmpeg's expression parser
    shallow (it chokes on ~100 levels of nesting)."""
    if not terms:
        return "0"
    while len(terms) > 1:
        nxt = []
        for i in range(0, len(terms) - 1, 2):
            nxt.append("(" + terms[i] + "+" + terms[i + 1] + ")")
        if len(terms) % 2:
            nxt.append(terms[-1])
        terms = nxt
    return terms[0]


def crop_expression(seg_x, dur, fps):
    """Piecewise-linear crop x as a flat sum of clamped ramps."""
    n_seg = len(seg_x) - 1
    terms = []
    for i in range(n_seg):
        d = seg_x[i + 1] - seg_x[i]
        if abs(d) < 0.05:
            continue
        n0 = int(round(i * dur / n_seg * fps))
        n1 = int(round((i + 1) * dur / n_seg * fps))
        dn = max(1, n1 - n0)
        terms.append(f"({d:.1f}*min(max((n-{n0})/{dn},0),1))")
    if not terms:
        return f"{seg_x[0]:.1f}"
    return f"{seg_x[0]:.1f}+" + _balanced_sum(terms)


def score_windows(samples, cuts, loud_at, dur, dur_total):
    def face_frac(t0, t1):
        sel = [s for s in samples if t0 <= s["t"] <= t1]
        if not sel:
            return 0.0
        return sum(1 for s in sel
                   if any(f["score"] >= 0.6 for f in s["faces"])) / len(sel)

    def cut_density(t0, t1):
        return sum(1 for c in cuts if t0 <= c <= t1)

    cands = [c for c in cuts if c + dur <= dur_total - 0.5]
    cands += [x * 5.0 for x in range(0, int((dur_total - dur) // 5) + 1)]
    best, best_score = 0.0, -1e9
    for c in sorted(set(round(v, 2) for v in cands)):
        if c + dur > dur_total:
            continue
        l = sum(loud_at(c + i * 0.5) for i in range(int(dur * 2))) / (dur * 2)
        f = face_frac(c, c + dur)
        cd = cut_density(c, c + dur)
        cd_score = 1.0 - min(1.0, abs(cd - 20) / 40.0)
        snap = 0.06 if any(abs(c - cc) < 0.15 for cc in cuts) else 0.0
        score = 0.55 * l + 0.32 * f + 0.13 * cd_score + snap
        if score > best_score:
            best, best_score = c, score
    return best


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--analysis", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--start", type=float, default=None)
    ap.add_argument("--duration", type=float, default=DURATION)
    ap.add_argument("--hero-hint", type=float, default=0.5)
    ap.add_argument("--source-start", type=float, default=0.0,
                    help="absolute time of the first frame of the source file")
    args = ap.parse_args()

    a = json.load(open(args.analysis))
    samples = a["samples"]
    src_w, src_h = a["width"], a["height"]
    dur_total = a["frames"] / a["fps"]
    dur = min(args.duration, dur_total)

    crop_w = int(round(src_h * OUT_W / OUT_H))
    crop_w -= crop_w % 2
    max_x = max(0, src_w - crop_w)

    loud_t = sorted(round(l["t"], 3) for l in a.get("loudness", []))
    loud_v = [l["rms"] for l in a.get("loudness", [])]
    peak = max(loud_v) if loud_v else 1.0

    def loud_at(t):
        if not loud_t:
            return 0.0
        return interp(loud_t, loud_v, t) / (peak or 1.0)

    cuts = sorted(a.get("cuts", []))
    start = args.start if args.start is not None else score_windows(
        samples, cuts, loud_at, dur, dur_total)
    start = max(0.0, min(start, max(0.0, dur_total - dur)))
    t1 = start + dur

    htimes, hcentres, present, shots = build_hero_track(
        samples, start, t1, args.hero_hint, cuts)
    if not htimes:
        htimes, hcentres, present, shots = [start, t1], [args.hero_hint] * 2, [0.0, 0.0], [0, 0]

    fps_s = a["sample_fps"]
    xs, det_ratio = track_to_crop(htimes, hcentres, shots, present,
                                  src_w, crop_w, max_x, fps_s)
    if det_ratio < 0.15:
        xs = [max_x / 2.0] * len(xs)

    n_frames = int(round(dur * OUT_FPS))
    frame_x = [interp(htimes, xs, start + (i + 0.5) / OUT_FPS)
               for i in range(n_frames)]

    n_seg = max(1, int(round(dur / SEG)))
    seg_x = [interp(htimes, xs, start + i * dur / n_seg) for i in range(n_seg + 1)]
    expr = crop_expression(seg_x, dur, OUT_FPS)

    plan = {
        "source": a["video"],
        "source_w": src_w,
        "source_h": src_h,
        "start": round(start, 3),
        "source_start": round(args.source_start, 3),
        "duration": round(dur, 3),
        "out_w": OUT_W,
        "out_h": OUT_H,
        "fps": OUT_FPS,
        "crop_w": crop_w,
        "crop_h": src_h,
        "max_x": max_x,
        "shots_in_window": len(set(shots)),
        "hero_detection_ratio": round(det_ratio, 3),
        "x_min": round(min(frame_x), 1),
        "x_max": round(max(frame_x), 1),
        "crop_x_expression": expr,
        "frame_x": [round(v, 1) for v in frame_x],
    }
    with open(args.out, "w") as fh:
        json.dump(plan, fh, indent=1)
    print(f"[plan] window {start:.2f}s .. {t1:.2f}s  crop {crop_w}x{src_h} "
          f"x {plan['x_min']}..{plan['x_max']}  shots {plan['shots_in_window']} "
          f"hero-det {det_ratio:.0%}")
    print("[plan] wrote", args.out)


if __name__ == "__main__":
    main()
