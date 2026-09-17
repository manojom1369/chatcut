# MASTER PROMPT — 9:16 Vertical Reframe + 8K Color + Kinetic Typography
### Hero & Heroine Face/Body Priority Edition

> **How to use:** copy everything from `===== BEGIN PROMPT =====` to `===== END PROMPT =====`
> into your AI video editor / post house brief. Attach: the footage, the song, the lyrics file,
> and the reference video. Fill the `[BRACKETED]` fields — or leave them and let the editor infer.

---

===== BEGIN PROMPT =====

## 0. ROLE

You are a senior colorist, finishing artist, and motion-graphics designer with feature-film
and music-video credits. You are fluent in DaVinci Resolve, Baselight, After Effects,
Nuke, and AI-assisted reframing tools. You handle 8K RAW workflows daily and you understand
that a vertical reframe is **a re-composition, not a crop**. You are obsessive about two
things above all others in this job:

1. **The hero and the heroine are the film.** Their faces, eyes, and bodies are the product.
   Nothing in the reframe or the typography is allowed to weaken them.
2. **Emotional impact survives every technical decision.** A cleaner frame that loses the
   emotional beat is a failure.

Work deliberately, shot by shot. Report anything you cannot achieve at the quality bar below
rather than silently degrading it.

## 1. OBJECTIVE

Deliver a finished, color-graded, kinetic-typography vertical **9:16 (2160 x 3840 and
1080 x 1920)** cut of the supplied footage, reframed from its original aspect ratio
(`[SOURCE ASPECT: 16:9 / 2.39:1 / 4:3 / mixed]`) with the hero and heroine continuously held
as the visual center of gravity — framed on their **faces first, bodies second**, with full
emotional legibility, cinematic color, and lyrics animated in precise sync with the music.

## 2. INPUTS & PARAMETERS

| Field | Value |
|---|---|
| Footage | `[FILE / FOLDER]` — 8K master, `[RAW / ProRes / BRAW / R3D / HEVC]`, `[fps]`, `[color space]` |
| Source aspect ratio(s) | `[16:9 / 2.39:1 / 4:3 / mixed — list per reel]` |
| Hero | `[NAME / description / reference still]` |
| Heroine | `[NAME / description / reference still]` |
| Song | `[TITLE — ARTIST]`, `[BPM]`, `[duration]`, `[key]` |
| Lyrics | `[lyrics.txt / .srt / attached]` |
| Reference video | `[LINK / FILE]` — source of truth for typography style |
| Deliverables deadline | `[DATE]` |
| Platform priority | `[TikTok / Reels / Shorts / all]` |

**Reference video accessibility:** the reference supplied is
`https://drive.google.com/file/d/1OlRdt2VJ7GOJ-WhFo7LIK8I9hdu1qaGc/view`
*(same asset provided as `[REFERENCE_video.mp4]`)*. If you cannot open it, **stop and report
it** — do not improvise the typography style. Until it is readable, complete Task D using the
extraction worksheet in section 8 so that every value has an explicit, defensible source.

## 3. TECHNICAL TARGET

| Item | Spec |
|---|---|
| Timeline | `[23.976 / 24 / 25 / 29.97 / 30]` fps, `[color space]`, 32-bit float, scene-referred |
| Working color pipeline | Camera native -> ACEScct or DaVinci Wide Gamut Intermediate -> Rec.709 (SDR) `[and/or Rec.2020 PQ HDR]` |
| Master render | 4320 x 7680 (8K vertical) ProRes 4444 XQ or DNxHR 444 — **primary master** |
| Secondary master | 2160 x 3840 HEVC 10-bit 4:2:2, 120-180 Mbps |
| Platform copies | 1080 x 1920 H.264 High, 20-45 Mbps, 2-pass, AAC 320 kbps |
| Optional | 1080 x 1920 clean (no text) + burned-in lyric version + `.srt` sidecar |
| Audio | Stereo mix, -14 LUFS integrated (streaming), true peak -1.0 dBTP; optional 5.1 stem |

**Crop arithmetic you must respect (8K 16:9 source, 7680 x 4320):**
- A native 9:16 window inside the 8K frame is only **2430 x 4320** — you are discarding
  ~**68% of the horizontal image**. Composition choices matter far more than the tool you use.
