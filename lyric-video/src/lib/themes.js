'use strict';

// Colour themes. Each blends a dark wash with 4 drifting blob colours plus a
// text gradient and an accent gradient used for the karaoke highlight.
const THEMES = {
  neon: {
    bgTop: '#0b0b1a', bgBottom: '#05050d',
    blobA: '#6a2cff', blobB: '#ff2d95', blobC: '#00e5ff', blobD: '#ffd200',
    textGrad: ['#ffffff', '#e9e6ff'],
    accentGrad: ['#00e5ff', '#ff2d95'],
    highlightText: '#0a0a14',
    accent: '#ff2d95',
  },
  sunset: {
    bgTop: '#1a0b16', bgBottom: '#07030a',
    blobA: '#ff5f6d', blobB: '#ffc371', blobC: '#a044ff', blobD: '#ff2d95',
    textGrad: ['#fff7e6', '#ffe0c2'],
    accentGrad: ['#ffc371', '#ff5f6d'],
    highlightText: '#1a0b16',
    accent: '#ffc371',
  },
  cyber: {
    bgTop: '#04121a', bgBottom: '#01060a',
    blobA: '#00ffd5', blobB: '#0077ff', blobC: '#b400ff', blobD: '#00e5ff',
    textGrad: ['#eafffb', '#c9fff4'],
    accentGrad: ['#00ffd5', '#0077ff'],
    highlightText: '#02121a',
    accent: '#00ffd5',
  },
  mono: {
    bgTop: '#111111', bgBottom: '#000000',
    blobA: '#3a3a3a', blobB: '#555555', blobC: '#2a2a2a', blobD: '#444444',
    textGrad: ['#ffffff', '#cfcfcf'],
    accentGrad: ['#ffffff', '#9aa0a6'],
    highlightText: '#000000',
    accent: '#ffffff',
  },
};

function resolveTheme(name) {
  return THEMES[name] || THEMES.neon;
}

module.exports = { THEMES, resolveTheme };
