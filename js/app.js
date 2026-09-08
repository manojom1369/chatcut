/* ChatCut — Lyrics & Subtitles Studio (100% client-side) */
'use strict';

const $ = (id) => document.getElementById(id);
const uid = () => Math.random().toString(36).slice(2, 9);

/* ---------------- State ---------------- */
const state = {
  cues: [],            // {id, start, end, text}
  activeId: null,
  style: {
    fontFamily: 'Poppins',
    fontSize: 42,        // slider px, relative to 800px reference height
    fontWeight: '700',
    fontColor: '#ffffff',
    hlColor: '#ffe600',
    italic: false,
    uppercase: false,
    effect: 'karaoke',
    strokeW: 2,
    strokeColor: '#000000',
    shadow: 4,
    shadowColor: '#000000',
    bgEnabled: true,
    bgColor: '#000000',
    bgOpacity: 55,
    padding: 12,
    radius: 10,
    vPos: 'bottom',
    vOffset: 6,          // % margin
    align: 'center',
    lineHeight: 1.25,
    maxWidth: 86,        // % of frame
  },
  videoSrc: null,
  videoName: 'video',
};

const BUILT_IN_FONTS = [
  'Poppins', 'Inter', 'Roboto', 'Space Grotesk', 'Noto Sans',
  'Anton', 'Bebas Neue', 'Dancing Script', 'Playfair Display',
  'Arial', 'Impact', 'Georgia', 'Verdana', 'Trebuchet MS', 'Courier New',
];

const SAMPLE_VIDEO = 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4';

/* ---------------- Helpers ---------------- */
function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  $('toasts').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 350); }, 2600);
}

function download(url, filename) {
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
}

function formatClock(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60), s = sec - m * 60;
  return String(m).padStart(2, '0') + ':' + s.toFixed(1).padStart(4, '0');
}

