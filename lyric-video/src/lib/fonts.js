'use strict';

const fs = require('fs');
const path = require('path');
const opentype = require('opentype.js');

const FONT_DIR = path.join(__dirname, '..', '..', 'fonts');

// Registry of available fonts (family name -> file + weight ordering).
const FILES = {
  'Anton': 'Anton-Regular.ttf',
  'Bebas Neue': 'BebasNeue-Regular.ttf',
  'Archivo Black': 'ArchivoBlack-Regular.ttf',
  'Barlow Condensed': 'BarlowCondensed-Bold.ttf',
  'Poppins Bold': 'Poppins-Bold.ttf',
  'Poppins SemiBold': 'Poppins-SemiBold.ttf',
  'Poppins': 'Poppins-Regular.ttf',
};

const cache = new Map();

function load(family) {
  if (cache.has(family)) return cache.get(family);
  const file = FILES[family] || FILES['Anton'];
  const full = path.join(FONT_DIR, file);
  const font = opentype.parse(fs.readFileSync(full).buffer);
  const rec = { font, file: full, family };
  cache.set(family, rec);
  return rec;
}

// Absolute paths of every bundled font file (handed to resvg so it can render).
function allFontPaths() {
  return Object.values(FILES).map((f) => path.join(FONT_DIR, f)).filter((p) => fs.existsSync(p));
}

// Accurate advance width of a string at a given px size.
function measure(family, text, size, letterSpacing = 0) {
  const { font } = load(family);
  const base = font.getAdvanceWidth(text, size);
  return base + letterSpacing * Math.max(0, text.length - 1);
}

module.exports = { load, measure, allFontPaths, FILES };
