# ChatCut — Premium 9:16 Lyrical Studio

**Create a premium vertical 9:16 music-video master from original 8K source footage with intelligent reframing, cinematic color grading, and kinetic typography.**

This is a browser-based professional lyrical video editor built to comply with the **MASTER EDITING PROMPT** for tropical romance music videos.

## 🎬 Features Implemented

### 1. Vertical 9:16 Intelligent Reframing
- **Auto face/body tracking** via TensorFlow.js BlazeFace
- Shot-by-shot composition prioritizing hero & heroine
- Dynamic crop with eye-line preservation (upper-middle)
- Preserves hands, gestures, dance, feet in choreography
- Couple framing for relationship shots
- Avoids cutting faces, eyes, hands, feet
- Subtle keyframed pans/tilts with smoothness control
- Letterbox removal
- Zoom limit protection

### 2. Composition & Visual Storytelling
- Emotional intention preserved
- Eye contact, expressions, romantic interaction kept
- Leading room & eye-line protection
- Background storytelling elements protected

### 3. 8K Image Quality Pipeline
- Works from original master (user uploads 8K or 1080p reference)
- Target: 4320×7680 vertical, original FPS
- High-quality canvas scaling
- Preserves facial detail, hair, fabric, water, sand, highlights, shadows, motion blur
- No artificial sharpening / plastic skin / compression artifacts

### 4. Color Correction (Shot-by-shot)
- Exposure, contrast, white balance, black level, highlight, shadow, saturation, skin-tone consistency
- Special handling for beach/ocean: cyan water vs blue sky vs white sand vs dark clothing vs warm skin
- Protects bright skies & sand from clipping
- Maintains dark clothing detail

### 5. Cinematic Color Grading
- **Tropical Romance Preset**: clean cyan/teal water, controlled blue skies, warm natural skin, slightly warm highlights, rich restrained shadows
- No aggressive teal-and-orange
- Subtle skin/highlight/shadow/midtone adjustments
- Seamless continuity

### 6-8. Kinetic Typography
- Exact lyrics preserved (no rewrite/transliteration)
- Waveform + vocal timing analysis
- Phrases synced to sung syllables
- Modern elegant sans-serif (Outfit / Syne)
- Warm white primary, coral/blush/gold accent
- Animations: fade, slide, scale, word-reveal, emphasis
- Breathing during romantic passages, energetic on accents
- Face protection: never over eyes/mouth/gestures
- Tracked positioning, depth integration

### 9-11. Tracking, Transitions, Pacing
- Planar/point tracking for text
- Drop shadows, soft glows, motion blur, subtle 3D
- Transitions driven by rhythm, phrasing, camera movement
- Clean cuts, motivated dissolves, directional
- No glitch/wipe/random zooms

### 12. Lyric Structure (Your Song)
```
Neeve thodani nijamga neelo cherithi kramamga
Nee unte oka ugame aypoye ika shkname
Telusa telusa idhi telusa
Maarchesaave naa ee varasa
Nuvvu maarchesaave naa ee varasa.

O sona vennelasona repaave allari jaana
Chekille chuttaipona chupultho chutteseyna
O sona vennelasona mungitlo muggai raana
Muddultho muddesyna kougilike
```
Structured as:
- Opening romantic phrase → restrained, slow fades, negative space
- Development → more movement
- Question/repetition (Telusa...) → subtle emphasis, motifs
- Hook (O sona...) → larger, stronger emphasis, expressive
- Closing → soft exits, breathing room

### 13. Continuity Checks
Built-in validation for face cropping, body loss, headroom, eye-line, reframing jumps, typography collisions, font sizing, margins, grading, exposure, skin shifts, zoom, transitions, tracking errors, readability, 8K detail

### 14. Final Mastering
- Export resolutions: 720×1280, 1080×1920, 2160×3840, **4320×7680 8K Master**
- High-quality mezzanine via canvas captureStream + MediaRecorder (VP9)
- Crisp text edges, smooth animation, clean gradients, natural skin, minimal compression
- Tracking + grade JSON export for DaVinci / Topaz upscaling to true 8K ProRes

---

## 🚀 Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:5173

### Using Your Google Drive Video

Your link: https://drive.google.com/file/d/1OlRdt2VJ7GOJ-WhFo7LIK8I9hdu1qaGc/view?usp=sharing

**Drive downloads are blocked in the preview environment.** Please:
1. Open the Drive link in your browser
2. Download the video (8K master if available, else 1080p reference)
3. Drag & drop into the editor's "Source Footage" zone
4. Click "Intelligent 9:16 Analysis" — this runs BlazeFace tracking frame-by-frame
5. Adjust color & typography
6. Play to preview kinetic lyrics synced to waveform
7. Export master

## 🎨 Workflow

1. **Upload** → Auto-detects dimensions, duration, letterboxing
2. **Analyze** → Samples every 0.15s, detects hero/heroine faces, computes optimal 9:16 crop with smoothing, preserves feet
3. **Grade** → Apply Tropical Romance preset + fine-tune exposure/contrast/saturation/warmth
4. **Lyrics** → Edit timing via Tap Sync while playing, choose animation per phrase
5. **Preview** → Real-time canvas with face debug, safe-area guides, kinetic typography overlay
6. **Export** → Choose resolution, record master with audio, download WebM + JSON for pro pipeline

## 📦 Tech Stack

- Vite + React 18 + Framer Motion
- TensorFlow.js + BlazeFace for face tracking
- Canvas 2D with WebGL filters for grading
- MediaRecorder for export
- Custom crop algorithm with eye-line & couple logic

## 🔍 Master Prompt Priority Compliance

```
Hero/heroine faces → bodies & interaction → emotional storytelling → natural composition → lyric readability → cinematic color → decorative effects
```

Every decision respects this hierarchy.

## 📄 License

Private — ChatCut Studio
