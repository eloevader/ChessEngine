import fs from 'node:fs';
import path from 'node:path';

const sampleRate = 22050;

function writeWav(filePath, samples) {
  const numSamples = samples.length;
  const byteLength = 44 + numSamples * 2;
  const buf = Buffer.alloc(byteLength);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(byteLength - 8, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(numSamples * 2, 40);
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.floor(s * 32767), 44 + i * 2);
  }
  fs.writeFileSync(filePath, buf);
}

function tone(freq, duration, type = 'sine', attack = 0.01, release = 0.1, gain = 0.3) {
  const n = Math.floor(duration * sampleRate);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    let env;
    if (t < attack) env = t / attack;
    else if (t > duration - release) env = Math.max(0, (duration - t) / release);
    else env = 1;
    let s = 0;
    if (type === 'sine') s = Math.sin(2 * Math.PI * freq * t);
    else if (type === 'square') s = Math.sign(Math.sin(2 * Math.PI * freq * t));
    else if (type === 'triangle') s = (2 / Math.PI) * Math.asin(Math.sin(2 * Math.PI * freq * t));
    out[i] = s * env * gain;
  }
  return out;
}

function concat(...arrs) {
  const len = arrs.reduce((s, a) => s + a.length, 0);
  const out = new Float32Array(len);
  let o = 0;
  for (const a of arrs) {
    out.set(a, o);
    o += a.length;
  }
  return out;
}

const outDir = path.resolve('public/sounds');
fs.mkdirSync(outDir, { recursive: true });

// Checkmate: descending minor third stinger
const checkmate = concat(
  tone(880, 0.18, 'square', 0.005, 0.05, 0.25),
  tone(659.25, 0.22, 'square', 0.005, 0.06, 0.25),
  tone(523.25, 0.45, 'sawtooth', 0.005, 0.18, 0.30),
);
writeWav(path.join(outDir, 'checkmate.wav'), checkmate);

// Error: low buzz blip
const error = tone(180, 0.18, 'square', 0.005, 0.04, 0.25);
writeWav(path.join(outDir, 'error.wav'), error);

// Victory: rising arpeggio
const victory = concat(
  tone(523.25, 0.12, 'sine', 0.005, 0.04, 0.3),
  tone(659.25, 0.12, 'sine', 0.005, 0.04, 0.3),
  tone(783.99, 0.12, 'sine', 0.005, 0.04, 0.3),
  tone(1046.5, 0.4, 'sine', 0.005, 0.3, 0.4),
);
writeWav(path.join(outDir, 'victory.wav'), victory);

console.log('Generated:', fs.readdirSync(outDir).filter((f) => f.endsWith('.wav')));
