#!/usr/bin/env bash
# Optional: build the bgutil PO-token provider, which makes yt-dlp look like a
# normal client to YouTube (needed for the `web`/`mweb` player clients from a
# datacenter IP).  The HLS path used by fetch_until.sh does not need it, but it
# is required if you want the DASH renditions.
set -euo pipefail
cd "$(dirname "$0")/.."

git clone --depth 1 https://github.com/Brainicism/bgutil-ytdlp-pot-provider \
  tools/bgutil
cd tools/bgutil/server
npm ci --no-audit --no-fund
npx tsc
cd ../../..

# yt-dlp only picks up plugins from <config>/yt-dlp/plugins/<name>/yt_dlp_plugins
mkdir -p "$HOME/.config/yt-dlp/plugins"
rm -rf "$HOME/.config/yt-dlp/plugins/bgutil"
cp -r tools/bgutil/plugin "$HOME/.config/yt-dlp/plugins/bgutil"

echo "start the provider with: node tools/bgutil/server/build/main.js --port 4416"
