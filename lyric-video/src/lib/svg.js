'use strict';

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function linearGradient(id, stops, x1 = 0, y1 = 0, x2 = 1, y2 = 1) {
  const s = stops
    .map((st) => `<stop offset="${st.o}" stop-color="${st.c}"${st.a != null ? ` stop-opacity="${st.a}"` : ''}/>`)
    .join('');
  return `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${s}</linearGradient>`;
}

function radialGradient(id, stops, cx = 0.5, cy = 0.5, r = 0.5) {
  const s = stops
    .map((st) => `<stop offset="${st.o}" stop-color="${st.c}"${st.a != null ? ` stop-opacity="${st.a}"` : ''}/>`)
    .join('');
  return `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${s}</radialGradient>`;
}

// Soft outer glow: blur a copy of the source, then merge it UNDER the original.
function glowFilter(id, stdDeviation, extra = 1) {
  return `<filter id="${id}" x="-40%" y="-40%" width="180%" height="180%">
    <feGaussianBlur in="SourceGraphic" stdDeviation="${stdDeviation}" result="b"/>
    <feMerge>${Array.from({ length: extra }, () => '<feMergeNode in="b"/>').join('')}<feMergeNode in="SourceGraphic"/></feMerge>
  </filter>`;
}

function dropShadowFilter(id, dx, dy, std, color, opacity = 0.6) {
  return `<filter id="${id}" x="-40%" y="-40%" width="180%" height="180%">
    <feDropShadow dx="${dx}" dy="${dy}" stdDeviation="${std}" flood-color="${color}" flood-opacity="${opacity}"/>
  </filter>`;
}

// SVG transform that scales/rotates a word about its own centre.
function aboutCenter(cx, cy, { scale = 1, rotate = 0, tx = 0, ty = 0 } = {}) {
  return `translate(${tx.toFixed(2)} ${ty.toFixed(2)}) translate(${cx.toFixed(2)} ${cy.toFixed(2)}) rotate(${rotate.toFixed(3)}) scale(${scale.toFixed(4)}) translate(${(-cx).toFixed(2)} ${(-cy).toFixed(2)})`;
}

module.exports = { esc, linearGradient, radialGradient, glowFilter, dropShadowFilter, aboutCenter };
