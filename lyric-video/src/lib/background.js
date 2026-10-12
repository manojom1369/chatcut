'use strict';

const { radialGradient, linearGradient } = require('./svg');
const { mulberry32 } = require('./util');

// Animated "aurora" background: several large, softly-coloured radial blobs that
// drift and breathe, over a dark base, finished with a vignette + star field.
function background(t, cfg) {
  const { width: W, height: H } = cfg;
  const th = cfg.themeColors;
  const defs = [];
  const body = [];

  defs.push(linearGradient('bgBase', [
    { o: 0, c: th.bgTop },
    { o: 1, c: th.bgBottom },
  ], 0, 0, 0, 1));
  body.push(`<rect width="${W}" height="${H}" fill="url(#bgBase)"/>`);

  const blobs = [
    { c: th.blobA, r: 0.75, ax: 0.35, ay: 0.28, sx: 0.11, sy: 0.07, ph: 0.0 },
    { c: th.blobB, r: 0.62, ax: 0.68, ay: 0.42, sx: -0.09, sy: 0.12, ph: 1.7 },
    { c: th.blobC, r: 0.55, ax: 0.5, ay: 0.75, sx: 0.08, sy: -0.1, ph: 3.4 },
    { c: th.blobD, r: 0.45, ax: 0.22, ay: 0.85, sx: -0.07, sy: -0.06, ph: 5.1 },
  ];
  blobs.forEach((b, i) => {
    const cx = (b.ax + Math.sin(t * b.sx * Math.PI * 2 + b.ph) * 0.12) * W;
    const cy = (b.ay + Math.cos(t * b.sy * Math.PI * 2 + b.ph) * 0.1) * H;
    const rr = b.r * (1 + 0.06 * Math.sin(t * 0.5 + i));
    const gid = `blob${i}`;
    defs.push(radialGradient(gid, [
      { o: 0, c: b.c, a: 0.5 },
      { o: 0.55, c: b.c, a: 0.16 },
      { o: 1, c: b.c, a: 0 },
    ], 0.5, 0.5, 0.5));
    body.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(rr * Math.max(W, H)).toFixed(0)}" fill="url(#${gid})"/>`);
  });

  const rnd = mulberry32(1337);
  const N = cfg.particles != null ? cfg.particles : 60;
  const stars = [];
  for (let i = 0; i < N; i++) {
    const bx = rnd() * W;
    const by0 = rnd() * H;
    const spd = 6 + rnd() * 26;
    const size = 1 + rnd() * 2.6;
    const ph = rnd() * Math.PI * 2;
    const drift = rnd();
    const y = (by0 - t * spd) % H;
    const yy = y < 0 ? y + H : y;
    const tw = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * (1.2 + drift * 2) + ph));
    const x = bx + Math.sin(t * 0.3 + ph) * 14;
    stars.push(`<circle cx="${x.toFixed(1)}" cy="${yy.toFixed(1)}" r="${size.toFixed(2)}" fill="#ffffff" opacity="${(tw * 0.7).toFixed(3)}"/>`);
  }
  body.push(`<g>${stars.join('')}</g>`);

  defs.push(radialGradient('vig', [
    { o: 0, c: '#000000', a: 0 },
    { o: 0.62, c: '#000000', a: 0 },
    { o: 1, c: '#000000', a: 0.55 },
  ], 0.5, 0.5, 0.72));
  body.push(`<rect width="${W}" height="${H}" fill="url(#vig)"/>`);

  return { defs: defs.join(''), body: body.join('') };
}

module.exports = { background };
