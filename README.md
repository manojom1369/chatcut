# ✂️ ChatCut — Lyrics & Subtitles Studio

Add **lyrics and subtitles with beautiful custom fonts** to any video — free, unlimited, and 100% in your browser. No uploads, no watermarks, no sign-up.

## ✨ Features

- 🎞️ **Video import** — drag & drop MP4/WebM/MOV, or try the built-in sample video
- 📝 **Caption editor** — add / edit / delete / retime lines, click-to-seek, live active-line glow
- 🎤 **Lyrics wizard** — paste plain lyrics, auto-create timed lines
- 📥 **Import** — `.srt` `.vtt` `.lrc` `.txt` + ChatCut project `.json`
- 🎨 **Font & style studio**
  - 15 built-in fonts (Poppins, Anton, Bebas Neue, Dancing Script…) + **upload your own .ttf/.otf/.woff**
  - Size, weight, italic, uppercase, text + highlight colors
  - Outline, drop shadow, background box (color / opacity / padding / roundness)
  - Position (top / middle / bottom + nudge), alignment, line-height, max width
  - Effects: **Karaoke word highlight**, **TikTok pop**, **Fade**, **🧱 3D block text** (depth + color), plus 6 one-click presets incl. **3D Pop**
- 👀 **Live WYSIWYG preview** — exactly what you see is what gets exported
- 💾 **Export captions** — `.srt` `.vtt` `.lrc` + project `.json`
- 🎬 **Export video** — burns styled captions into the video (MP4/WebM with original audio)

## 🚀 Run locally

No build step — just serve the folder:

```bash
# Python
python3 -m http.server 8000
# or Node
npx serve .
```

Then open http://localhost:8000

You can also just double-click `index.html`, but `file://` mode may block the sample video & export audio — a local server is recommended.

## 📁 Project structure

```
chatcut/
├── index.html          # app layout
├── css/styles.css      # dark editor theme
├── js/app.js           # editor + styling + canvas export engine
└── samples/            # sample captions to try the importer
```

## 🛠️ How export works

Export draws each video frame to a `<canvas>`, renders the styled caption (same engine as the preview), and records with `MediaRecorder` in realtime — all client-side. For best results use Chrome/Edge (MP4 support) and keep the tab visible during export.

## 📄 License

MIT — free for personal & commercial use.
