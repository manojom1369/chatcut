#!/usr/bin/env bash
# Render the 59 s 9:16 edit using the crop trajectory from plan.json.
#
#   render.sh [plan.json] [source.mp4] [out.mp4]
set -euo pipefail

PLAN="${1:-work/plan.json}"
SRC="${2:-work/src2160.mp4}"
OUT="${3:-out/short_9x16_59s.mp4}"

FFMPEG="${FFMPEG:-/workspace/tools/ffmpeg}"
PY="${PY:-/workspace/tools/venv/bin/python}"

# plan values, one per line, in a fixed order (no shell quoting games)
mapfile -t V < <("$PY" - "$PLAN" <<'PYEOF'
import json, sys
p = json.load(open(sys.argv[1]))
for k in ("start", "duration", "crop_w", "crop_h", "out_w", "out_h", "fps",
              "source_start"):
    print(p[k])
print(p["crop_x_expression"])
PYEOF
)
START="${V[0]}"; DUR="${V[1]}"; CW="${V[2]}"; CH="${V[3]}"
OW="${V[4]}"; OH="${V[5]}"; FPS="${V[6]}"; SRCSTART="${V[7]}"; EXPR="${V[8]}"
SEEK="$("$PY" -c "print(max(0.0, $START - $SRCSTART))")"

mkdir -p "$(dirname "$OUT")"
echo "[render] window ${START}s  seek ${SEEK}s +${DUR}s  crop ${CW}x${CH} -> ${OW}x${OH}"

# The crop x expression contains commas, so it is quoted inside the filter
# graph (ffmpeg filter-description level quoting).
"$FFMPEG" -y -hide_banner -loglevel warning -stats \
  -ss "$SEEK" -t "$DUR" -i "$SRC" \
  -filter_complex "[0:v]fps=${FPS},crop=${CW}:${CH}:x='${EXPR}':y=0,scale=${OW}:${OH}:flags=lanczos,setsar=1[v]" \
  -map "[v]" -map 0:a:0? \
  -c:v libx264 -preset medium -crf 18 -profile:v high -pix_fmt yuv420p \
  -x264-params "keyint=48:min-keyint=24:scenecut=0" \
  -c:a aac -b:a 192k -ar 48000 \
  -movflags +faststart \
  "$OUT"

echo "[render] wrote $OUT"
"$FFMPEG" -hide_banner -i "$OUT" 2>&1 | grep -E 'Duration|Stream' || true
