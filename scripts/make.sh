#!/usr/bin/env bash
# End-to-end build of the 59 s 9:16 edit.
#
#   make.sh [stage]      stages: probe analyse plan slice render all
set -u
cd /workspace || exit 1
STAGE="${1:-all}"
URL="https://www.youtube.com/watch?v=9Pc6cHKB4B4"
PY=/workspace/tools/venv/bin/python
PROXY_ITAG="${PROXY_ITAG:-231}"   # 480p avc1, used for analysis
SRC_ITAG="${SRC_ITAG:-620}"       # 1440p vp9, used for the render

run() { echo "--- $* ---"; "$@"; }

if [ "$STAGE" = all ] || [ "$STAGE" = probe ]; then
  bash scripts/fetch_until.sh "$PROXY_ITAG" work/proxy480.mp4 work/parts480
fi

if [ "$STAGE" = all ] || [ "$STAGE" = analyse ]; then
  run "$PY" scripts/analyze.py --video work/proxy480.mp4 --out work/analysis.json
fi

if [ "$STAGE" = all ] || [ "$STAGE" = plan ]; then
  run "$PY" scripts/plan_cut.py --analysis work/analysis.json --out work/plan.json
fi

if [ "$STAGE" = all ] || [ "$STAGE" = slice ]; then
  read -r S D < <("$PY" -c "import json;p=json.load(open('work/plan.json'));print(max(0,p['start']-6), p['duration']+12)")
  bash scripts/slice_hls.sh "$SRC_ITAG" work/slice.mp4 "$S" "$D"
  run "$PY" scripts/analyze.py --video work/slice.mp4 --out work/slice_analysis.json
  run "$PY" scripts/plan_cut.py --analysis work/slice_analysis.json --out work/slice_plan.json
fi

if [ "$STAGE" = all ] || [ "$STAGE" = render ]; then
  run bash scripts/render.sh work/slice_plan.json work/slice.mp4 out/short_9x16_59s.mp4
fi
