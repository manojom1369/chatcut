#!/usr/bin/env python3
"""Draw the planned crop window over source frames, as a review montage.

    framing_overlay.py --plan work/plan.json --video SRC --out work/framing.jpg

Each tile is a source frame with the 9:16 crop rectangle the renderer will use
at that instant, so the hero tracking can be checked at a glance.
"""
import argparse
import json

import cv2
import numpy as np


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--plan", required=True)
    ap.add_argument("--video", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--tiles", type=int, default=8)
    ap.add_argument("--cols", type=int, default=4)
    args = ap.parse_args()

    plan = json.load(open(args.plan))
    cap = cv2.VideoCapture(args.video)
    fps = cap.get(cv2.CAP_PROP_FPS) or plan["fps"]
    n = int(plan["duration"] * plan["fps"])

    idx = np.linspace(0, n - 1, args.tiles).astype(int)
    tiles = []
    for k in idx:
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(k))
        ok, frame = cap.read()
        if not ok:
            continue
        h, w = frame.shape[:2]
        cw = int(2 * np.floor(h * 9 / 32))
        ch = int(2 * np.floor(h / 2))
        xn = plan["frame_x_norm"][min(int(k), len(plan["frame_x_norm"]) - 1)]
        x = int(round(xn * (w - cw)))
        cv2.rectangle(frame, (x, 0), (x + cw, ch - 1), (0, 0, 255), max(2, w // 300))
        cv2.rectangle(frame, (x, 0), (x + cw, ch - 1), (255, 255, 255), max(1, w // 600))
        label = f"{plan['start'] + k / plan['fps']:.1f}s  x={x}"
        cv2.rectangle(frame, (0, 0), (int(w * 0.34), int(h * 0.075)), (0, 0, 0), -1)
        cv2.putText(frame, label, (int(w * 0.012), int(h * 0.055)),
                    cv2.FONT_HERSHEY_SIMPLEX, h / 700, (255, 255, 255), max(1, h // 500))
        tiles.append(cv2.resize(frame, (480, 270)))
    cap.release()

    while len(tiles) % args.cols:
        tiles.append(np.zeros_like(tiles[0]))
    rows = [np.hstack(tiles[i:i + args.cols]) for i in range(0, len(tiles), args.cols)]
    sheet = np.vstack(rows)
    cv2.imwrite(args.out, sheet)
    print("wrote", args.out)


if __name__ == "__main__":
    main()
