#!/usr/bin/env bash
# Render the 9:16 edit using the crop trajectory from plan.json.
#
#   render.sh [plan.json] [source.mp4] [out.mp4]
#
# The crop is expressed in normalised units (0..1 across the available pan
# range) and resolved against the *render* source's own dimensions, so a plan
# computed from a 480p analysis proxy renders correctly from a 4K master.
set -euo pipefail

PLAN="${1:-work/plan.json}"
SRC="${2:-work/source.mp4}"
OUT="${3:-out/short_9x16_59s.mp4}"

FFMPEG="${FFMPEG:-/workspace/tools/ffmpeg}"
PY="${PY:-/workspace/tools/venv/bin/python}"

mapfile -t V < <("$PY" - "$PLAN" <<'PYEOF'
import json, sys
p = json.load(open(sys.argv[1]))
for k in ("start", "duration", "out_w", "out_h", "fps", "source_start"):
    print(p[k])
print(p["crop_x_norm_expression"])
PYEOF
)
START="${V[0]}"; DUR="${V[1]}"; OW="${V[2]}"; OH="${V[3]}"
FPS="${V[4]}"; SRCSTART="${V[5]}"; EXPR="${V[6]}"
SEEK="$("$PY" -c "print(max(0.0, $START - $SRCSTART))")"

# crop width/height derived from the render source at filter-init time
CW='2*floor(in_h*9/32)'
CH='2*floor(in_h/2)'

mkdir -p "$(dirname "$OUT")"
echo "[render] window ${START}s  seek ${SEEK}s +${DUR}s -> ${OW}x${OH}"

"$FFMPEG" -y -hide_banner -loglevel warning -stats \
  -ss "$SEEK" -t "$DUR" -i "$SRC" \
  -filter_complex "[0:v]fps=${FPS},crop=w='${CW}':h='${CH}':x='(${EXPR})*(in_w-(${CW}))':y=0,scale=${OW}:${OH}:flags=lanczos,setsar=1[v]" \
  -map "[v]" -map 0:a:0? \
  -c:v libx264 -preset medium -crf 18 -profile:v high -pix_fmt yuv420p \
  -x264-params "keyint=48:min-keyint=24:scenecut=0" \
  -c:a aac -b:a 192k -ar 48000 \
  -movflags +faststart \
  "$OUT"

echo "[render] wrote $OUT"
"$FFMPEG" -hide_banner -i "$OUT" 2>&1 | grep -E 'Duration|Stream' || true
