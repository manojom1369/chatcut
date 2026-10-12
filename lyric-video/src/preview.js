'use strict';
// Render single frames to PNG for quick visual checks.
// usage: node src/preview.js config/demo.json 3.4 9.0 12.0
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');
const { loadConfig, ROOT } = require('./loadConfig');
const { composeFrame } = require('./lib/compose');
const { allFontPaths } = require('./lib/fonts');

const cfg = loadConfig(process.argv[2] || path.join(ROOT, 'config', 'demo.json'));
const times = process.argv.slice(3).map(Number).filter((n) => !isNaN(n));
if (!times.length) times.push(1.0, cfg.lyrics[0].start + 0.6, cfg.lyrics[2].start + 0.9, cfg.lyrics[4].start + 0.6);
const fonts = allFontPaths();
const outDir = path.join(ROOT, 'out');
fs.mkdirSync(outDir, { recursive: true });
for (const t of times) {
  const svg = composeFrame(t, cfg);
  const png = new Resvg(svg, { font: { fontFiles: fonts, loadSystemFonts: false, defaultFontFamily: cfg.fontMain } }).render().asPng();
  const f = path.join(outDir, `preview_${t.toFixed(2)}.png`);
  fs.writeFileSync(f, png);
  console.log('wrote', f, png.length + ' bytes');
}
