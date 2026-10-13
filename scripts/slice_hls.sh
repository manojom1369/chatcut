#!/usr/bin/env bash
# Grab a short window straight out of a YouTube HLS rendition, so we only
# download the segments we actually need.
#
#   slice_hls.sh ITAG OUT START LEN
# START/LEN are in seconds and are only approximate: ffmpeg starts on a
# segment boundary, so callers should re-analyse the slice afterwards.
set -u
ITAG="$1"; OUT="$2"; START="$3"; LEN="$4"
URL="https://www.youtube.com/watch?v=9Pc6cHKB4B4"
FFMPEG="${FFMPEG:-/workspace/tools/ffmpeg}"
cd /workspace || exit 1
export PATH=/workspace/tools/deno:$PATH

round=0
while [ ! -s "$OUT" ]; do
  round=$((round + 1))
  echo "=== slice round $round $(date +%H:%M:%S) ==="
  if timeout 90 ./tools/yt-dlp --js-runtimes deno -f "$ITAG" --print urls "$URL" \
       > "work/ms_${ITAG}.txt" 2>/dev/null && [ -s "work/ms_${ITAG}.txt" ]; then
    MURL="$(cat work/ms_${ITAG}.txt)"
    rm -f "$OUT.part"
    "$FFMPEG" -y -hide_banner -loglevel warning \
      -ss "$START" -t "$LEN" -i "$MURL" -c copy \
      -movflags +faststart "$OUT.part" && mv "$OUT.part" "$OUT"
  else
    echo "manifest mint failed"
  fi
  [ -s "$OUT" ] && break
  sleep 60
done
echo "done $OUT $(stat -c%s "$OUT") bytes"
