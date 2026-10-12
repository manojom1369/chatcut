'use strict';

const { measure } = require('./fonts');
const { esc, linearGradient, aboutCenter } = require('./svg');
const { clamp, easeOutBack, easeOutCubic, easeOutQuint } = require('./util');

// ---- layout ------------------------------------------------------------
// Greedy word-wrap using real glyph advance widths, then centre each row.
function layoutLine(line, cfg) {
  const family = cfg.fontMain;
  const spacing = cfg.letterSpacing || 0;
  const maxW = cfg.width * (cfg.maxWidthRatio || 0.84);
  const raw = String(line.text).trim();
  const words = (cfg.uppercase === false ? raw : raw.toUpperCase()).split(/\s+/);

  let size = cfg.fontSize;
  const longest = words.reduce((a, b) => (measure(family, a, size, spacing) >= measure(family, b, size, spacing) ? a : b));
  const longestW = measure(family, longest, size, spacing);
  if (longestW > maxW) size = size * (maxW / longestW);
  if (cfg.minFontSize) size = Math.max(size, cfg.minFontSize);

  const spaceW = measure(family, ' ', size, spacing);
  const rows = [];
  let row = [];
  let rowW = 0;
  for (const w of words) {
    const ww = measure(family, w, size, spacing);
    const add = row.length ? spaceW + ww : ww;
    if (row.length && rowW + add > maxW) {
      rows.push({ words: row, width: rowW });
      row = [w];
      rowW = ww;
    } else {
      row.push(w);
      rowW += add;
    }
  }
  if (row.length) rows.push({ words: row, width: rowW });

  const lineHeight = size * (cfg.lineHeight || 1.12);
  const totalH = (rows.length - 1) * lineHeight;
  const centerY = cfg.centerY * cfg.height;
  let gi = 0;
  rows.forEach((r, ri) => {
    const startX = (cfg.width - r.width) / 2;
    let x = startX;
    r.baseline = centerY - totalH / 2 + ri * lineHeight;
    r.placed = r.words.map((w) => {
      const ww = measure(family, w, size, spacing);
      const item = { word: w, x, w: ww, index: gi++, row: ri, baseline: r.baseline };
      x += ww + spaceW;
      return item;
    });
  });
  return { size, rows, lineHeight, words: rows.flatMap((r) => r.placed), family, spacing };
}

// ---- animation ---------------------------------------------------------
function entrance(wi, t, line, cfg) {
  const stagger = cfg.stagger != null ? cfg.stagger : 0.085;
  const dur = cfg.entranceDur != null ? cfg.entranceDur : 0.55;
  const t0 = line.start + wi.index * stagger;
  return clamp((t - t0) / dur);
}

// Weighted highlight windows: longer words stay lit longer.
function activeWordIndex(layout, t, line, cfg) {
  const D = Math.max(0.2, line.end - line.start);
  const enter = (cfg.entranceDur != null ? cfg.entranceDur : 0.55) + (layout.words.length - 1) * (cfg.stagger != null ? cfg.stagger : 0.085);
  const lead = line.start + Math.min(enter * 0.7, D * 0.5);
  const span = Math.max(0.15, line.end - lead);
  const ws = layout.words.map((w) => w.word.length + 1.5);
  const total = ws.reduce((a, b) => a + b, 0);
  let acc = 0;
  const rel = t - lead;
  for (let i = 0; i < ws.length; i++) {
    const a = (acc / total) * span;
    const b = ((acc + ws[i]) / total) * span;
    if (rel >= a && rel < b) return i;
    acc += ws[i];
  }
  return rel >= span ? layout.words.length - 1 : 0;
}

module.exports = { layoutLine, entrance, activeWordIndex };