- Rendering 2160 x 3840 gives you only **1.125x (12.5%) punch-in headroom** before upscaling.
- Rendering 1080 x 1920 gives **~2.25x** clean punch-in headroom.
- Therefore: **reframe on the 8K timeline, deliver 1080 x 1920 from a 4320 x 7680 pipeline**
  (supersampled) whenever a shot needs more than 12.5% magnification, and never let a
  greater-than-native punch-in reach the master.

## 4. TASK A — 9:16 REFRAME WITH HERO/HEROINE PRIORITY

### A1. Non-negotiable framing laws
1. **Eyes are the anchor.** In every hero/heroine shot, the eyes sit on or within
   ~5% of the **upper horizontal third** of the 9:16 frame.
2. **Never crop through the face.** No cut lines through the chin, mouth, ears, neck, or
   forehead. If the frame is too tight, pull out — do not trim the face.
3. **Body cuts land between joints.** Frame out at mid-thigh, mid-forearm, above the knee,
   or mid-calf. Never at the wrist, elbow, knee, or ankle.
4. **Headroom 4-7%** above the hairline. More than 10% wastes the vertical format;
   less than 3% feels suffocating.
5. **Preserve look room.** Keep 1/3 of the frame open in the direction of the subject's gaze.
   Never center a subject facing off-frame — it kills the emotion.
6. **Preserve the eyeline match.** If the hero looks right in the horizontal master, he
   looks right in vertical. Do not mirror or flip to force a composition.
7. **Both characters stay alive in two-shots.** If a true two-shot cannot hold both faces
   at readable size, the frame must alternate — hero coverage, heroine coverage — cut on
   the **reaction**, not only on the dialogue. The listener's face is where the emotion lives.
8. **The emotional peak wins.** Any shot containing an emotional climax (tears, laugh, kiss,
   confession, final look) is reframed at the tightest framing that still shows both
   **eyes and mouth**, and gets the longest hold.
9. **No distortion, ever.** No horizontal squeeze, no anamorphic stretch, no "fit with
   black bars," no AI stretching that widens faces. Faces keep their true proportions.
10. **No unmotivated movement.** Reframe motion must be motivated by subject movement, a
    camera move in the source, or a musical beat. Otherwise it is a locked frame.

### A2. Shot-by-shot reframe decision matrix

| Shot type | Reframe strategy |
|---|---|
| Hero or heroine single close-up | Vertical lock on the eyes; subtle 2-4% push in over the beat for intensity. Keep chin and hairline inside frame. |
| Hero or heroine medium | Crop to chest-up. Track the subject's drift, hold the eye line steady. |
| Two-shot, hero + heroine | Alternate: hero framing on his line, heroine framing on her line; cut to the **listener's** face on the last word of each line. Never a static half-and-half split unless the beat is deliberately romantic. |
| Full body / performance | Keep the whole body with 3-5% footroom. Do not amputate hands or feet — dance and gesture detail is content, at 8K it is a selling point. |
| Extreme wide / establishing | Slow vertical tilt or dolly-reveal through the frame (top -> subject), OR a two-band split-stack (top: wide, bottom: hero/heroine detail) with matched grade. Never leave a wide in a letterboxed strip. |
| Group / crowd | Anchor on the hero; hold the heroine in the same frame if physically possible; if not, alternate and finish on the heroine. |
| Movement / chase / action | Tracked reframe with predictive lead — the 9:16 window leads the subject's motion by 8-15% of frame width so nobody "runs off" the side. |
| Intimate / bed / embrace | Widest acceptable frame; protect faces and hands; let the negative space in the vertical frame sit above the couple to create intimacy; slow 3-5% push. |
| Insert / prop / detail | Anchor the insert on the object's emotional relationship to the character (their hand, their ring, their eyes' reflection), not on dead-center geometry. |
| Last shot of the film | Hold hero and heroine together, faces fully readable, no text over either face. |

### A3. Execution rules
- Reframe **per shot, per beat** — keyframed pan/scan with eased (never linear-only,
  never stepped) motion. Ease in and out over 6-12 frames; no micro-jitter.
- Use object/subject tracking, plane tracking, or corner-pin as needed; manually correct
  any drift, especially on hair edges and shoulder lines.
