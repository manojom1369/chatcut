# Kinetic Typography Lyric Video Generator

A dependency-light Node pipeline that turns a **song + timed lyrics** into a
trending-style **kinetic typography / motion-graphics lyric video** (vertical
1080x1920 for Reels/TikTok/Shorts, or any size you want).

How it works:

```
timed lyrics + theme  ->  animated SVG per frame  ->  resvg rasterizes PNG  ->  FFmpeg encodes + muxes audio  ->  MP4
```

- **`@resvg/resvg-js`** renders the SVG frames (no browser needed).
- **`opentype.js`** measures real glyph widths so text wraps and centres precisely.
- **`ffmpeg-static`** provides a portable FFmpeg binary (no system install).

## What's in the animation

- Animated **aurora background** (drifting colour blobs) + twinkling star field + vignette
- **Word-by-word entrance**: each word pops in with an elastic overshoot (scale + rotation + rise)
- **Karaoke highlight**: the live word sits on an animated gradient slab; the others dim
- **Gradient + glow** typography (Anton / Bebas Neue / Archivo Black / Poppins built in)
- **Now Playing** chip, **progress bar**, timecode, and an animated **intro title card**

## Quick start

```bash
cd lyric-video
npm install
node src/genAudio.js 26 assets/demo.wav     # optional: synthesize a demo beat
npm run demo                                 # renders config/demo.json -> out/demo.mp4

# inspect single frames fast, without encoding:
node src/preview.js config/demo.json 1.0 3.4 9.0
```

## Using your own song + lyrics

1. Drop your audio file into `assets/` (any FFmpeg-supported format: mp3, wav, m4a...).
2. Copy `config/demo.json` to `config/my_song.json` and edit:
   - `audio` -> `assets/your_song.mp3`
   - `output` -> `out/my_song.mp4`
   - `duration` -> song length in seconds
   - `title` / `artist`
   - `theme` -> `neon` | `sunset` | `cyber` | `mono`
   - `lyrics`: one entry per line with `start` and `end` in **seconds**:
     ```json
     { "start": 12.4, "end": 15.1, "text": "Your line goes here" }
     ```
3. Render: `node src/render.js config/my_song.json`

### Tips for timing lyrics
- Play the song and note the second each line begins/ends; put those in `start`/`end`.
- Words within a line are highlighted automatically, spread across the line's duration
  (longer words stay lit longer). Tune with `stagger` and `entranceDur`.

## Config reference (most useful keys)

| key | meaning | default |
|-----|---------|---------|
| `width` / `height` | canvas size | 1080 / 1920 |
| `fps` | frames per second | 30 |
| `duration` | total seconds | - |
| `fontMain` | display font family | `Anton` |
| `fontSize` | base px size (auto-shrinks to fit) | 130 |
| `maxWidthRatio` | max text width as fraction of canvas | 0.84 |
| `centerY` | vertical centre of the lyric block (0-1) | 0.5 |
| `highlight` | `box` (karaoke slab) or `color` | `box` |
| `glow` | glow blur amount | 8 |
| `stagger` | delay between words entering (s) | 0.085 |
| `entranceDur` | per-word entrance duration (s) | 0.55 |
| `uppercase` | force caps | true |
| `intro` | `{ duration, title, subtitle }` title card | none |

## Fonts

Bundled under `fonts/` (all OFL / free from Google Fonts): Anton, Bebas Neue,
Archivo Black, Barlow Condensed, Poppins. Add more by dropping a `.ttf` in `fonts/`
and registering it in `src/lib/fonts.js`.
