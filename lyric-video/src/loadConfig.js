'use strict';
const fs = require('fs');
const path = require('path');
const { resolveTheme } = require('./lib/themes');

const ROOT = path.join(__dirname, '..');

function loadConfig(p) {
  const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
  cfg.width = cfg.width || 1080;
  cfg.height = cfg.height || 1920;
  cfg.fps = cfg.fps || 30;
  cfg.fontMain = cfg.fontMain || 'Anton';
  cfg.fontSize = cfg.fontSize || 130;
  cfg.centerY = cfg.centerY != null ? cfg.centerY : 0.5;
  cfg.themeColors = resolveTheme(cfg.theme);
  if (cfg.audio && !path.isAbsolute(cfg.audio)) cfg.audio = path.join(ROOT, cfg.audio);
  if (cfg.output && !path.isAbsolute(cfg.output)) cfg.output = path.join(ROOT, cfg.output);
  return cfg;
}

module.exports = { loadConfig, ROOT };