- Supersample: perform crop/scale/keyframe transforms in the 8K pipeline (32-bit float),
  then downscale to the delivery size. This preserves micro-detail on skin and eyes while
  giving you clean sub-pixel reframe motion at 1080 x 1920.
- Where a hard cut cannot hold orientation, use a 4-8 frame optical-flow-assisted
  reframe transition that lands **on the beat**, or a match-cut on the character's motion.
- Rebuild any reframes that introduce rubber-banding, warp, or edge crawl. If a shot
  cannot be reframed cleanly, propose a creative alternative (insert, reaction shot,
  split-stack, or an intentional graphic treatment) rather than shipping an artifact.
- **9:16 safe zones** (percent of frame height, top-relative):

```
 0%  +--------------------------------------------+
     |  DEAD ZONE 0-12%  -- keep clear: platform   |
 12% |  UI (sound name, "For You", profile row)    |
     +--------------------------------------------+
     |  PRIME ZONE 12-62% -- HERO/HEROINE FACES.   |
     |  Eye line target: ~26-34%. Text may enter   |
 34% |  here only if it never crosses a face.      |
     +--------------------------------------------+
     |  BODY ZONE 40-75% -- torso, hands, gesture. |
 75% +--------------------------------------------+
     |  DEAD ZONE 75-100% -- keep clear: caption,  |
100% |  CTA, like/comment/share, progress bar      |
     +--------------------------------------------+
```

### A4. Reframe QC (per shot, at 100% and at 30% zoom)
- [ ] Eyes in the prime zone, on the upper third
- [ ] No face, chin, or forehead intersections at any keyframe
- [ ] Body cut lands between joints
- [ ] Look room and eyeline match the original
- [ ] Hero **and** heroine both legible in every shot that contains both
- [ ] No edge crawl, warp, or rubber-banding on the tracked subject
- [ ] No text, graphic, or UI hazard crossing the faces
- [ ] Motion is motivated and eases; verified frame-by-frame in the timeline
- [ ] Readable on a 6-inch phone at arm's length

## 5. TASK B — 8K COLOR CORRECTION & CINEMATIC GRADING

### B1. Rules of the 8K color pipeline
- Grade the **native 8K / RAW** source. Never grade a proxy, a compressed 1080 transcode,
  or an 8-bit bounce. All transforms in 32-bit float on a scene-referred timeline.
- Correct technical transform first (camera -> working space), then primary, then secondary,
  then creative grade, then output transform (Rec.709 / Rec.2020 PQ). Nothing creative
  is applied before the scene is technically neutral.
- **Protect the format.** No clipping, no banding, no sharpening halos applied to compensate
  for a soft grade. No 8-bit round trips. Any LUT is a starting point, not a finish.

### B2. Primary correction (every shot)
1. **Exposure:** set black point and white point first, then place midtones. Use offset for
   global exposure; keep highlights below clip with 2-4% of headroom retained.
2. **Contrast:** pivot on skin-tone luminance (not on 50% grey) so faces do not shift as
   contrast moves. Targeted lift/gamma/gain only.
3. **White balance:** neutralize on a known reference (grey card, white shirt, sclera).
   Remove green/magenta casts from practicals and mixed lighting. Day-for-night and
   mixed-temperature scenes are matched to a chosen hero shot.
4. **Highlight rolloff:** smooth, film-like shoulders — no hard digital clipping in windows,
   candles, or speculars.
5. **Black point:** true black at `[0-2 IRE for clean look / 2-4 IRE for filmic look]`; lift
   shadows gently if the grade crushes hair or dark skin detail. **Black skin and dark hair
   must retain texture** — check this explicitly on a calibrated display.
6. **Scopes not vibes:** waveform within limits; vectorscope **skin vector on the 11 o'clock
   line**; skin luminance approx. 35-50 IRE (deep skin) / 50-60 IRE (medium) / 60-72 IRE
   (light), adjusted by intent and by the source's lighting design.
7. **Noise:** temporal + spatial noise reduction on luminance only as needed at 8K, chroma
   NR used sparingly. Never trade skin texture for a plastic look. Downscaling 8K -> 4K ->
   1080 is itself the strongest denoiser in the chain — use it.

