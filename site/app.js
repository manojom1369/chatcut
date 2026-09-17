/* ChatCut preview UI — drives the player, the live cue panel and the QC checklist. */

const PALETTES = {
  A: "warm amber romance",
  B: "desaturated moody",
  C: "night neon",
};

const QC = [
  ["reframe", "9:16 is a true re-composition — no bars, no matte, no stretch"],
  ["reframe", "Hero/heroine prime zone (12–62%) left clear for faces in every cue"],
  ["reframe", "No text or graphic crosses a face, chin or eyeline"],
  ["reframe", "Lyric band sits below the eye line, above the 75% UI dead zone"],
  ["color", "Each section has one documented palette, matched shot to shot"],
  ["color", "Text-to-background contrast holds at 4.5:1 or better"],
  ["color", "Grain and glow are subtle; no banding in skies or gradients"],
  ["type", "Telugu shaped correctly — conjuncts and matras in the right order"],
  ["type", "Every cue in/out snapped to the 90 BPM beat grid"],
  ["type", "Max 3 lines, ≤24 characters per line, ≥70px cap height at 1080×1920"],
  ["type", "Keyword emphasis on the downbeat, identical on every hook repeat"],
  ["type", "Custom easing on every keyframe; 1–2 signature moves per section"],
  ["audio", "Cues verified against the audio waveform, frame by frame"],
  ["delivery", "1080×1920 master + light preview + SRT + timeline JSON exported"],
  ["delivery", "Clean (no-text) version exported for the 16:9 edit"],
  ["reference", "Reference video analysed and its font/colour values applied — or flagged"],
];

const $ = (id) => document.getElementById(id);

async function loadTimeline() {
  const res = await fetch("/output/manasa-9x16-timeline.json");
  return res.json();
}

function fmt(t) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${String(m).padStart(2, "0")}:${s.toFixed(2).padStart(5, "0")}`;
}

function buildCues(tl) {
  const cues = $("cues");
  tl.cards.forEach((c, i) => {
    const el = document.createElement("div");
    el.className = "cue";
    el.dataset.index = i;
    el.innerHTML =
      `<span class="t">${fmt(c.start_s)}</span>` +
      `<span><span class="te">${c.telugu}</span><br><span class="tr">${c.transliteration}</span></span>` +
      `<span class="sec ${c.section}">${c.section}</span>`;
    el.addEventListener("click", () => seekTo(c.start_s + 0.15));
    cues.appendChild(el);
  });
}

function buildTimeline(tl) {
  const wrap = $("timeline");
  const dur = tl.duration_s;
  const rows = ["A", "B", "C"].map((sec) => {
    const row = document.createElement("div");
    row.className = "tl-row";
    const blocks = tl.cards
      .filter((c) => c.section === sec)
      .map((c) => {
        const left = (c.start_s / dur) * 100;
        const width = ((c.end_s - c.start_s) / dur) * 100;
        return `<div class="tl-block ${sec}" style="left:${left}%;width:${width}%" data-t="${c.start_s}" title="${c.telugu} — ${c.transliteration}">${c.telugu}</div>`;
      })
      .join("");
    row.innerHTML = `<div class="tl-name">Section ${sec} · ${PALETTES[sec]}</div><div class="tl-track">${blocks}</div>`;
    wrap.appendChild(row);
    return row;
  });
  rows.forEach((row) =>
    row.querySelectorAll(".tl-block").forEach((b) =>
      b.addEventListener("click", () => seekTo(parseFloat(b.dataset.t) + 0.15))
    )
  );
}

function buildQC() {
  const grid = $("qcGrid");
  const saved = JSON.parse(localStorage.getItem("chatcut-qc") || "{}");
  QC.forEach(([tag, text], i) => {
    const label = document.createElement("label");
    label.className = "qc" + (saved[i] ? " done" : "");
    label.innerHTML = `<input type="checkbox" ${saved[i] ? "checked" : ""}><span>${text}</span><span class="tag">${tag}</span>`;
    const box = label.querySelector("input");
    box.addEventListener("change", () => {
      saved[i] = box.checked;
      label.classList.toggle("done", box.checked);
      localStorage.setItem("chatcut-qc", JSON.stringify(saved));
    });
    grid.appendChild(label);
  });
}

let TL = null;
let VID = null;

function seekTo(t) {
  VID.currentTime = Math.min(Math.max(t, 0), VID.duration || t);
  if (VID.paused) VID.play().catch(() => {});
}

function activeIndex(t) {
  return TL.cards.findIndex((c) => t >= c.start_s && t < c.end_s);
}

function update() {
  const t = VID.currentTime;
  const dur = VID.duration || TL.duration_s;

  $("seek").value = String(Math.round((t / dur) * 1000));
  $("tc").textContent = fmt(t);

  const i = activeIndex(t);
  if (i < 0) {
    $("capTelugu").textContent = "—";
    $("capLatin").textContent = "—";
    $("capMeaning").textContent = "—";
    $("mCue").textContent = "–";
    $("mBeat").textContent = "–";
    $("mAnim").textContent = "–";
    $("mKey").textContent = "–";
  } else {
    const c = TL.cards[i];
    $("capTelugu").textContent = c.telugu;
    $("capLatin").textContent = c.transliteration;
    $("capMeaning").textContent = c.meaning || "—";
    $("mCue").textContent = `${i + 1} / ${TL.cards.length}`;
    $("mBeat").textContent = `${c.start_beat.toFixed(1)} + ${c.beats.toFixed(1)}`;
    $("mAnim").textContent = c.anim;
    $("mKey").textContent = c.keyword || "—";
    $("mSize").textContent = `${c.size_px} px`;
    $("mPal").textContent = `${c.section} · ${PALETTES[c.section]}`;
    $("sectionPill").textContent = c.section;
    $("sectionPill").title = PALETTES[c.section];
    document.querySelectorAll(".cue").forEach((el, k) => el.classList.toggle("active", k === i));
    const el = document.querySelector(`.cue[data-index="${i}"]`);
    if (el && !el.dataset.seen) {
      el.dataset.seen = "1";
    }
  }
}

async function main() {
  TL = await loadTimeline();
  VID = $("vid");

  buildCues(TL);
  buildTimeline(TL);
  buildQC();

  VID.addEventListener("timeupdate", update);
  VID.addEventListener("loadedmetadata", () => {
    update();
    VID.play().catch(() => {});
  });
  $("seek").addEventListener("input", (e) => {
    VID.currentTime = (e.target.value / 1000) * (VID.duration || TL.duration_s);
  });
  $("play").addEventListener("click", () => {
    if (VID.paused) VID.play().catch(() => {});
    else VID.pause();
  });
  VID.addEventListener("play", () => ($("play").textContent = "❚❚"));
  VID.addEventListener("pause", () => ($("play").textContent = "▶"));
  $("mute").addEventListener("click", () => {
    VID.muted = !VID.muted;
    $("mute").textContent = VID.muted ? "🔇" : "🔊";
  });
  $("safe").addEventListener("click", () => {
    $("safes").classList.toggle("on");
  });
  document.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      e.preventDefault();
      $("play").click();
    }
    if (e.key.toLowerCase() === "m") $("mute").click();
    if (e.key.toLowerCase() === "s") $("safe").click();
  });
}

main().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML(
    "afterbegin",
    '<p style="padding:14px 26px;color:#ffb4b4">Could not load the timeline JSON — serve this page from the repo root (python3 tools/serve.py).</p>'
  );
});
