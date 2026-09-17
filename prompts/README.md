# ChatCut — Vertical 9:16 Prompt Pack

Professional video-editing prompts for converting footage shot in any aspect ratio into a
vertical **9:16** cut, with **8K** finishing and **kinetic lyric typography**, built around
one rule: *the hero and the heroine's faces and bodies never stop being the center of the film.*

## Files

| File | Use it for |
|---|---|
| [`vertical-9x16-hero-heroine-master-prompt.md`](vertical-9x16-hero-heroine-master-prompt.md) | The full brief. Paste into an AI video editor or hand to a post house. Sections: role, reframe law + decision matrix, 8K color correction & grading, kinetic type system, reference-video match, lyrics animation, workflow order, guardrails, acceptance criteria. |
| [`quick-paste-prompt.txt`](quick-paste-prompt.txt) | A condensed single-block version for tools with short input limits. Same intent, no tables. |
| [`reference-extraction-worksheet.md`](reference-extraction-worksheet.md) | Print/fill this while watching the reference video — it produces the font, color, and motion values the master prompt's Task D consumes. |
| [`delivery-checklist.md`](delivery-checklist.md) | Final pass/fail QA before anything is delivered. |

## How to use

1. **Open the master prompt.** Everything you paste is between `===== BEGIN PROMPT =====` and
   `===== END PROMPT =====`.
2. **Fill the `[BRACKETED]` fields** in section 2 (Inputs & Parameters). Worst case, leave the
   brackets in — they act as explicit slots for the editor or model to resolve.
3. **Attach the assets with the prompt:** the 8K footage, the song, the lyrics file, the
   reference video, and one or two stills each of the hero and heroine.
4. **Add a still of the hero and the heroine with a circle on their eyes** if you want the
   reframe anchor to be unambiguous. It removes the single biggest source of error.
5. **If the tool cannot read the reference video, do not let it guess.** Run
   [`reference-extraction-worksheet.md`](reference-extraction-worksheet.md), paste the completed
   values into Task D, then run the job. Otherwise the typography will look like a generic
   "AI lyric video" instead of the reference's design language.
6. **Send the clean render before the texted render** if you want a 16:9 YouTube version and a
   text-free archive from the same grade — export the 8K vertical master with no typography,
   then the texted version.

## What this prompt enforces (the short version)

- 9:16 is a **re-composition, not a crop** — per-shot, per-beat reframing on the 8K timeline
  with eyes always in the upper third and faces never intersected.
- An 8K 16:9 frame contains only a **2430 × 4320** native 9:16 window, so composition
  decisions are load-bearing, and punch-ins beyond ~1.125× must be supersampled.
- The hero and heroine stay the brightest, sharpest, most saturated elements — color secondaries
  separate them from the background instead of the background stealing the eye.
- Color is corrected in 32-bit float on a scene-referred timeline before any creative grade,
  with skin tones locked to the vectorscope's 11 o'clock line and matched across every scene.
- Typography is a **locked type system** with beat-snapped timing, 1–2 signature moves per
  section, motion blur, tracked integration, and a lyric that can pass *behind* a character's
  head but never across their eyes.
- Nothing ships without passing the acceptance table, and anything unresolved must be reported.

## Notes

- The master prompt's crop arithmetic assumes an **8K 16:9 (7680 × 4320)** master. If the source
  is DCI 8K (8192 × 4320), cinemascope, or a mix, the percentages still hold; the native 9:16
  window width changes, so recompute it as `source_height × 9 ÷ 16`.
- The reference video originally linked in the brief
  (`drive.google.com/file/d/1OlRdt2VJ7GOJ-WhFo7LIK8I9hdu1qaGc`) could not be downloaded in this
  environment. The prompt is written so the reference analysis happens either inside the editing
  tool (Task D) or by hand (the worksheet) — no style assumptions are baked in.