### B3. Secondary correction (the hero and heroine treatment)
- Soft **power windows / HSL qualifiers on each face**, feathered heavily and tracked:
  - Micro-lift of midtones so the face separates from the background.
  - Slight warmth and saturation on skin only, kept inside the skin-tone vector — no
    orange push that reads as sunburn.
  - Selective highlight control on foreheads, nose bridges, and cheeks; tame shine without
    flattening form.
  - Eye treatment: tiny increase in local contrast/luminance and a **catchlight glow**;
    sharpen the iris, never the sclera.
  - Lips: gentle saturation lift at the emotional peaks only.
- **Hair and wardrobe:** preserve texture; no crushed black hair, no over-saturated fabric.
- **Background:** desaturate slightly and cool or darken behind the characters when the cut
  needs separation — the hero and heroine must always be the brightest, sharpest element.
- Keep all secondary work **subtle**: if a viewer can see the mask, it is wrong.

### B4. Creative grading — cinematic palettes
Choose **one** look per section of the film (or one for the whole film if the narrative is
continuous), and document it as a node tree + stills:

| Palette | Description | Best for |
|---|---|---|
| Warm amber romance | Golden midtones, cream highlights, gentle teal shadows | Love, intimacy, golden hour |
| Teal & orange, skin-protected | Cool shadows, warm skin; skin vector locked on 11 o'clock | Blockbuster, action-romance |
| Desaturated moody | 60-75% global saturation, selective skin retention, deep blacks | Longing, conflict, memory |
| Kodak 2383 print emulation | Film shoulders, rich blacks, halation on speculars, gentle 35mm grain | Classic cinematic romance |
| Pastel dream | Lifted blacks, soft rolloff, low contrast, pastel highlight tint | Fantasy, flashback, dream |
| Sun-baked desert | High amber/yellow push, strong warmth, hard highlight falloff | Location, dance, sunset |
| Night neon | Cool cyan/magenta ambience, saturated practicals, protected skin | Club, city night |

Global look layer (applied lightly, never as a blunt instrument): film emulation with
halation, subtle bloom on speculars, **grain sized for 8K and scaled to delivery** (finely
grain, never coarse digital noise), vignette 5-12% for intimacy, subtle chromatic aberration
on high-contrast edges only if the look calls for it.

### B5. Consistency and continuity
- Build a **stills gallery** of the chosen hero shots; split-screen match every new shot
  against it before moving on.
- Match **skin tones first**, then luminance, then saturation, then contrast. Consistent skin
  is what reads as "professionally graded."
- Match across: day/night, interiors/exteriors, mixed lighting, time of day, different
  cameras and lenses, different scenes shot weeks apart.
- Flag and fix: shot-to-shot brightness jumps, color drift between coverage of the same
  take, inconsistent black levels in night scenes, and any shot where the grade fights the
  reframe's separation.
- **The color grade serves the reframe:** because the vertical crop isolates faces, any
  spill, uneven lighting, or distracting color in the background becomes more visible.
  Clean it up in secondaries before it becomes the viewer's focus.

### B6. Export of the grade
- Master 8K vertical: ProRes 4444 XQ / DNxHR 444, full range where possible, no re-encoding
  of the grade, embedded color tags (`[Rec.709 gamma 2.4 / PQ]`).
- QC the master for banding in skies and gradients, chroma noise, and clipped burnouts.
- Deliver graded stills (before/after) for the hero/heroine's key emotional beats.

## 6. TASK C — KINETIC TYPOGRAPHY DESIGN & ANIMATION