// ---- per-frame composition --------------------------------------------
function buildLyrics(t, cfg) {
  const th = cfg.themeColors;
  const defs = [];
  const body = [];

  let line = null;
  for (let i = 0; i < cfg.lyrics.length; i++) {
    const L = cfg.lyrics[i];
    if (t >= L.start && t < L.end) { line = L; break; }
  }
  if (!line) {
    for (let i = cfg.lyrics.length - 1; i >= 0; i--) {
      const L = cfg.lyrics[i];
      if (t >= L.end && t < L.end + 0.5) { line = L; break; }
    }
    if (!line) return { defs: '', body: '' };
  }

  const layout = layoutLine(line, cfg);
  const isTail = t >= line.end;
  const tailP = isTail ? clamp((t - line.end) / 0.5) : 0;


  const active = activeWordIndex(layout, t, line, cfg);
  const style = cfg.highlight || 'box';
  const breathe = 1 + 0.012 * Math.sin(t * 2.2);

  const words = [];
  layout.words.forEach((w) => {
    const p = entrance(w, t, line, cfg);
    if (p <= 0) return;
    const pop = p < 1 ? easeOutBack(p, 1.5) : 1;
    const yOff = (1 - easeOutQuint(p)) * layout.size * 0.9;
    const rot = (1 - easeOutCubic(p)) * (w.index % 2 ? 5 : -5);
    const isActive = !isTail && w.index === active;
    const activePop = isActive ? 1 + 0.1 * (0.5 + 0.5 * Math.sin(t * 9)) : 1;
    const scale = pop * breathe * activePop * (isTail ? 1 + tailP * 0.12 : 1);
    const opacity = (isTail ? 1 - tailP : 1) * clamp(p * 1.4);
    const cx = w.x + w.w / 2;
    const cy = w.baseline - layout.size * 0.34;
    const tf = aboutCenter(cx, cy, { scale, rotate: rot, ty: yOff });
    const centreY = w.baseline - layout.size * 0.34;

    if (style === 'box' && isActive) {
      const padX = layout.size * 0.18;
      const bh = layout.size * 1.02;
      const bx = w.x - padX;
      const by = centreY - bh / 2;
      const bw = w.w + padX * 2;
      const bs = pop * activePop;
      body.push(`<rect x="${bx.toFixed(2)}" y="${by.toFixed(2)}" width="${bw.toFixed(2)}" height="${bh.toFixed(2)}" rx="${(bh * 0.22).toFixed(2)}" fill="url(#accentGrad)" opacity="${(opacity * 0.95).toFixed(3)}" transform="${aboutCenter(bx + bw / 2, by + bh / 2, { scale: bs, rotate: rot * 0.3, ty: yOff })}"/>`);
      words.push(`<text x="${w.x}" y="${w.baseline}" font-family="${esc(layout.family)}" font-size="${layout.size}" letter-spacing="${layout.spacing}" fill="${th.highlightText || '#0a0a14'}" opacity="${opacity.toFixed(3)}" transform="${tf}">${esc(w.word)}</text>`);
    } else {
      const fill = isActive && style === 'color' ? 'url(#accentGrad)' : 'url(#wordGrad)';
      const op = isActive ? opacity : opacity * (isTail ? 1 : 0.92);
      words.push(`<text x="${w.x}" y="${w.baseline}" font-family="${esc(layout.family)}" font-size="${layout.size}" letter-spacing="${layout.spacing}" fill="${fill}" opacity="${op.toFixed(3)}" transform="${tf}">${esc(w.word)}</text>`);
    }
  });

  if (!isTail && cfg.underline !== false) {
    const lp = clamp((t - line.start) / Math.max(0.3, line.end - line.start));
    const cur = cfg.width * 0.5 * easeOutCubic(clamp(lp * 3));
    const y = layout.rows[layout.rows.length - 1].baseline + layout.size * 0.52;
    body.push(`<rect x="${(cfg.width - cur) / 2}" y="${y.toFixed(1)}" width="${cur.toFixed(1)}" height="6" rx="3" fill="url(#accentGrad)" opacity="${(0.9 * (1 - tailP)).toFixed(2)}"/>`);
  }

  body.push(`<g filter="url(#textGlow)">${words.join('')}</g>`);
  return { defs: defs.join(''), body: body.join('') };
}

module.exports = { layoutLine, entrance, activeWordIndex, buildLyrics };
