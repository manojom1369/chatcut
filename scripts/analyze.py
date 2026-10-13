#!/usr/bin/env python3
"""Analyse a source video: scene cuts, face ("hero") candidates, motion, loudness.

Outputs a single JSON document consumed by plan_cut.py.
"""
import argparse
import json
import os
import subprocess
import sys

import cv2
import numpy as np

FFMPEG = os.environ.get("FFMPEG", "/workspace/tools/ffmpeg")
YUNET = "/workspace/models/yunet.onnx"


def scene_cuts(video, threshold=0.32):
    """Return list of cut timestamps using ffmpeg's scene score."""
    cmd = [FFMPEG, "-hide_banner", "-nostats", "-i", video,
           "-filter_complex",
           f"select='gt(scene,{threshold})',metadata=print:file=-",
           "-an", "-f", "null", "-"]
    try:
        out = subprocess.run(cmd, capture_output=True, text=True,
                             timeout=1800).stdout
    except subprocess.TimeoutExpired:
        return []
    cuts = []
    for line in out.splitlines():
        line = line.strip()
        if line.startswith("pts_time:"):
            try:
                cuts.append(float(line.split(":", 1)[1]))
            except ValueError:
                pass
    return cuts


def loudness(video, hop=0.5, sr=8000):
    cmd = [FFMPEG, "-hide_banner", "-v", "error", "-i", video,
           "-ac", "1", "-ar", str(sr), "-f", "s16le", "-"]
    raw = subprocess.run(cmd, capture_output=True, timeout=1800).stdout
    a = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
    n = int(sr * hop)
    if len(a) < n:
        return [], 1.0
    m = len(a) // n
    frames = a[:m * n].reshape(m, n)
    rms = np.sqrt((frames ** 2).mean(axis=1))
    peak = float(np.abs(a).max()) or 1.0
    return [{"t": round(i * hop, 3), "rms": round(float(r), 6)}
            for i, r in enumerate(rms)], peak


def analyse_faces(video, target_fps=6.0, score_thresh=0.55):
    cap = cv2.VideoCapture(video)
    if not cap.isOpened():
        raise SystemExit(f"cannot open {video}")
    fps = cap.get(cv2.CAP_PROP_FPS) or 24.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    step = max(1, int(round(fps / target_fps)))

    det = None
    if os.path.exists(YUNET):
        det = cv2.FaceDetectorYN.create(YUNET, "", (w, h), score_thresh, 0.3, 5000)
    else:
        cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_frontalface_default.xml")

    samples = []
    prev_small = None
    idx = 0
    while True:
        ok = cap.grab()
        if not ok:
            break
        if idx % step == 0:
            ok, frame = cap.retrieve()
            if not ok:
                break
            t = idx / fps
            small = cv2.resize(frame, (160, 90), interpolation=cv2.INTER_AREA)
            gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY).astype(np.float32)
            if prev_small is not None:
                diff = np.abs(gray - prev_small)
                motion = float(diff.mean())
                mass = float(diff.sum())
                if mass > 1.0:
                    xs = np.arange(diff.shape[1], dtype=np.float32)[None, :]
                    motion_x = float((diff * xs).sum() / mass) / diff.shape[1]
                else:
                    motion_x = 0.5
            else:
                motion, motion_x = 0.0, 0.5
            prev_small = gray

            faces = []
            if det is not None:
                _, raw = det.detect(frame)
                if raw is not None:
                    for f in raw:
                        x, y, fw, fh = [float(v) for v in f[:4]]
                        sc = float(f[-1])
                        faces.append({"x": round(x / w, 4), "y": round(y / h, 4),
                                      "w": round(fw / w, 4), "h": round(fh / h, 4),
                                      "score": round(sc, 4)})
            else:
                gray_full = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                for (x, y, fw, fh) in cascade.detectMultiScale(gray_full, 1.15, 6,
                                                               minSize=(30, 30)):
                    faces.append({"x": round(x / w, 4), "y": round(y / h, 4),
                                  "w": round(fw / w, 4), "h": round(fh / h, 4),
                                  "score": 1.0})
            faces.sort(key=lambda d: -d["w"] * d["h"])
            samples.append({"i": len(samples), "t": round(t, 3),
                            "motion": round(motion, 3), "motion_x": round(motion_x, 4),
                            "faces": faces[:12]})
        idx += 1
    cap.release()
    return {"fps": fps, "width": w, "height": h, "frames": total,
            "sample_fps": fps / step, "samples": samples}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--sample-fps", type=float, default=6.0)
    ap.add_argument("--skip-scenes", action="store_true")
    args = ap.parse_args()

    print("[analyze] faces/motion ...", flush=True)
    base = analyse_faces(args.video, args.sample_fps)
    print(f"[analyze] {len(base['samples'])} samples", flush=True)

    if not args.skip_scenes:
        print("[analyze] scene cuts ...", flush=True)
        base["cuts"] = scene_cuts(args.video)
        print(f"[analyze] {len(base['cuts'])} cuts", flush=True)

    print("[analyze] loudness ...", flush=True)
    loud, peak = loudness(args.video)
    base["loudness"] = loud
    base["audio_peak"] = peak

    base["video"] = os.path.abspath(args.video)
    with open(args.out, "w") as fh:
        json.dump(base, fh)
    print("[analyze] wrote", args.out, flush=True)


if __name__ == "__main__":
    sys.exit(main())
