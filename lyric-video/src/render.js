'use strict';
const { spawn } = require('child_process');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');
const ffmpegPath = require('ffmpeg-static');
const { loadConfig, ROOT } = require('./loadConfig');
const { composeFrame } = require('./lib/compose');
const { allFontPaths } = require('./lib/fonts');

const cfg = loadConfig(process.argv[2] || path.join(ROOT, 'config', 'demo.json'));
const frames = Math.round(cfg.fps * cfg.duration);
const fonts = allFontPaths();

const args = ['-y', '-f', 'image2pipe', '-framerate', String(cfg.fps), '-i', 'pipe:0'];
if (cfg.audio) args.push('-i', cfg.audio);
args.push('-map', '0:v');
if (cfg.audio) args.push('-map', '1:a');
args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'faster', '-crf', '18');
args.push('-movflags', '+faststart');
if (cfg.audio) args.push('-c:a', 'aac', '-b:a', '192k', '-shortest');
args.push(cfg.output);

console.log('ffmpeg:', ffmpegPath);
console.log('output:', cfg.output, `(${cfg.width}x${cfg.height} @${cfg.fps}fps, ${frames} frames, ${cfg.duration}s)`);
const ff = spawn(ffmpegPath, args, { stdio: ['pipe', 'inherit', 'inherit'] });
ff.on('error', (e) => { console.error('ffmpeg spawn error', e); process.exit(1); });
let exitCode = null;
ff.on('close', (c) => { exitCode = c; });

(async () => {
  const t0 = Date.now();
  for (let f = 0; f < frames; f++) {
    const t = f / cfg.fps;
    const svg = composeFrame(t, cfg);
    const png = new Resvg(svg, { font: { fontFiles: fonts, loadSystemFonts: false, defaultFontFamily: cfg.fontMain } }).render().asPng();
    if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
    if (f % 30 === 0 || f === frames - 1) {
      const el = Math.max(0.001, (Date.now() - t0) / 1000);
      const rate = f / el;
      const eta = rate > 0 ? (frames - f) / rate : 0;
      process.stdout.write(`\r  frame ${f + 1}/${frames}  ${rate.toFixed(1)} fps  eta ${eta.toFixed(0)}s      `);
    }
  }
  ff.stdin.end();
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  process.stdout.write(`\n  frames done in ${secs}s\n`);
})();

process.on('exit', () => { if (exitCode != null && exitCode !== 0) console.error('ffmpeg exited with', exitCode); });
