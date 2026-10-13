#!/usr/bin/env bash
# One command: source file in, 59 s 9:16 hero-tracked edit out.
#
#   scripts/ingest.sh --src FILE [--hires FILE] [--out FILE]
#                     [--start SECONDS] [--duration SECONDS]
#                     [--hero-hint 0..1] [--sample-fps N] [--reuse]
#
# --src    the file used to *analyse* the video (any resolution is fine).
# --hires  optional higher-resolution copy of the same video used for the
#          actual render; the crop trajectory is resolution independent, so a
#          plan measured on a 480p proxy renders correctly from a 4K master.
#          Defaults to --src.
#
# Example:
#   scripts/ingest.sh --src ~/Downloads/steppamaar_480p.mp4 \
#                     --hires ~/Downloads/steppamaar_2160p.mp4 \
#                     --out out/steppamaar_9x16_59s.mp4
set -euo pipefail
cd "$(dirname "$0")/.."

FFPROBE=tools/ffprobe
PY=tools/venv/bin/python
SRC=""; HIRES=""; OUT="out/short_9x16_59s.mp4"
START=""; DURATION=59; HERO=0.5; SAMPLE_FPS=6; REUSE=0

while [ $# -gt 0 ]; do
  case "$1" in
    --src) SRC="$2"; shift 2;;
    --hires) HIRES="$2"; shift 2;;
    --out) OUT="$2"; shift 2;;
    --start) START="$2"; shift 2;;
    --duration) DURATION="$2"; shift 2;;
    --hero-hint) HERO="$2"; shift 2;;
    --sample-fps) SAMPLE_FPS="$2"; shift 2;;
    --reuse) REUSE=1; shift;;
    -h|--help) sed -n '2,20p' "$0"; exit 0;;
    *) echo "unknown option: $1" >&2; exit 2;;
  esac
done

[ -n "$SRC" ] || { echo "error: --src is required" >&2; exit 2; }
[ -f "$SRC" ] || { echo "error: no such file: $SRC" >&2; exit 2; }
HIRES="${HIRES:-$SRC}"
[ -f "$HIRES" ] || { echo "error: no such file: $HIRES" >&2; exit 2; }

probe() {  # probe FILE -> "W,H" / duration / fps / hasaudio
  "$FFPROBE" -v error -select_streams v:0 \
    -show_entries stream=width,height -of csv=p=0 "$1"
  "$FFPROBE" -v error -show_entries format=duration -of csv=p=0 "$1"
  "$FFPROBE" -v error -select_streams v:0 -show_entries stream=r_frame_rate \
    -of csv=p=0 "$1"
  n=$("$FFPROBE" -v error -select_streams a -show_entries stream=index -of csv=p=0 "$1" | wc -l)
  [ "$n" -gt 0 ] && echo yes || echo no
}

mapfile -t S < <(probe "$SRC")
GEOM="${S[0]}"; SDUR="${S[1]}"; SFPS="${S[2]}"; SAUD="${S[3]}"
SW="${GEOM%%,*}"; SH="${GEOM##*,}"

mapfile -t H < <(probe "$HIRES")
HGEOM="${H[0]}"

echo "[ingest] analyse source : $SRC  (${SW}x${SH}, ${SFPS} fps, ${SDUR}s, audio=$SAUD)"
echo "[ingest] render source  : $HIRES  (${HGEOM})"

if [ "$SW" -le "$SH" ]; then
  echo "error: source is ${SW}x${SH} — this pipeline crops a landscape frame" >&2
  echo "       down to 9:16; it cannot widen a portrait source." >&2
  exit 3
fi

awk -v d="$SDUR" -v want="$DURATION" 'BEGIN{ if (d+0 < want+0) exit 1 }' || {
  echo "warning: source is only ${SDUR}s long, output will be shorter than ${DURATION}s" >&2
}

mkdir -p work "$(dirname "$OUT")"

if [ "$REUSE" = 1 ] && [ -f work/analysis.json ] && [ -f work/plan.json ]; then
  echo "[ingest] reusing existing work/analysis.json and work/plan.json"
else
  echo "[ingest] 1/3 analysing (scene cuts, faces, motion, loudness)"
  "$PY" scripts/analyze.py --video "$SRC" --out work/analysis.json \
    --sample-fps "$SAMPLE_FPS"

  echo "[ingest] 2/3 choosing the ${DURATION}s window and building the hero track"
  PLAN_ARGS=(--analysis work/analysis.json --out work/plan.json \
             --duration "$DURATION" --hero-hint "$HERO")
  [ -n "$START" ] && PLAN_ARGS+=(--start "$START")
  "$PY" scripts/plan_cut.py "${PLAN_ARGS[@]}"
fi

echo "[ingest] 3/3 rendering"
bash scripts/render.sh work/plan.json "$HIRES" "$OUT"

bash scripts/verify.sh "$OUT"
echo "[ingest] done -> $OUT"
