# chatcut

Production-ready AI video editing prompts — and a working 9:16 vertical lyric render built to them.

## The render

*“Manasa Nuvvunde Chote” (Munna · Mani Sharma) — charanam, cut to 9:16*

- **`output/manasa-9x16-lyric-teaser.mp4`** — 1080 × 1920, 30 fps, 49.3 s, Telugu kinetic typography
  on cinematic plates, beat-snapped at 90 BPM
- **`output/manasa-9x16-clean-reframe.mp4`** — the clean version, no text
- **Preview UI:** `python3 tools/serve.py --port 8000` → player with live cue panel, safe-zone
  overlay, timing map and QC checklist
- Details, method and honest limits: [docs/render-notes.md](docs/render-notes.md)

The plate imagery is stand-in footage, and the audio is an original synthetic 90 BPM guide
track — everything else (Telugu shaping, composition rules, cue map, animation system, grade
treatment) is production-shaped and documented.

## The prompt pack

- [Vertical 9:16 hero & heroine prompt pack](prompts/README.md) — 8K reframe, color grade, and
  kinetic lyric typography for converting any aspect ratio to 9:16.
- [Master prompt](prompts/vertical-9x16-hero-heroine-master-prompt.md) ·
  [quick-paste version](prompts/quick-paste-prompt.txt) ·
  [reference worksheet](prompts/reference-extraction-worksheet.md) ·
  [delivery checklist](prompts/delivery-checklist.md)
