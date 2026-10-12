'use strict';
// Build a lyric-video config from a base config + a plain-lyrics text file,
// spreading lines evenly across the song (first pass timing you can fine-tune).
// usage: node src/makeConfig.js --base config/demo.json --lyrics lyrics.txt --out config/mysong.json [--start 3] [--gap 0.15] [--duration 210]
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const opt = {};
for (let i = 0; i < args.length; i += 2) opt[args[i].replace(/^--/, '')] = args[i + 1];
if (!opt.base || !opt.lyrics || !opt.out) {
  console.error('usage: node src/makeConfig.js --base <config.json> --lyrics <lyrics.txt> --out <out.json> [--start 3] [--gap 0.15] [--duration 210]');
  process.exit(1);
}

const root = path.join(__dirname, '..');
const base = JSON.parse(fs.readFileSync(path.isAbsolute(opt.base) ? opt.base : path.join(root, opt.base), 'utf8'));
const lines = fs.readFileSync(path.isAbsolute(opt.lyrics) ? opt.lyrics : path.join(root, opt.lyrics), 'utf8')
  .split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
  .filter((s) => !s.startsWith('#'));

const duration = parseFloat(opt.duration || base.duration);
const start = parseFloat(opt.start || '3.0');
const gap = parseFloat(opt.gap || '0.15');
const end = duration - 0.4;
const win = (end - start) / lines.length;
base.duration = duration;
base.lyrics = lines.map((text, i) => ({
  start: +(start + i * win).toFixed(2),
  end: +(start + (i + 1) * win - gap).toFixed(2),
  text,
}));

const out = path.isAbsolute(opt.out) ? opt.out : path.join(root, opt.out);
fs.writeFileSync(out, JSON.stringify(base, null, 2));
console.log('wrote', out, '-', lines.length, 'lines over', duration + 's (', win.toFixed(2), 's per line )');
