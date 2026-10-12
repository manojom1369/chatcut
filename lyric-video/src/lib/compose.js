'use strict';

const { background } = require('./background');
const { buildLyrics } = require('./lyrics');
const { glowFilter, linearGradient, esc } = require('./svg');
const { clamp, easeOutBack, easeOutCubic } = require('./util');

function hud(t, cfg) {
  const { width: W } = cfg;
  const th = cfg.themeColors;
  const introIn = easeOutCubic(clamp((t - 0.15) / 0.7));
  const y = 150;
  const w = Math.min(W * 0.72, 640);
  const x = (W - w) / 2;
  const out = [];
  out.push(`<g opacity="${(introIn * 0.96).toFixed(3)}" transform="translate(0 ${((1 - introIn) * -40).toFixed(1)})">`);
  out.push(`<rect x="${x}" y="${y}" width="${w}" height="92" rx="46" fill="#ffffff" opacity="0.08"/>`);
  out.push(`<rect x="${x}" y="${y}" width="${w}" height="92" rx="46" fill="none" stroke="url(#accentGrad)" stroke-width="2" opacity="0.5"/>`);
  const pulse = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 4));
  out.push(`<circle cx="${x + 52}" cy="${y + 46}" r="7" fill="${th.accent}" opacity="${pulse.toFixed(3)}"/>`);
  out.push(`<text x="${x + 84}" y="${y + 42}" font-family="Poppins SemiBold" font-size="24" fill="${th.accent}" letter-spacing="3">NOW PLAYING</text>`);
  out.push(`<text x="${x + 84}" y="${y + 74}" font-family="Poppins Bold" font-size="30" fill="#ffffff">${esc((cfg.title || '').toUpperCase())}</text>`);
  out.push(`<text x="${x + w - 26}" y="${y + 60}" text-anchor="end" font-family="Poppins" font-size="24" fill="#ffffff" opacity="0.7">${esc(cfg.artist || '')}</text>`);
  out.push('</g>');
  return out.join('');
}

function progress(t, cfg) {
  const { width: W, height: H } = cfg;
  const p = clamp(t / cfg.duration);
  const barW = W * 0.86;
  const x = (W - barW) / 2;
  const y = H - 150;
  const fmt = (s) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
  const out = [];
  out.push(`<rect x="${x}" y="${y}" width="${barW}" height="8" rx="4" fill="#ffffff" opacity="0.16"/>`);
  out.push(`<rect x="${x}" y="${y}" width="${(barW * p).toFixed(1)}" height="8" rx="4" fill="url(#accentGrad)"/>`);
  out.push(`<circle cx="${(x + barW * p).toFixed(1)}" cy="${y + 4}" r="9" fill="#ffffff" opacity="0.95"/>`);
  out.push(`<text x="${x}" y="${y + 44}" font-family="Poppins" font-size="22" fill="#ffffff" opacity="0.6">${fmt(t)}</text>`);
  out.push(`<text x="${x + barW}" y="${y + 44}" text-anchor="end" font-family="Poppins" font-size="22" fill="#ffffff" opacity="0.6">${fmt(cfg.duration)}</text>`);
  return out.join('');
}

function intro(t, cfg) {
  if (!cfg.intro) return '';
  const dur = cfg.intro.duration || 2.4;
  if (t >= dur) return '';
  const inP = easeOutCubic(clamp(t / 0.8));
  const outP = clamp((t - (dur - 0.6)) / 0.6);
  const op = inP * (1 - outP);
  const scale = easeOutBack(clamp(t / 0.9), 1.2) * (1 + outP * 0.15);
  const cy = cfg.height * 0.5;
  const sub = cfg.intro.subtitle || 'LYRIC VIDEO';
  return `<g opacity="${op.toFixed(3)}" transform="translate(${cfg.width / 2} ${cy}) scale(${scale.toFixed(3)}) translate(${-cfg.width / 2} ${-cy})">
    <text x="${cfg.width / 2}" y="${cy}" text-anchor="middle" font-family="${esc(cfg.fontMain)}" font-size="${Math.round(cfg.fontSize * 1.15)}" fill="url(#accentGrad)" filter="url(#textGlow)">${esc((cfg.intro.title || cfg.title || '').toUpperCase())}</text>
    <text x="${cfg.width / 2}" y="${cy + cfg.fontSize * 0.95}" text-anchor="middle" font-family="Bebas Neue" font-size="${Math.round(cfg.fontSize * 0.5)}" fill="#ffffff" opacity="0.85" letter-spacing="8">${esc(sub)}</text>
  </g>`;
}

function composeFrame(t, cfg) {
  const bg = background(t, cfg);
  const ly = buildLyrics(t, cfg);
  const th = cfg.themeColors;
  const grad = (arr) => arr.map((c, i, a) => ({ o: i / (a.length - 1), c }));
  const defs = [
    bg.defs,
    ly.defs,
    linearGradient('wordGrad', grad(th.textGrad), 0, 0, 1, 1),
    linearGradient('accentGrad', grad(th.accentGrad), 0, 0, 1, 0),
    glowFilter('textGlow', cfg.glow != null ? cfg.glow : 8, 1),
  ].join('');
  const body = [bg.body, ly.body, intro(t, cfg), hud(t, cfg), progress(t, cfg)].join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${cfg.width}" height="${cfg.height}" viewBox="0 0 ${cfg.width} ${cfg.height}"><defs>${defs}</defs>${body}</svg>`;
}

module.exports = { composeFrame, hud, progress, intro };
