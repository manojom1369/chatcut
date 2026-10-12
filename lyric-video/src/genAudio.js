'use strict';
// Tiny dependency-free synth that writes a 16-bit PCM WAV demo beat.
const fs = require('fs');
const path = require('path');

const SR = 44100;
function writeWav(file, samples) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    let v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE((v * 32767) | 0, 44 + i * 2);
  }
  fs.writeFileSync(file, buf);
}

function gen(duration, outFile) {
  const N = Math.floor(duration * SR);
  const out = new Float32Array(N);
  const bpm = 100, beat = 60 / bpm, bar = beat * 4;
  const prog = [
    [110.0, 130.81, 164.81], // Am
    [87.31, 130.81, 174.61], // F
    [130.81, 164.81, 196.0], // C
    [98.0, 123.47, 146.83],  // G
  ];
  const add = (i, v) => { if (i >= 0 && i < N) out[i] += v; };
  const kick = (t0) => { for (let i = 0; i < 0.22 * SR; i++) { const e = Math.exp(-i / (0.05 * SR)); const f = 55 + 60 * Math.exp(-i / (0.02 * SR)); add(Math.floor(t0 * SR) + i, 0.9 * e * Math.sin(2 * Math.PI * f * i / SR)); } };
  const noise = () => Math.random() * 2 - 1;
  const snare = (t0) => { for (let i = 0; i < 0.16 * SR; i++) { const e = Math.exp(-i / (0.04 * SR)); add(Math.floor(t0 * SR) + i, 0.35 * e * noise()); } };
  const hat = (t0) => { for (let i = 0; i < 0.05 * SR; i++) { const e = Math.exp(-i / (0.012 * SR)); add(Math.floor(t0 * SR) + i, 0.12 * e * (noise() - (out[Math.floor(t0 * SR) + i - 1] || 0))); } };
  for (let b = 0; b * bar < duration; b++) {
    const barT = b * bar;
    const chord = prog[b % prog.length];
    kick(barT); kick(barT + beat * 2.5);
    snare(barT + beat); snare(barT + beat * 3);
    for (let h = 0; h < 8; h++) hat(barT + h * beat * 0.5);
    // bass root on each beat
    for (let q = 0; q < 4; q++) {
      const t0 = barT + q * beat;
      for (let i = 0; i < 0.4 * SR; i++) { const e = Math.exp(-i / (0.18 * SR)); add(Math.floor(t0 * SR) + i, 0.3 * e * Math.sin(2 * Math.PI * chord[0] * i / SR)); }
    }
    // pad chord across the bar
    for (let i = 0; i < bar * SR; i++) {
      const a = Math.min(1, i / (0.4 * SR)) * Math.min(1, (bar * SR - i) / (0.5 * SR));
      let s = 0;
      for (const f of chord) s += Math.sin(2 * Math.PI * f * i / SR);
      add(Math.floor(barT * SR) + i, 0.05 * a * s);
    }
  }
  // gentle fades
  const fade = Math.floor(0.5 * SR);
  for (let i = 0; i < fade; i++) { out[i] *= i / fade; out[N - 1 - i] *= i / fade; }
  writeWav(outFile, out);
  return { file: outFile, seconds: duration };
}

if (require.main === module) {
  const dur = parseFloat(process.argv[2] || '26');
  const out = process.argv[3] || path.join(__dirname, '..', 'assets', 'demo.wav');
  const r = gen(dur, out);
  console.log('wrote', r.file, r.seconds + 's', fs.statSync(out).size + ' bytes');
}

module.exports = { gen };