function formatSRT(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60), ms = Math.floor((sec % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function formatVTT(sec) {
  return formatSRT(sec).replace(',', '.');
}

function formatLRC(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60), s = (sec % 60);
  return `[${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}]`;
}

/** Parse "MM:SS.d", "SS.s", "HH:MM:SS,mmm" or plain seconds -> seconds */
function parseTime(str) {
  if (typeof str === 'number') return str;
  str = String(str).trim().replace(',', '.');
  if (/^[\d.]+$/.test(str)) return parseFloat(str) || 0;
  const parts = str.split(':').map(Number);
  if (parts.some(isNaN)) return 0;
  let sec = 0;
  if (parts.length === 2) sec = parts[0] * 60 + parts[1];
  else if (parts.length === 3) sec = parts[0] * 3600 + parts[1] * 60 + parts[2];
  return Math.max(0, sec);
}

function hexToRgba(hex, alphaPct) {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(v, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alphaPct / 100})`;
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ---------------- Cues ---------------- */
function sortCues() {
  state.cues.sort((a, b) => a.start - b.start || a.end - b.end);
}

function addCue(start = 0, end = 0, text = '', focus = false) {
  const cue = { id: uid(), start, end, text };
  state.cues.push(cue);
  sortCues();
  renderCues();
  if (focus) {
    const ta = document.querySelector(`.cue[data-id="${cue.id}"] textarea`);
    if (ta) { ta.focus(); }
  }
  return cue;
}

function deleteCue(id) {
  state.cues = state.cues.filter((c) => c.id !== id);
  renderCues();
}

function getActiveCue(t) {
  return state.cues.find((c) => t >= c.start && t <= c.end) || null;
}

function progressInCue(cue, t) {
  if (!cue || cue.end <= cue.start) return 0;
  return Math.min(1, Math.max(0, (t - cue.start) / (cue.end - cue.start)));
}

function renderCues() {
  const list = $('cuesList');
  const q = ($('cueSearch').value || '').toLowerCase();
  let cues = [...state.cues];
  if ($('sortCues').value === 'recent') cues.reverse();
  if (q) cues = cues.filter((c) => c.text.toLowerCase().includes(q));
  $('cueCount').textContent = state.cues.length;

  if (!cues.length) {
    list.innerHTML = `<div class="empty"><p>🎬 No captions yet</p><span>Add lines manually, import .srt/.vtt/.lrc, or use the Lyrics wizard.</span></div>`;
    return;
  }
  list.innerHTML = '';
  cues.forEach((cue, i) => {
    const div = document.createElement('div');
    div.className = 'cue' + (cue.id === state.activeId ? ' active' : '');
    div.dataset.id = cue.id;
    div.innerHTML = `
      <div class="cue-top">
        <span class="idx">#${i + 1}</span>
        <input type="text" class="t-start" value="${formatClock(cue.start)}" title="Start time" />
        <span style="color:var(--muted)">→</span>
        <input type="text" class="t-end" value="${formatClock(cue.end)}" title="End time" />
      </div>
      <textarea rows="2" placeholder="Lyric / subtitle text…">${escapeHtml(cue.text)}</textarea>
      <div class="cue-actions">
        <button class="mini" data-act="seek">⏯ Play from here</button>
        <button class="mini" data-act="setStart">◉ Start = ▶</button>
        <button class="mini" data-act="setEnd">◉ End = ▶</button>
        <button class="mini danger" data-act="del">🗑</button>
      </div>`;
    const video = $('video');
    div.querySelector('.t-start').addEventListener('change', (e) => { cue.start = parseTime(e.target.value); sortCues(); renderCues(); });
    div.querySelector('.t-end').addEventListener('change', (e) => { cue.end = parseTime(e.target.value); sortCues(); renderCues(); });
    div.querySelector('textarea').addEventListener('input', (e) => { cue.text = e.target.value; updateOverlay(); });
    div.querySelectorAll('.mini').forEach((b) => b.addEventListener('click', () => {
      const act = b.dataset.act;
      if (act === 'del') deleteCue(cue.id);
      else if (act === 'seek' && video.src) { video.currentTime = cue.start + 0.01; video.play().catch(() => {}); }
      else if (act === 'setStart') { cue.start = round2(video.currentTime || 0); if (cue.end <= cue.start) cue.end = round2(cue.start + 2); sortCues(); renderCues(); }
      else if (act === 'setEnd') { cue.end = round2(video.currentTime || 0); sortCues(); renderCues(); }
    }));
    list.appendChild(div);
  });
}

function round2(n) { return Math.round(n * 100) / 100; }

function markActiveCue(id) {
  if (state.activeId === id) return;
  state.activeId = id;
  document.querySelectorAll('.cue').forEach((el) => {
    el.classList.toggle('active', el.dataset.id === id);
  });
  if (id) {
    const el = document.querySelector(`.cue[data-id="${id}"]`);
    if (el && !$('video').paused) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

/* ---------------- Video ---------------- */
const video = $('video');

function loadVideo(src, name = 'video') {
  state.videoSrc = src;
  state.videoName = (name || 'video').replace(/\.[^.]+$/, '');
  video.src = src;
  video.hidden = false;
  $('dropzone').style.display = 'none';
  $('overlay').hidden = false;
  $('previewBadge').hidden = false;
  $('changeVideoBtn').hidden = false;
  video.load();
  toast('🎬 Video loaded: ' + name, 'ok');
}

$('videoInput').addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (f) loadVideo(URL.createObjectURL(f), f.name);
  e.target.value = '';
});

$('sampleVideoBtn').addEventListener('click', () => loadVideo(SAMPLE_VIDEO, 'sample-video.mp4'));
$('changeVideoBtn').addEventListener('click', () => $('videoInput').click());

['dragover', 'dragenter'].forEach((ev) => $('videoWrap').addEventListener(ev, (e) => {
  e.preventDefault(); $('videoWrap').classList.add('dragover');
}));
['dragleave', 'drop'].forEach((ev) => $('videoWrap').addEventListener(ev, (e) => {
  e.preventDefault(); $('videoWrap').classList.remove('dragover');
}));
$('videoWrap').addEventListener('drop', (e) => {
  const f = e.dataTransfer.files && e.dataTransfer.files[0];
  if (f && f.type.startsWith('video')) loadVideo(URL.createObjectURL(f), f.name);
  else if (f) toast('Please drop a video file', 'err');
});

/* Transport */
function togglePlay() {
  if (!video.src) { toast('Load a video first'); return; }
  if (video.paused) video.play().catch(() => {}); else video.pause();
}
$('playBtn').addEventListener('click', togglePlay);
video.addEventListener('play', () => ($('playBtn').textContent = '⏸'));
video.addEventListener('pause', () => ($('playBtn').textContent = '▶'));
video.addEventListener('loadedmetadata', () => {
  $('timeLabel').textContent = `00:00.0 / ${formatClock(video.duration)}`;
});
video.addEventListener('timeupdate', () => {
  if (isFinite(video.duration) && video.duration > 0) {
    $('seekBar').value = Math.round((video.currentTime / video.duration) * 1000);
    $('timeLabel').textContent = `${formatClock(video.currentTime)} / ${formatClock(video.duration)}`;
  }
  const cue = getActiveCue(video.currentTime);
  markActiveCue(cue ? cue.id : null);
  updateOverlay();
});
$('seekBar').addEventListener('input', () => {
  if (isFinite(video.duration) && video.duration > 0) {
    video.currentTime = ($('seekBar').value / 1000) * video.duration;
  }
});
$('addCueAtBtn').addEventListener('click', () => {
  const t = round2(video.currentTime || 0);
  addCue(t, round2(t + 3), '', true);
});
$('addCueBtn').addEventListener('click', () => {
  const last = state.cues[state.cues.length - 1];
  const t = last ? round2(last.end + 0.3) : 0;
  addCue(t, round2(t + 3), '', true);
});
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) {
    e.preventDefault(); togglePlay();
  }
});

/* ---------------- Style controls ---------------- */
function fillFontList() {
  const sel = $('fontFamily');
  sel.innerHTML = '';
  BUILT_IN_FONTS.forEach((f) => {
    const o = document.createElement('option');
    o.value = f; o.textContent = f;
    o.style.fontFamily = `'${f}', sans-serif`;
    sel.appendChild(o);
  });
  sel.value = state.style.fontFamily;
}

const PRESETS = {
  youtube:   { fontFamily: 'Roboto', fontSize: 40, fontWeight: '700', fontColor: '#ffffff', hlColor: '#ffe600', italic: false, uppercase: false, effect: 'none', strokeW: 2, strokeColor: '#000000', shadow: 3, shadowColor: '#000000', bgEnabled: true, bgColor: '#000000', bgOpacity: 60, padding: 10, radius: 8, vPos: 'bottom', vOffset: 6, align: 'center', lineHeight: 1.25, maxWidth: 86 },
  tiktok:    { fontFamily: 'Poppins', fontSize: 58, fontWeight: '800', fontColor: '#ffffff', hlColor: '#ffe600', italic: false, uppercase: false, effect: 'pop', strokeW: 3, strokeColor: '#000000', shadow: 5, shadowColor: '#000000', bgEnabled: false, bgColor: '#000000', bgOpacity: 55, padding: 12, radius: 10, vPos: 'middle', vOffset: 6, align: 'center', lineHeight: 1.3, maxWidth: 90 },
  karaoke:   { fontFamily: 'Poppins', fontSize: 46, fontWeight: '700', fontColor: '#ffffff', hlColor: '#ffe600', italic: false, uppercase: false, effect: 'karaoke', strokeW: 2, strokeColor: '#000000', shadow: 4, shadowColor: '#000000', bgEnabled: true, bgColor: '#000000', bgOpacity: 55, padding: 12, radius: 10, vPos: 'bottom', vOffset: 6, align: 'center', lineHeight: 1.25, maxWidth: 86 },
  cinematic: { fontFamily: 'Playfair Display', fontSize: 38, fontWeight: '600', fontColor: '#f5f0e6', hlColor: '#ffd166', italic: true, uppercase: false, effect: 'fade', strokeW: 0, strokeColor: '#000000', shadow: 6, shadowColor: '#000000', bgEnabled: false, bgColor: '#000000', bgOpacity: 55, padding: 12, radius: 10, vPos: 'bottom', vOffset: 8, align: 'center', lineHeight: 1.4, maxWidth: 70 },
  minimal:   { fontFamily: 'Inter', fontSize: 30, fontWeight: '500', fontColor: '#ffffff', hlColor: '#22d3ee', italic: false, uppercase: false, effect: 'none', depth3d: 5, color3d: '#7f1d1d', strokeW: 0, strokeColor: '#000000', shadow: 0, shadowColor: '#000000', bgEnabled: true, bgColor: '#000000', bgOpacity: 65, padding: 10, radius: 8, vPos: 'bottom', vOffset: 5, align: 'center', lineHeight: 1.3, maxWidth: 80 },
  tdpop:     { fontFamily: 'Anton', fontSize: 56, fontWeight: '400', fontColor: '#ffe600', hlColor: '#ff6b6b', italic: false, uppercase: true, effect: 'threed', depth3d: 6, color3d: '#7f1d1d', strokeW: 2, strokeColor: '#000000', shadow: 6, shadowColor: '#000000', bgEnabled: false, bgColor: '#000000', bgOpacity: 55, padding: 12, radius: 10, vPos: 'bottom', vOffset: 6, align: 'center', lineHeight: 1.3, maxWidth: 88 },
};

$('presetRow').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-preset]');
  if (!b) return;
  Object.assign(state.style, PRESETS[b.dataset.preset]);
  syncStyleControls();
  updateOverlay();
  toast('🎨 Preset applied: ' + b.textContent.trim(), 'ok');
});

function syncStyleControls() {
  const s = state.style;
  if (![...$('fontFamily').options].some((o) => o.value === s.fontFamily)) {
    const o = document.createElement('option');
    o.value = s.fontFamily; o.textContent = s.fontFamily;
    $('fontFamily').appendChild(o);
  }
  $('fontFamily').value = s.fontFamily;
  $('fontSize').value = s.fontSize; $('fontSizeOut').textContent = s.fontSize + 'px';
  $('fontWeight').value = s.fontWeight;
  $('fontColor').value = s.fontColor;
  $('hlColor').value = s.hlColor;
  $('fontItalic').checked = s.italic;
  $('fontUppercase').checked = s.uppercase;
  $('effect').value = s.effect;
  $('depth3d').value = s.depth3d; $('depth3dOut').textContent = s.depth3d + 'px';
  $('color3d').value = s.color3d;
  $('strokeW').value = s.strokeW; $('strokeWOut').textContent = s.strokeW + 'px';
  $('strokeColor').value = s.strokeColor;
  $('shadow').value = s.shadow; $('shadowOut').textContent = s.shadow + 'px';
  $('shadowColor').value = s.shadowColor;
  $('bgEnabled').checked = s.bgEnabled;
  $('bgColor').value = s.bgColor;
  $('bgOpacity').value = s.bgOpacity; $('bgOpOut').textContent = s.bgOpacity + '%';
  $('padding').value = s.padding; $('padOut').textContent = s.padding + 'px';
  $('radius').value = s.radius; $('radiusOut').textContent = s.radius + 'px';
  $('vOffset').value = s.vOffset; $('vOffOut').textContent = s.vOffset + '%';
  $('lineHeight').value = Math.round(s.lineHeight * 100); $('lhOut').textContent = s.lineHeight.toFixed(2);
  $('maxWidth').value = s.maxWidth; $('maxWOut').textContent = s.maxWidth + '%';
  document.querySelectorAll('#vPosSeg button').forEach((b) => b.classList.toggle('on', b.dataset.v === s.vPos));
  document.querySelectorAll('#alignSeg button').forEach((b) => b.classList.toggle('on', b.dataset.a === s.align));
}

function bindStyle() {
  const s = state.style;
  const upd = () => updateOverlay();
  $('fontFamily').addEventListener('change', (e) => { s.fontFamily = e.target.value; upd(); });
  $('fontSize').addEventListener('input', (e) => { s.fontSize = +e.target.value; $('fontSizeOut').textContent = s.fontSize + 'px'; upd(); });
  $('fontWeight').addEventListener('change', (e) => { s.fontWeight = e.target.value; upd(); });
  $('fontColor').addEventListener('input', (e) => { s.fontColor = e.target.value; upd(); });
  $('hlColor').addEventListener('input', (e) => { s.hlColor = e.target.value; upd(); });
  $('fontItalic').addEventListener('change', (e) => { s.italic = e.target.checked; upd(); });
  $('fontUppercase').addEventListener('change', (e) => { s.uppercase = e.target.checked; upd(); });
  $('effect').addEventListener('change', (e) => { s.effect = e.target.value; upd(); });
  $('strokeW').addEventListener('input', (e) => { s.strokeW = +e.target.value; $('strokeWOut').textContent = s.strokeW + 'px'; upd(); });
  $('strokeColor').addEventListener('input', (e) => { s.strokeColor = e.target.value; upd(); });
  $('shadow').addEventListener('input', (e) => { s.shadow = +e.target.value; $('shadowOut').textContent = s.shadow + 'px'; upd(); });
  $('shadowColor').addEventListener('input', (e) => { s.shadowColor = e.target.value; upd(); });
  $('bgEnabled').addEventListener('change', (e) => { s.bgEnabled = e.target.checked; upd(); });
  $('bgColor').addEventListener('input', (e) => { s.bgColor = e.target.value; upd(); });
  $('bgOpacity').addEventListener('input', (e) => { s.bgOpacity = +e.target.value; $('bgOpOut').textContent = s.bgOpacity + '%'; upd(); });
  $('padding').addEventListener('input', (e) => { s.padding = +e.target.value; $('padOut').textContent = s.padding + 'px'; upd(); });
  $('radius').addEventListener('input', (e) => { s.radius = +e.target.value; $('radiusOut').textContent = s.radius + 'px'; upd(); });
  $('vOffset').addEventListener('input', (e) => { s.vOffset = +e.target.value; $('vOffOut').textContent = s.vOffset + '%'; upd(); });
  $('lineHeight').addEventListener('input', (e) => { s.lineHeight = +e.target.value / 100; $('lhOut').textContent = s.lineHeight.toFixed(2); upd(); });
  $('maxWidth').addEventListener('input', (e) => { s.maxWidth = +e.target.value; $('maxWOut').textContent = s.maxWidth + '%'; upd(); });
  $('vPosSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    s.vPos = b.dataset.v;
    document.querySelectorAll('#vPosSeg button').forEach((x) => x.classList.toggle('on', x === b));
    upd();
  });
  $('alignSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    s.align = b.dataset.a;
    document.querySelectorAll('#alignSeg button').forEach((x) => x.classList.toggle('on', x === b));
    upd();
  });
}

/* Custom font upload */
$('fontUpload').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const name = 'Custom-' + f.name.replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '-');
  try {
    const buf = await f.arrayBuffer();
    const face = new FontFace(name, buf);
    await face.load();
    document.fonts.add(face);
    const o = document.createElement('option');
    o.value = name; o.textContent = '⬆ ' + f.name;
    $('fontFamily').appendChild(o);
    $('fontFamily').value = name;
    state.style.fontFamily = name;
    updateOverlay();
    toast('🔤 Custom font loaded: ' + f.name, 'ok');
  } catch (err) {
    console.error(err);
    toast('Could not load that font file', 'err');
  }
  e.target.value = '';
});

/* ---------------- Overlay preview ---------------- */
// Font px scales with the preview height so export (full-res) matches preview (WYSIWYG)
function previewFontPx() {
  const h = $('videoWrap').clientHeight || 480;
  return (state.style.fontSize / 800) * h;
}

function updateOverlay() {
  const overlay = $('overlay'), box = $('subtitleBox');
  const s = state.style;
  const t = video.currentTime || 0;
  const cue = getActiveCue(t);

  // position
  overlay.className = 'subtitle-overlay pos-' + s.vPos;
  overlay.style.justifyContent = s.align === 'left' ? 'flex-start' : s.align === 'right' ? 'flex-end' : 'center';
  overlay.style.paddingTop = s.vPos === 'top' ? s.vOffset + '%' : '0';
  overlay.style.paddingBottom = s.vPos === 'bottom' ? s.vOffset + '%' : '0';

  if (!cue || !cue.text.trim()) { box.innerHTML = ''; box.style.background = 'transparent'; box.style.padding = '0'; return; }

  const p = progressInCue(cue, t);
  const text = s.uppercase ? cue.text.toUpperCase() : cue.text;
  const words = text.split(/\s+/).filter(Boolean);
  const activeIdx = Math.min(words.length - 1, Math.floor(p * words.length));

  // word spans with karaoke/pop highlight
  let html = '', wi = 0;
  const lines = text.split('\n');
  lines.forEach((line, li) => {
    line.split(/\s+/).filter(Boolean).forEach((w) => {
      let cls = 'w';
      if (s.effect === 'karaoke' && wi <= activeIdx) cls += ' cur';
      if (s.effect === 'pop' && wi === activeIdx) cls += ' cur';
      html += `<span class="${cls}">${escapeHtml(w)}</span> `;
      wi++;
    });
    if (li < lines.length - 1) html += '<br/>';
  });

  const fpx = previewFontPx();
  box.className = 'subtitle-box' + (s.effect === 'pop' ? ' pop' : '');
  box.style.setProperty('--hl', s.hlColor);
  box.innerHTML = html;
  box.style.fontFamily = `'${s.fontFamily}', sans-serif`;
  box.style.fontSize = fpx + 'px';
  box.style.fontWeight = s.fontWeight;
  box.style.fontStyle = s.italic ? 'italic' : 'normal';
  box.style.color = s.fontColor;
  box.style.textAlign = s.align;
  box.style.lineHeight = s.lineHeight;
  box.style.maxWidth = s.maxWidth + '%';
  box.style.padding = s.bgEnabled ? `${(s.padding / 800) * ($('videoWrap').clientHeight || 480)}px ${(s.padding / 800) * ($('videoWrap').clientHeight || 480) * 1.4}px` : '0';
  box.style.borderRadius = s.radius + 'px';
  box.style.background = s.bgEnabled ? hexToRgba(s.bgColor, s.bgOpacity) : 'transparent';
  const strokeScale = fpx / 42;
  box.style.webkitTextStroke = s.strokeW > 0 ? `${Math.max(0.5, s.strokeW * strokeScale * 0.5)}px ${s.strokeColor}` : '0px transparent';
  box.style.paintOrder = 'stroke fill';
  if (s.effect === 'threed' && s.depth3d > 0) {
    // 3D extrude stack + soft drop shadow
    const layers = [];
    const step = Math.max(0.6, strokeScale * 0.9);
    for (let i = 1; i <= s.depth3d; i++) layers.push(`${(i * step).toFixed(1)}px ${(i * step).toFixed(1)}px 0 ${s.color3d}`);
    if (s.shadow > 0) layers.push(`0 ${(s.depth3d * step + s.shadow * strokeScale * 0.4).toFixed(1)}px ${(s.shadow * strokeScale * 0.8).toFixed(1)}px ${s.shadowColor}`);
    box.style.textShadow = layers.join(',');
  } else {
    box.style.textShadow = s.shadow > 0 ? `0 ${Math.max(1, s.shadow * strokeScale * 0.4)}px ${s.shadow * strokeScale * 0.8}px ${s.shadowColor}` : 'none';
  }
  box.style.opacity = s.effect === 'fade' ? String(0.25 + 0.75 * Math.sin(Math.PI * Math.min(1, Math.max(0, p)))) : '1';
}

new ResizeObserver(() => updateOverlay()).observe($('videoWrap'));

/* ---------------- Import / Export captions ---------------- */
$('importCaptions').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const text = await f.text();
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    if (ext === 'json') { loadProject(text); }
    else {
      const cues = ext === 'lrc' ? parseLRC(text) : ext === 'vtt' ? parseVTT(text) : ext === 'srt' ? parseSRT(text) : parsePlain(text);
      if (!cues.length) { toast('No captions found in ' + f.name, 'err'); return; }
      state.cues = cues.map((c) => ({ id: uid(), ...c }));
      sortCues(); renderCues();
      toast(`📥 Imported ${cues.length} lines from ${f.name}`, 'ok');
    }
  } catch (err) { console.error(err); toast('Could not read ' + f.name, 'err'); }
  e.target.value = '';
});

function parseSRT(text) {
  const cues = [];
  const blocks = text.replace(/\r/g, '').split(/\n\s*\n/);
  for (const b of blocks) {
    const lines = b.trim().split('\n');
    if (lines.length < 2) continue;
    const tm = (lines[0].includes('-->') ? lines[0] : lines[1] || '').split('-->');
    if (tm.length < 2) continue;
    const start = parseTime(tm[0]), end = parseTime(tm[1]);
    const txt = (lines[0].includes('-->') ? lines.slice(1) : lines.slice(2)).join('\n').trim();
    if (txt) cues.push({ start, end, text: txt });
  }
  return cues;
}

function parseVTT(text) {
  return parseSRT(text.replace(/^WEBVTT.*$/m, ''));
}

function parseLRC(text) {
  const cues = [];
  const lines = text.split('\n');
  const times = [];
  for (const line of lines) {
    const m = [...line.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    const txt = line.replace(/\[.*?\]/g, '').trim();
    for (const g of m) times.push({ start: (+g[1]) * 60 + (+g[2]), text: txt });
  }
  times.sort((a, b) => a.start - b.start);
  times.forEach((c, i) => {
    const end = i + 1 < times.length ? Math.min(times[i + 1].start - 0.15, c.start + 8) : c.start + 4;
    if (c.text) cues.push({ start: round2(c.start), end: round2(Math.max(end, c.start + 0.5)), text: c.text });
  });
  return cues;
}

function parsePlain(text) {
  const dur = (isFinite(video.duration) && video.duration > 0) ? video.duration : 60;
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const per = Math.max(1, (dur - 1) / Math.max(1, lines.length));
  return lines.map((l, i) => ({ start: round2(i * per), end: round2(Math.min(dur, (i + 1) * per - 0.2)), text: l }));
}

/* Export menu */
$('exportMenuBtn').addEventListener('click', () => {
  $('exportMenu').hidden = !$('exportMenu').hidden;
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('.dropdown')) $('exportMenu').hidden = true;
});
$('exportMenu').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-export]');
  if (!b) return;
  $('exportMenu').hidden = true;
  const kind = b.dataset.export;
  if (!state.cues.length && kind !== 'json') { toast('Nothing to export — add captions first', 'err'); return; }
  if (kind === 'srt') download(URL.createObjectURL(new Blob([toSRT()], { type: 'text/plain' })), state.videoName + '.srt');
  else if (kind === 'vtt') download(URL.createObjectURL(new Blob([toVTT()], { type: 'text/vtt' })), state.videoName + '.vtt');
  else if (kind === 'lrc') download(URL.createObjectURL(new Blob([toLRC()], { type: 'text/plain' })), state.videoName + '.lrc');
  else if (kind === 'json') download(URL.createObjectURL(new Blob([JSON.stringify({ app: 'chatcut', version: 1, style: state.style, cues: state.cues }, null, 2)], { type: 'application/json' })), state.videoName + '.chatcut.json');
  toast('💾 Exported .' + (kind === 'json' ? 'chatcut.json' : kind), 'ok');
});

function toSRT() {
  sortCues();
  return state.cues.map((c, i) => `${i + 1}\n${formatSRT(c.start)} --> ${formatSRT(c.end)}\n${c.text}`).join('\n\n') + '\n';
}
function toVTT() {
  sortCues();
  return 'WEBVTT\n\n' + state.cues.map((c) => `${formatVTT(c.start)} --> ${formatVTT(c.end)}\n${c.text}`).join('\n\n') + '\n';
}
function toLRC() {
  sortCues();
  return state.cues.map((c) => `${formatLRC(c.start)}${c.text.replace(/\n/g, ' ')}`).join('\n') + '\n';
}

function loadProject(text) {
  try {
    const data = JSON.parse(text);
    if (!Array.isArray(data.cues)) throw new Error('bad project');
    state.cues = data.cues.map((c) => ({ id: uid(), start: +c.start || 0, end: +c.end || 0, text: String(c.text || '') }));
    if (data.style) Object.assign(state.style, data.style);
    sortCues(); renderCues(); syncStyleControls(); updateOverlay();
    toast(`🗂️ Project loaded (${state.cues.length} lines)`, 'ok');
  } catch { toast('Invalid project file', 'err'); }
}

/* ---------------- Lyrics wizard ---------------- */
$('lyricsToolBtn').addEventListener('click', () => { $('lyricsModal').hidden = false; });
$('lyricsCancel').addEventListener('click', () => { $('lyricsModal').hidden = true; });
$('lyricsApply').addEventListener('click', () => {
  const lines = $('lyricsText').value.split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) { toast('Paste some lyrics first', 'err'); return; }
  let t = Math.max(0, +$('lyricsStart').value || 0);
  const dur = Math.max(0.5, +$('lyricsDur').value || 3);
  const gap = Math.max(0, +$('lyricsGap').value || 0);
  lines.forEach((l) => {
    state.cues.push({ id: uid(), start: round2(t), end: round2(t + dur), text: l });
    t += dur + gap;
  });
  sortCues(); renderCues();
  $('lyricsModal').hidden = true;
  $('lyricsText').value = '';
  toast(`🎤 Created ${lines.length} timed lines`, 'ok');
});

/* ---------------- Canvas export (burn-in) ---------------- */
let audioCtx = null, mediaSrcNode = null;

function ensureAudioGraph() {
  if (audioCtx) return audioCtx.dest;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  mediaSrcNode = audioCtx.createMediaElementSource(video);
  const dest = audioCtx.createMediaStreamDestination();
  mediaSrcNode.connect(dest);
  mediaSrcNode.connect(audioCtx.destination);
  audioCtx.dest = dest;
  return dest;
}

function pickMime(prefer) {
  const cands = prefer === 'mp4'
    ? ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm']
    : prefer === 'webm'
      ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
      : ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/webm;codecs=vp9,opus', 'video/mp4', 'video/webm'];
  if (typeof MediaRecorder === 'undefined') return null;
  return cands.find((m) => MediaRecorder.isTypeSupported(m)) || '';
}

/** Word-wrap text into lines of {words[]} fitting maxW. Returns {lines, allWords} */
function wrapWords(ctx, text, maxW) {
  const lines = [];
  const allWords = [];
  for (const raw of text.split('\n')) {
    let line = [];
    let w = 0;
    const space = ctx.measureText(' ').width;
    for (const word of raw.split(/\s+/).filter(Boolean)) {
      const ww = ctx.measureText(word).width;
      if (line.length && w + space + ww > maxW) { lines.push(line); line = []; w = 0; }
      line.push(word); allWords.push(word);
      w += (line.length > 1 ? space : 0) + ww;
    }
    if (line.length || !raw.trim()) lines.push(line);
  }
  return { lines, allWords };
}

function drawCaptionFrame(ctx, W, H, t) {
  const s = state.style;
  const cue = getActiveCue(t);
  ctx.drawImage(video, 0, 0, W, H);
  if (!cue || !cue.text.trim()) return;

  const text = s.uppercase ? cue.text.toUpperCase() : cue.text;
  const p = progressInCue(cue, t);
  const fontPx = (s.fontSize / 800) * H;
  const scale = H / 720;
  const padX = (s.padding / 800) * H * 1.4, padY = (s.padding / 800) * H;
  const lineH = fontPx * s.lineHeight;

  ctx.save();
  ctx.font = `${s.italic ? 'italic ' : ''}${s.fontWeight} ${fontPx}px '${s.fontFamily}', sans-serif`;
  ctx.textBaseline = 'top';
  if (s.effect === 'fade') ctx.globalAlpha = 0.25 + 0.75 * Math.sin(Math.PI * Math.min(1, Math.max(0, p)));

  const maxW = W * (s.maxWidth / 100);
  const { lines, allWords } = wrapWords(ctx, text, maxW);
  const activeIdx = Math.min(allWords.length - 1, Math.floor(p * allWords.length));

  // measure block
  const space = ctx.measureText(' ').width;
  const lineWidths = lines.map((ln) => ln.reduce((a, w, i) => a + (i ? space : 0) + ctx.measureText(w).width, 0));
  const blockW = Math.max(0, ...lineWidths);
  const blockH = lines.length * lineH;

  // position
  const marginV = H * (s.vOffset / 100);
  let blockY = s.vPos === 'top' ? marginV : s.vPos === 'middle' ? (H - blockH - padY * 2) / 2 : H - marginV - blockH - padY * 2;
  blockY = Math.max(4, blockY);

  const boxX = s.align === 'left' ? W * (1 - s.maxWidth / 100) / 2 - padX * 0 + (W * 0.04)
    : s.align === 'right' ? W - W * 0.04 - blockW - padX * 2
      : (W - blockW) / 2 - padX;

  // background
  if (s.bgEnabled) {
    ctx.fillStyle = hexToRgba(s.bgColor, s.bgOpacity);
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(boxX, blockY, blockW + padX * 2, blockH + padY * 2, Math.min(60, s.radius * scale));
    else ctx.rect(boxX, blockY, blockW + padX * 2, blockH + padY * 2);
    ctx.fill();
  }

  // shadow + stroke setup
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  const strokePx = s.strokeW * scale * 0.5;
  if (s.shadow > 0) { ctx.shadowColor = s.shadowColor; ctx.shadowBlur = s.shadow * scale * 0.8; ctx.shadowOffsetY = Math.max(1, s.shadow * scale * 0.4); }

  let wi = 0;
  lines.forEach((ln, li) => {
    const lw = lineWidths[li];
    let x = s.align === 'left' ? boxX + padX
      : s.align === 'right' ? boxX + padX + (blockW - lw)
        : boxX + padX + (blockW - lw) / 2;
    const y = blockY + padY + li * lineH;
    ln.forEach((word, k) => {
      if (k) x += space;
      let color = s.fontColor;
      let popScale = 1;
      if (s.effect === 'karaoke' && wi <= activeIdx) color = s.hlColor;
      if (s.effect === 'pop' && wi === activeIdx) { color = s.hlColor; popScale = 1.18; }
      // 3D extrude: paint offset copies underneath, then face on top
      if (s.effect === 'threed' && s.depth3d > 0) {
        ctx.save();
        ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
        ctx.fillStyle = s.color3d;
        const step3d = Math.max(0.6, (fontPx / 42) * 0.9);
        for (let i = s.depth3d; i >= 1; i--) ctx.fillText(word, x + i * step3d, y + i * step3d);
        ctx.restore();
      }
      ctx.save();
      if (popScale !== 1) {
        const ww = ctx.measureText(word).width;
        ctx.translate(x + ww / 2, y + lineH / 2); ctx.scale(popScale, popScale);
        ctx.translate(-(x + ww / 2), -(y + lineH / 2));
      }
      if (strokePx > 0.2) { ctx.strokeStyle = s.strokeColor; ctx.lineWidth = strokePx * 2; ctx.strokeText(word, x, y); }
      ctx.fillStyle = color;
      ctx.fillText(word, x, y);
      ctx.restore();
      x += ctx.measureText(word).width;
      wi++;
    });
  });
  ctx.restore();
}

let exportState = null;

$('exportVideoBtn').addEventListener('click', () => {
  if (!video.src) { toast('Load a video first', 'err'); return; }
  if (!state.cues.length) { toast('Add at least one caption first', 'err'); return; }
  $('exportModal').hidden = false;
  $('exportSetup').hidden = false;
  $('exportProgress').hidden = true;
  $('exportDone').hidden = true;
});
$('exportCancel').addEventListener('click', () => { $('exportModal').hidden = true; });
$('exportClose').addEventListener('click', () => { $('exportModal').hidden = true; });

$('exportStart').addEventListener('click', async () => {
  const mime = pickMime($('expFormat').value);
  if (mime === null) { toast('MediaRecorder not supported in this browser — try Chrome/Edge', 'err'); return; }
  const bitrate = +$('expQuality').value || 4000000;
  const withAudio = $('expAudio').checked;

  const W = video.videoWidth || 1280, H = video.videoHeight || 720;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  try { await document.fonts.ready; } catch { /* ignore */ }

  const stream = canvas.captureStream(30);
  if (withAudio) {
    try {
      await audioCtx?.resume?.().catch(() => {});
      const dest = ensureAudioGraph();
      await audioCtx.resume().catch(() => {});
      dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    } catch (err) { console.warn('audio capture failed', err); toast('⚠️ Continuing without audio capture'); }
  }

  let rec;
  try {
    rec = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: bitrate });
  } catch (err) { console.error(err); toast('Could not start recorder', 'err'); return; }

  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };

  $('exportSetup').hidden = true;
  $('exportProgress').hidden = false;
  const wasMuted = video.muted;
  video.muted = false;

  exportState = { rec, canvas, ctx, W, H, raf: 0, stopped: false };

  const draw = () => {
    if (exportState.stopped) return;
    drawCaptionFrame(ctx, W, H, video.currentTime || 0);
    const pct = video.duration ? Math.min(100, (video.currentTime / video.duration) * 100) : 0;
    $('expBar').style.width = pct + '%';
    $('expLabel').textContent = `Recording… ${pct.toFixed(0)}%`;
    exportState.raf = requestAnimationFrame(draw);
  };

  rec.onstop = () => {
    exportState.stopped = true;
    cancelAnimationFrame(exportState.raf);
    video.pause();
    video.muted = wasMuted;
    const type = (mime || 'video/webm').split(';')[0];
    const ext = type.includes('mp4') ? 'mp4' : 'webm';
    const blob = new Blob(chunks, { type });
    const url = URL.createObjectURL(blob);
    $('exportProgress').hidden = true;
    $('exportDone').hidden = false;
    $('expPreview').src = url;
    const dl = $('expDownload');
    dl.href = url;
    dl.download = `${state.videoName}-chatcut.${ext}`;
    toast('✅ Export complete', 'ok');
  };

  try {
    video.currentTime = 0;
    await video.play().catch(() => {});
    rec.start(250);
    draw();
    video.onended = () => { if (exportState && !exportState.stopped) rec.stop(); };
    // safety: stop shortly after duration in case 'ended' doesn't fire
    setTimeout(() => {
      if (exportState && !exportState.stopped && video.duration && video.currentTime >= video.duration - 0.15) rec.stop();
    }, (video.duration || 10) * 1000 + 3000);
  } catch (err) {
    console.error(err);
    exportState.stopped = true;
    cancelAnimationFrame(exportState.raf);
    toast('Export failed to start', 'err');
  }
});

$('exportAbort').addEventListener('click', () => {
  if (exportState && !exportState.stopped) {
    exportState.stopped = true;
    try { exportState.rec.stop(); } catch { /* ignore */ }
    cancelAnimationFrame(exportState.raf);
    video.pause();
  }
  $('exportModal').hidden = true;
  toast('Export cancelled');
});

/* Search/sort */
$('cueSearch').addEventListener('input', renderCues);
$('sortCues').addEventListener('change', renderCues);

/* ---------------- My Song (user's lyrics, one-click load) ---------------- */
const MY_SONG = [
  { start: 0.5, end: 3.85, text: 'Kila kila mani kalaavaru rani' },
  { start: 4.0, end: 7.85, text: 'ghallughallu mane kadhaakali kaanee' },
  { start: 8.0, end: 12.35, text: 'kallem leni kallalloni kavvintalni hello ani' },
  { start: 12.5, end: 15.85, text: 'chal mohanaanga sukhalaku bonee' },
  { start: 16.0, end: 19.35, text: 'chaligili annee polo mani ponee' },
  { start: 19.5, end: 23.85, text: 'sigge leni singaaraanni chindinchanee chalo honey' },
  { start: 24.0, end: 28.0, text: 'madhanudi paalai ponee mudirina bhaavaalannee' },
];

$('loadSongBtn').addEventListener('click', async () => {
  // Try the LRC file first (works when served over http), fall back to built-in copy
  let cues = null;
  try {
    const res = await fetch('samples/kila-kila-lyrics.lrc', { cache: 'no-store' });
    if (res.ok) {
      const parsed = parseLRC(await res.text());
      if (parsed.length) cues = parsed;
    }
  } catch { /* file:// mode — use built-in copy */ }
  if (!cues) cues = MY_SONG;
  if (state.cues.length && !confirm(`Replace current ${state.cues.length} lines with your song lyrics (${cues.length} lines)?`)) return;
  state.cues = cues.map((c) => ({ id: uid(), start: c.start, end: c.end, text: c.text }));
  sortCues(); renderCues();
  if (video.src) { video.currentTime = 0.01; }
  updateOverlay();
  toast(`🎵 Loaded your song — ${cues.length} lines`, 'ok');
});

/* ---------------- Init ---------------- */
fillFontList();
bindStyle();
syncStyleControls();
renderCues();
// Demo captions so first-time users see styling instantly
addCue(0.5, 3.5, '♪ Welcome to ChatCut ♪');
addCue(3.8, 7.0, 'Add lyrics & subtitles with any font');
addCue(7.3, 10.5, 'Style them on the right, then Export Video 🎬');
['change', 'input'].forEach((ev) => document.addEventListener(ev, () => { /* keep overlay live while scrubbing with no video */ }));
video.addEventListener('seeked', updateOverlay);
updateOverlay();
