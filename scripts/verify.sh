#!/usr/bin/env bash
# Sanity-check a finished render: container, duration, geometry, audio, and a
# contact sheet for eyeballing the framing.
set -euo pipefail
IN="${1:-out/short_9x16_59s.mp4}"
FFPROBE="${FFPROBE:-/workspace/tools/ffprobe}"
FFMPEG="${FFMPEG:-/workspace/tools/ffmpeg}"

[ -f "$IN" ] || { echo "missing $IN"; exit 1; }

echo "== $IN =="
ls -l "$IN" | awk '{printf "size: %.1f MB\n", $5/1048576}'
"$FFPROBE" -v error -show_entries \
  format=duration,bit_rate:stream=index,codec_type,codec_name,width,height,r_frame_rate,duration \
  -of default=noprint_wrappers=1 "$IN"

# framing over time: mean horizontal position of the brightest/most "subject"
# column is not meaningful, so just dump frames for a visual check
echo "== contact sheet =="
bash "$(dirname "$0")/contact_sheet.sh" "$IN" "${IN%.mp4}.sheet.jpg" 6 5 2
