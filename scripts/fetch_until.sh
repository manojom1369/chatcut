#!/usr/bin/env bash
# Keep trying to download a full HLS rendition until it succeeds.
# Re-mints the media playlist each round (URLs expire, CDN blocks are
# intermittent) while reusing already-downloaded fragments.
#
#   fetch_until.sh ITAG OUT WORKDIR
set -u
ITAG="$1"; OUT="$2"; WD="$3"
URL="https://www.youtube.com/watch?v=9Pc6cHKB4B4"
cd /workspace || exit 1
export PATH=/workspace/tools/deno:$PATH
PY=/workspace/tools/venv/bin/python

round=0
while [ ! -s "$OUT" ]; do
  round=$((round + 1))
  echo "=== round $round $(date +%H:%M:%S) ==="
  if timeout 90 ./tools/yt-dlp --js-runtimes deno -f "$ITAG" --print urls "$URL" \
       > "work/m_${ITAG}.txt" 2>/dev/null && [ -s "work/m_${ITAG}.txt" ]; then
    "$PY" scripts/hls_fetch.py \
      --manifest-url "$(cat work/m_${ITAG}.txt)" \
      --out "$OUT" --workdir "$WD" \
      --delay 0.8 --tries 3 --base-sleep 5 || true
  else
    echo "manifest mint failed"
  fi
  [ -s "$OUT" ] && break
  sleep 60
done
echo "done $OUT $(stat -c%s "$OUT") bytes"
