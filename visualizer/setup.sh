#!/usr/bin/env bash
# Bootstrap the render toolchain inside this repo (idempotent).
set -e
cd "$(dirname "$0")/.."

PY=python3
VENV="$PWD/venv"

if [ ! -x "$VENV/bin/python" ]; then
    echo "[setup] creating venv"
    $PY -m venv "$VENV"
fi

echo "[setup] installing python deps"
"$VENV/bin/pip" install -q --upgrade pip
"$VENV/bin/pip" install -q numpy scipy opencv-python-headless pillow librosa soundfile imageio-ffmpeg

# static ffmpeg on PATH (imageio-ffmpeg ships a build with libx264 + aac)
FF="$("$VENV/bin/python" -c 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())')"
ln -sf "$FF" "$VENV/bin/ffmpeg"

# Poppins Bold (latin, 700) from the @fontsource npm package
FONTDIR="$PWD/visualizer/assets/fonts"
mkdir -p "$FONTDIR"
if [ ! -f "$FONTDIR/poppins-latin-700-normal.woff2" ]; then
    echo "[setup] downloading Poppins Bold"
    cd /tmp
    TB=$(curl -s https://registry.npmjs.org/@fontsource/poppins/latest | "$VENV/bin/python" -c "import json,sys; print(json.load(sys.stdin)['dist']['tarball'])")
    curl -s "$TB" -o pops.tgz
    tar xzf pops.tgz package/files/poppins-latin-700-normal.woff2
    cp package/files/poppins-latin-700-normal.woff2 "$FONTDIR/"
fi

echo "[setup] done"
"$VENV/bin/python" -c "import numpy, cv2, scipy, PIL, librosa; print('deps OK')"
