#!/usr/bin/env bash
# Build a contact sheet so the framing of a render can be eyeballed quickly.
#   contact_sheet.sh IN.mp4 OUT.jpg [every_n_seconds] [cols] [rows]
set -euo pipefail
IN="$1"; OUT="$2"; EVERY="${3:-6}"; COLS="${4:-5}"; ROWS="${5:-2}"
FFMPEG="${FFMPEG:-/workspace/tools/ffmpeg}"
TILE_W=220
mkdir -p "$(dirname "$OUT")"
"$FFMPEG" -y -hide_banner -loglevel error -i "$IN" \
  -vf "fps=1/${EVERY},scale=${TILE_W}:-1,tile=${COLS}x${ROWS}" \
  -frames:v 1 -q:v 3 "$OUT"
echo "wrote $OUT"
