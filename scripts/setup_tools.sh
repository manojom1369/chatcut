#!/usr/bin/env bash
# Reproduce the toolchain used by this pipeline (everything lands in tools/,
# which is git-ignored because it is ~500 MB of third-party binaries).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p tools work logs models

# --- ffmpeg / ffprobe (static build) ---------------------------------
curl -L -o /tmp/ffmpeg.tar.xz \
  https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz
tar -C tools -xf /tmp/ffmpeg.tar.xz
mv tools/ffmpeg-*-static tools/ffmpeg-static
ln -sf "$PWD/tools/ffmpeg-static/ffmpeg"  tools/ffmpeg
ln -sf "$PWD/tools/ffmpeg-static/ffprobe" tools/ffprobe

# --- yt-dlp + a JS runtime (needed for YouTube's n/sig challenges) ----
curl -L -o tools/yt-dlp \
  https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp
chmod +x tools/yt-dlp
curl -L -o /tmp/deno.zip \
  https://github.com/denoland/deno/releases/latest/download/deno-x86_64-unknown-linux-gnu.zip
mkdir -p tools/deno && python3 -c "import zipfile;zipfile.ZipFile('/tmp/deno.zip').extractall('tools/deno')"
chmod +x tools/deno/deno

# --- python env ------------------------------------------------------
python3 -m venv tools/venv
./tools/venv/bin/pip install --trusted-host pypi.org \
  --trusted-host files.pythonhosted.org \
  numpy opencv-python-headless yt-dlp yt-dlp-ejs

# --- face detector (YuNet, ~230 KB) ----------------------------------
curl -L -o models/yunet.onnx \
  https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx

echo "done"
