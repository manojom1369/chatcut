#!/usr/bin/env bash
# Polls the YouTube video CDN to find out when this egress stops returning 403.
cd /workspace || exit 1
export PATH=/workspace/tools/deno:$PATH
while true; do
  timeout 45 ./tools/yt-dlp --js-runtimes deno -f 602 --print urls \
    'https://www.youtube.com/watch?v=9Pc6cHKB4B4' > /tmp/probe_murl.txt 2>/dev/null
  if [ -s /tmp/probe_murl.txt ]; then
    curl -s --max-time 20 "$(cat /tmp/probe_murl.txt)" -o /tmp/probe.m3u8
    S=$(grep -oE 'https://[^"]+' /tmp/probe.m3u8 | sed -n '2p')
    C=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -L "$S")
  else
    C="no-manifest"
  fi
  echo "$(date +%H:%M:%S) seg=$C"
  sleep 300
done
