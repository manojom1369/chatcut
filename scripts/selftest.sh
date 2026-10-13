#!/usr/bin/env bash
# End-to-end self test: synthesise a landscape clip containing a subject that
# sweeps across the frame, feed the planner a matching face track, render the
# 9:16 cut and check the subject ends up centred in the portrait output.
set -euo pipefail
cd "$(dirname "$0")/.."
FFMPEG=tools/ffmpeg
FFPROBE=tools/ffprobe
PY=tools/venv/bin/python
W=1920; H=1080; DUR=70; BOXW=160; BOXH=200; BOXY=400

mkdir -p work

# 1. source: orange box sweeping left->right->left over a dark background
echo "[1/4] generating synthetic source"
"$FFMPEG" -y -v error \
  -f lavfi -i "color=c=0x102030:s=${W}x${H}:r=24:d=${DUR}" \
  -f lavfi -i "color=c=orange:s=${BOXW}x${BOXH}:r=24:d=${DUR}" \
  -f lavfi -i "sine=frequency=440:duration=${DUR}" \
  -filter_complex "[0:v][1:v]overlay=x='if(lt(t,35),${W}*(0.25+0.5*t/35)-${BOXW}/2,${W}*(0.75-0.5*(t-35)/35)-${BOXW}/2)':y=${BOXY}[v]" \
  -map "[v]" -map 2:a -c:v libx264 -preset ultrafast -crf 26 -pix_fmt yuv420p \
  -c:a aac -b:a 96k work/selftest_src.mp4

# 2. matching analysis document
echo "[2/4] writing matching analysis"
"$PY" - <<PYEOF
import json
W, H, BOXW, BOXH, BOXY = $W, $H, $BOXW, $BOXH, $BOXY
samples = []
for i in range(int($DUR * 6)):
    t = i / 6.0
    cx = 0.25 + 0.5 * (t / 35) if t < 35 else 0.75 - 0.5 * ((t - 35) / 35)
    w, h = BOXW / W, BOXH / H
    samples.append({"i": i, "t": round(t, 3), "motion": 1.0, "motion_x": round(cx, 4),
                    "faces": [{"x": round(cx - w / 2, 4), "y": round(BOXY / H, 4),
                               "w": round(w, 4), "h": round(h, 4), "score": 0.95}]})
json.dump({"fps": 24, "width": W, "height": H, "frames": $DUR * 24, "sample_fps": 6.0,
           "samples": samples, "cuts": [],
           "loudness": [{"t": round(i * 0.5, 3), "rms": 0.5} for i in range($DUR * 2)],
           "audio_peak": 1.0, "video": "selftest"},
          open("work/selftest_analysis.json", "w"))
PYEOF

# 3. plan + render
echo "[3/4] planning + rendering"
"$PY" scripts/plan_cut.py --analysis work/selftest_analysis.json \
  --out work/selftest_plan.json --start 0 --duration 59 >/dev/null
bash scripts/render.sh work/selftest_plan.json work/selftest_src.mp4 \
  work/selftest_out.mp4

# 4. checks
echo "[4/4] checks"
bash scripts/contact_sheet.sh work/selftest_out.mp4 work/selftest_sheet.jpg 5 6 2 >/dev/null
D=$("$FFPROBE" -v error -show_entries format=duration -of csv=p=0 work/selftest_out.mp4)
RES=$("$FFPROBE" -v error -select_streams v:0 -show_entries stream=width,height \
      -of csv=p=0 work/selftest_out.mp4)
AUD=$("$FFPROBE" -v error -select_streams a:0 -show_entries stream=codec_name \
      -of csv=p=0 work/selftest_out.mp4)
echo "duration=$D resolution=$RES audio=$AUD"
[ "$RES" = "1080,1920" ] || { echo "FAIL: resolution"; exit 1; }
case "$D" in 59.*) ;; *) echo "FAIL: duration $D"; exit 1;; esac
[ -n "$AUD" ] || { echo "FAIL: no audio"; exit 1; }

# the box should sit near the centre of every sampled output frame
echo "centre check:"
"$PY" - <<'PYEOF'
import cv2, numpy as np, sys
cap = cv2.VideoCapture("work/selftest_out.mp4")
ok, worst = True, 0.0
for n in range(0, 1416, 59):
    cap.set(cv2.CAP_PROP_POS_FRAMES, n)
    r, f = cap.read()
    if not r:
        continue
    m = (f[:, :, 2].astype(int) - f[:, :, 0].astype(int)) > 60   # orange in BGR
    xs = np.where(m.any(axis=0))[0]
    if len(xs) == 0:
        print(f"  frame {n:4d}: box not visible")
        continue
    c = (xs.min() + xs.max()) / 2 / f.shape[1]
    worst = max(worst, abs(c - 0.5))
    print(f"  frame {n:4d}: box centre at {c:.3f} of frame width")
print(f"worst deviation from centre: {worst:.3f}")
sys.exit(0 if worst < 0.10 else 1)
PYEOF
echo "SELFTEST PASS"