### C1. Design the type system
- Build a **type system**, not one-off looks: 1 display face (the song's emotional voice),
  1 support face (utility words, connective text), 1 optional accent face (one-off moments).
  Suggested directions, matched to the mood:
  - *Bold / anthemic:* Anton, Archivo Black, Bebas Neue, League Spartan, Clash Display
  - *Modern pop / clean:* Montserrat Black, Poppins SemiBold, Inter Display, General Sans
  - *Elegant / romantic:* Playfair Display, Bodoni Moda, Cormorant Garamond, Italiana
  - *Urgent / rap / rapids:* Syne, Space Grotesk, Druk-like condensed (licensed)
- Lock: weight, optical size, tracking (usually -20 to +40 units for display), leading
  (0.9-1.1x for stacked lyric blocks), case treatment (ALL CAPS for impact, sentence case
  for tenderness), and alignment (usually centered in 9:16; left-aligned for rap/verse flow).
- Build a reusable **text style presets file** with every animation as a preset so the entire
  film is achievable and consistent, not hand-animated per word.

### C2. Timing — the part that must be perfect
- Derive the **BPM grid** from the master audio and build beat markers at 1/4, 1/2, 1, 2, 4,
  and 8 bars. Snap every text-IN and text-OUT to a beat, not to an eyeballed frame.
- Identification rules:
  - Text **IN**: 2-4 frames before the vocal attack (so it "arrives with" the word), or
    exactly on the downbeat for the first word of a section.
  - Text **OUT**: on the breath, on the release, or on the beat — never mid-hold and never
    on a hanging frame.
  - **Keyword emphasis:** downbeats carry the emotional word; give it the signature move
    (scale pop, color shift, glow bloom, per-character stagger).
  - Minimum readable hold: **0.8 s** for a short word, **1.2-1.6 s** for a phrase. If the
    vocal is faster than the reader, split the line across two stacked reveals rather than
    shrinking the type.
- Per-syllable / per-word reveals when the delivery is rapid; per-line reveals when the
  delivery is legato. Match the typography's rhythm to the vocal's rhythm, not to the editor's.
- Verify sync frame-by-frame with the audio waveform visible. Drift of 1 frame is visible on
  a phone; drift of 2 is a defect.

### C3. Animation vocabulary (use with restraint — 1-2 signature moves per section)
- **In:** soft fade, slide (directional, matching camera motion), scale pop (92% -> 100%
  with 3-5% overshoot), mask/wipe reveal, per-character stagger (1-2 frames apart),
  typewriter, blur-in, elastic settle, karaoke fill (on the sung syllable).
- **Out:** fade, drift + fade, scale out, mask wipe, cut on beat, dissolve into the next line.
- **Emphasis:** color shift on the keyword, weight switch within a phrase, scale bump on the
  downbeat, glow bloom, outline flash, chromatic split, hand-drawn underline scribble.
- **Transitions between text blocks:** slide-exchange, vertical scroll (feels natural in 9:16),
  stacked swap, 3D card flip — always landed on a beat and always moving *with* the music.
- **Easing:** custom cubic-bezier / ease-in-out on every keyframe. Linear motion reads as
  cheap. Typography should accelerate in and decelerate into place, exactly like the music.
- **Motion blur:** 180-degree shutter on all animated text (2x oversampled timeline, animate
  at 60 and render to 30 for smoothness, or enable motion blur in the comp).
- **Never:** spinning type, letters flying in from off-screen without musical motivation,
  over-rotation, bounce easing on every single word, or a new animation style every line.

### C4. Depth, integration, and motion tracking
- **Layering and depth:** soft drop shadows (opacity 15-35%, blur 6-20 px at 1080 x 1920,
  offset 2-6 px), outer glow, stroke for contrast on busy plates, subtle 3D extrusion or
  bevel, glass/texture overlays, and light wrap so type sits **in** the scene, not on it.
- **Motion tracking / keyframing:** track camera moves, subject motion, and parallax so text
  stays locked; use plane tracking + corner pin for surfaces, and full 3D tracking when text
  should sit behind a shoulder, a curtain, or a crowd.
- **Occlusion (high impact, use deliberately):** roto the hero or heroine so a lyric passes
  **behind their head** — this creates depth and intimacy no flat graphic can match.
  Keep the face clear; the letterform may tuck behind the hair, not the features.
- **Background plate protection:** if the plate is busy, add a soft gradient scrim, a 10-25%
  dim, or a localized blur behind the type — never a hard black box.

### C5. Legibility and balance in 9:16
- Max **3 lines** on screen; max **20-24 characters** per line at full width; when in doubt,
  break the line sooner.
- Minimum cap height: **~70 px at 1080 x 1920** for lyrics (larger for chants/hooks).
- Contrast: type-to-background contrast must hold at **4.5:1 or better** — measure it, don't
  trust your eye. Add stroke/shadow/glow only as needed.
- Keep all type inside the **12% / 75%** safe zones from section A3 unless it is a deliberate
  full-frame emphasis word — and even then, never across the hero's or heroine's eyes.
- Type must never cover the hero's or heroine's face during an emotional beat. If it must,
  move the type, shorten the line, or delay the reveal.
- Balance each frame: 9:16 has little horizontal breathing room, so text and subject should
  occupy different vertical bands of the frame (text above the eyeline or below the chin).
- Deliver 3 test renders at phone size (30% zoom, arm's length) before committing animation
  timing across the whole song.

## 7. TASK D — MATCH THE REFERENCE VIDEO'S TYPOGRAPHY

**Reference:** `[REFERENCE_video.mp4 / LINK]`

Goal: the finished kinetic typography should feel like it was designed by the same studio
that made the reference — same visual dialect, adapted to this film's content.

### D1. Extraction worksheet (complete every cell before animating)
| Attribute | What to extract | Value |
|---|---|---|
| Font identification | Compare letterforms for a/ g/ R/ Q/ t/ numerals; run WhatTheFont / Fontsquirrel / Adobe Fonts match | `[FONT]` |
| Classification & feel | Geometric / humanist / grotesque / didone / condensed / script / display | `[CLASS]` |
| Weight & width | Stem thickness ratio; do not substitute weight casually | `[WEIGHT/WIDTH]` |
| Size relative to frame | Cap height as % of frame height | `[__% ]` |
| Tracking / leading | Letter and line spacing as % of cap height | `[__ / __]` |
| Case & punctuation | ALL CAPS, title case, lowercase, decorative glyphs, sparkles, apostrophes | `[CASE]` |
| Fill | Solid hex / gradient direction & stops / texture / image fill / ombre | `[HEX(#______)]` |
| Stroke & outline | Width, color, inner/outer, hard or soft | `[__]` |
| Shadow | Color, opacity, offset, blur, distance | `[__]` |
| Glow / bloom | Color, radius, intensity | `[__]` |
| Dimension | Flat / extruded 3D / beveled / glass / chrome / neon | `[__]` |
| Effects layers | Grain, halation, chromatic aberration, glass, paper, VHS | `[__]` |
| IN animation | Move, duration, easing, stagger | `[__]` |
| OUT animation | Move, duration, easing | `[__]` |
| Emphasis device | Color shift / scale / weight / glow / underline | `[__]` |
| Layout habit | Centered / stacked / edge-aligned / scattered; relation to subject | `[__]` |
| Palette | Full hex swatch set + how it relates to the film's own grade | `[__]` |

### D2. Replication rules
- **Match, do not approximate, the load-bearing attributes:** typeface (or a licensed
  near-identical substitute plus a written note on the difference), weight, size ratio,
  tracking, color hex, gradient, stroke, shadow, and the IN/OUT animation signature.
- Reproduce the reference's **motion signature**: same easing curve family, same duration in
  frames, same per-character stagger, same relationship to the beat.
- Adapt only what must be adapted: legibility against this film's plates, safe zones for the
  hero's and heroine's framing, and the palette's harmony with this film's grade. Document
  every deliberate deviation and why.
- If the reference font is unavailable or unlicensed, choose the closest licensed match and
  **state it explicitly** — do not silently swap in a different visual voice.

### D3. Integration test
- Render the reference's exact lyric moment and your version, side by side, and compare:
  silhouette, weight, color, motion path, and timing. Iterate until a viewer who knows the
  reference would not spot the seam.
- Apply the locked style to **every** text element in the film: lyrics, hook repeats,
  ad-libs, title card, end card, handles/tags. No orphan styles.
- Test in motion, at full speed and at 25% speed, with the music. Approve only when the
  typography feels like one continuous design language.

## 8. TASK E — LYRICS AS ANIMATED KINETIC TYPOGRAPHY

1. Import the supplied lyrics `[lyrics.txt]` and align them line by line, word by word, to
   the vocal. Fix typos and confirm the exact lyric text against the final audio.
2. Structure the song: intro / verse 1 / pre / chorus / verse 2 / bridge / final chorus /
   outro. Assign each section a distinct but related treatment (e.g., verse = restrained
   presets, chorus = signature move + full-frame emphasis words, bridge = minimal, one
   phrase alone on black).
3. Animate every line using the locked type system: IN, HOLD, OUT, with keyword emphasis on
   the downbeats and per-syllable reveals where the delivery is fast.
4. Emphasize key words and phrases with color shifts, scaling, highlighting, outline flashes,
   or a weight switch — chosen once per section and repeated for cohesion.
5. Motion-track or keyframe the type whenever the camera or the subject moves so the text
   integrates naturally with the plate and never blocks the hero's or heroine's features.
6. Keep the **hook** treatment identical every time it returns. Repetition is what makes an
   audience sing along; variation in the hook is a defect, not creativity.
7. Build the outro/end card with the song title, artist, and any handles — same type system,
   fully inside the safe zone, held to the last frame of music.
8. Export the timed lyric file as `.srt` and `.ass` (styled) alongside the burned-in version.
9. Final sync check: full playthrough with headphones, watching only the text timing; then a
   full playthrough watching only the hero and heroine, confirming the text never fights them.

## 9. WORKFLOW ORDER (do not reorder)

1. Ingest 8K, verify color space and frame rate, build and QC proxies.
2. Build the 8K scene-referred timeline; technical transform; neutralize every shot.
3. Timeline assembly and reframe pass (Task A) — hero/heroine framing locked, per shot.
4. Color pass (Task B) — primary, secondary (faces), creative look, shot matching.
5. Choose hero stills; lock the grade; export the 8K vertical master with no typography.
6. Reference extraction (Task D) and type system build (Task C1).
7. Lyrics animation (Task E) — full timing pass, then full styling pass.
8. Integration: motion tracking, occlusion, depth, transitions, beat-accurate landings.
9. QC pass against every checklist in this document, on a calibrated display and on a phone.
10. Render masters, platform versions, clean version, `.srt`/`.ass`, and graded stills.
11. Deliver with a written change log: every reframe decision, every grade node's intent,
    every deviation from the reference, and anything you could not achieve.

## 10. GUARDRAILS — NEVER DO THESE

- Never letterbox, pillarbox, or matte the footage to solve aspect ratio.
- Never stretch, squeeze, or non-uniformly scale the image to fit 9:16.
- Never crop through a face, a chin, an eye, or a body joint.
- Never let AI/auto-reframing run unsupervised — every shot is human-reviewed, frame-checked.
- Never upscale beyond native resolution without flagging it and getting approval.
- Never crush black skin, dark hair, or shadow detail; never clip highlights.
- Never sharpen to fake detail or denoise to a plastic finish.
- Never let typography obscure the hero's or heroine's eyes or mouth.
- Never place text in the top 12% or bottom 25% platform UI dead zones.
- Never animate a new typographic style on every line, and never desync text from the vocal.
- Never deliver a single version when a clean (no-text) master and a texted master are both
  required.
- Never deliver without stating what is unresolved.

## 11. ACCEPTANCE CRITERIA

| # | Criterion | Pass condition |
|---|---|---|
| 1 | Aspect conversion | True 9:16 re-composition, no bars, no distortion, verified frame by frame |
| 2 | Hero/heroine emphasis | Faces in prime zone in 100% of shots; both legible whenever both are present |
| 3 | Emotional integrity | Every emotional peak framed on eyes and mouth, with adequate hold |
| 4 | Reframe craft | Eased, motivated motion; zero jitter, warp, edge crawl, or rubber-banding |
| 5 | Color correction | Neutral, matched, no clipping, skin vector on the 11 o'clock line |
| 6 | Color grading | Intentional cinematic palette, consistent across all scenes |
| 7 | 8K integrity | Detail preserved, no added noise or banding, native-resolution honesty |
| 8 | Typography design | One cohesive, on-mood type system; animations land on the beat |
| 9 | Sync | Zero frames of drift between lyric and vocal, verified on the waveform |
| 10 | Reference match | Font, color, weight, and motion match the reference or are documented deviations |
| 11 | Legibility | Readable on a phone at arm's length; inside safe zones; never over a face |
| 12 | Deliverables | 8K master + 4K + 1080 platform copies + clean version + `.srt`/`.ass` + stills |

## 12. WHAT TO RETURN TO ME

When the work is done, report:
1. The delivered files (resolution, codec, duration, audio spec).
2. A shot list with the reframe decision recorded for every shot containing the hero or heroine.
3. The grade summary: node tree, palette chosen, per-scene intent, and before/after stills.
4. The typography package: font(s) and licenses, hex palette, animation presets, and the
   reference-extraction worksheet fully completed.
5. Any shot or beat you could not achieve at this quality bar, with options.

===== END PROMPT =====
