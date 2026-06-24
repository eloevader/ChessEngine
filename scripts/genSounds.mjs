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
    else if (type === 'sawtooth') s = 2 * ((freq * t) % 1) - 1;
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

function noise(duration, gain = 0.2) {
  const n = Math.floor(duration * sampleRate);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const env = Math.exp(-t * 8);
    out[i] = (Math.random() * 2 - 1) * env * gain;
  }
  return out;
}

const packs = {
  classic: 'classic',
  retro: 'retro',
  modern: 'modern',
  arcade: 'arcade',
  soft: 'soft',
};

const outDir = path.resolve('public/sounds');
fs.mkdirSync(outDir, { recursive: true });

// === CLASSIC (Lichess-like - we use the existing Lichess mp3s) ===
// Empty for this pack; the SoundManager will fall back to Lichess mp3s

// === RETRO (chiptune-style 8-bit) ===
{
  const move = tone(440, 0.04, 'square', 0.001, 0.02, 0.18);
  writeWav(path.join(outDir, 'retro-move.wav'), move);

  const capture = concat(
    tone(330, 0.03, 'square', 0.001, 0.01, 0.18),
    tone(220, 0.05, 'square', 0.001, 0.02, 0.18),
  );
  writeWav(path.join(outDir, 'retro-capture.wav'), capture);

  const check = concat(
    tone(660, 0.05, 'square', 0.001, 0.02, 0.18),
    tone(880, 0.08, 'square', 0.001, 0.04, 0.18),
  );
  writeWav(path.join(outDir, 'retro-check.wav'), check);

  const checkmate = concat(
    tone(880, 0.08, 'square', 0.001, 0.03, 0.20),
    tone(440, 0.08, 'square', 0.001, 0.03, 0.20),
    tone(220, 0.20, 'square', 0.001, 0.10, 0.20),
  );
  writeWav(path.join(outDir, 'retro-checkmate.wav'), checkmate);

  const draw = concat(
    tone(440, 0.10, 'triangle', 0.005, 0.04, 0.15),
    tone(330, 0.20, 'triangle', 0.005, 0.10, 0.15),
  );
  writeWav(path.join(outDir, 'retro-draw.wav'), draw);

  const victory = concat(
    tone(523.25, 0.10, 'square', 0.001, 0.04, 0.18),
    tone(659.25, 0.10, 'square', 0.001, 0.04, 0.18),
    tone(783.99, 0.10, 'square', 0.001, 0.04, 0.18),
    tone(1046.5, 0.20, 'square', 0.001, 0.10, 0.20),
  );
  writeWav(path.join(outDir, 'retro-victory.wav'), victory);

  const defeat = concat(
    tone(440, 0.10, 'square', 0.001, 0.04, 0.18),
    tone(349.23, 0.10, 'square', 0.001, 0.04, 0.18),
    tone(261.63, 0.30, 'square', 0.001, 0.15, 0.20),
  );
  writeWav(path.join(outDir, 'retro-defeat.wav'), defeat);

  const error = tone(200, 0.12, 'square', 0.001, 0.05, 0.18);
  writeWav(path.join(outDir, 'retro-error.wav'), error);

  const lowtime = tone(880, 0.06, 'square', 0.001, 0.03, 0.18);
  writeWav(path.join(outDir, 'retro-lowtime.wav'), lowtime);
}

// === MODERN (clean sine waves) ===
{
  const move = tone(700, 0.06, 'sine', 0.005, 0.03, 0.20);
  writeWav(path.join(outDir, 'modern-move.wav'), move);

  const capture = concat(
    tone(900, 0.05, 'sine', 0.005, 0.02, 0.20),
    tone(500, 0.08, 'sine', 0.005, 0.04, 0.18),
  );
  writeWav(path.join(outDir, 'modern-capture.wav'), capture);

  const check = concat(
    tone(1200, 0.04, 'sine', 0.005, 0.02, 0.22),
    tone(1500, 0.10, 'sine', 0.005, 0.05, 0.22),
  );
  writeWav(path.join(outDir, 'modern-check.wav'), check);

  const checkmate = concat(
    tone(1500, 0.08, 'sine', 0.005, 0.04, 0.22),
    tone(1100, 0.10, 'sine', 0.005, 0.05, 0.22),
    tone(700, 0.30, 'sine', 0.005, 0.20, 0.25),
  );
  writeWav(path.join(outDir, 'modern-checkmate.wav'), checkmate);

  const draw = concat(
    tone(600, 0.10, 'sine', 0.01, 0.04, 0.18),
    tone(450, 0.20, 'sine', 0.01, 0.10, 0.18),
  );
  writeWav(path.join(outDir, 'modern-draw.wav'), draw);

  const victory = concat(
    tone(523.25, 0.10, 'sine', 0.01, 0.05, 0.20),
    tone(659.25, 0.10, 'sine', 0.01, 0.05, 0.20),
    tone(783.99, 0.10, 'sine', 0.01, 0.05, 0.20),
    tone(1046.5, 0.40, 'sine', 0.01, 0.30, 0.25),
  );
  writeWav(path.join(outDir, 'modern-victory.wav'), victory);

  const defeat = concat(
    tone(523.25, 0.10, 'sine', 0.01, 0.05, 0.20),
    tone(392.00, 0.10, 'sine', 0.01, 0.05, 0.20),
    tone(261.63, 0.40, 'sine', 0.01, 0.30, 0.20),
  );
  writeWav(path.join(outDir, 'modern-defeat.wav'), defeat);

  const error = tone(300, 0.15, 'sine', 0.005, 0.10, 0.20);
  writeWav(path.join(outDir, 'modern-error.wav'), error);

  const lowtime = tone(1320, 0.05, 'sine', 0.005, 0.03, 0.20);
  writeWav(path.join(outDir, 'modern-lowtime.wav'), lowtime);
}

// === ARCADE (bouncy, game-like) ===
{
  const move = concat(
    tone(500, 0.04, 'square', 0.001, 0.02, 0.18),
    tone(700, 0.04, 'square', 0.001, 0.02, 0.18),
  );
  writeWav(path.join(outDir, 'arcade-move.wav'), move);

  const capture = concat(
    noise(0.05, 0.25),
    tone(200, 0.10, 'square', 0.001, 0.05, 0.20),
  );
  writeWav(path.join(outDir, 'arcade-capture.wav'), capture);

  const check = concat(
    tone(800, 0.05, 'square', 0.001, 0.02, 0.20),
    tone(1200, 0.08, 'square', 0.001, 0.04, 0.20),
  );
  writeWav(path.join(outDir, 'arcade-check.wav'), check);

  const checkmate = concat(
    tone(1000, 0.06, 'square', 0.001, 0.02, 0.22),
    tone(800, 0.06, 'square', 0.001, 0.02, 0.22),
    tone(600, 0.06, 'square', 0.001, 0.02, 0.22),
    tone(400, 0.30, 'square', 0.001, 0.15, 0.25),
  );
  writeWav(path.join(outDir, 'arcade-checkmate.wav'), checkmate);

  const draw = concat(
    tone(500, 0.10, 'triangle', 0.005, 0.05, 0.18),
    tone(400, 0.20, 'triangle', 0.005, 0.10, 0.18),
  );
  writeWav(path.join(outDir, 'arcade-draw.wav'), draw);

  const victory = concat(
    tone(523.25, 0.08, 'square', 0.001, 0.03, 0.20),
    tone(659.25, 0.08, 'square', 0.001, 0.03, 0.20),
    tone(783.99, 0.08, 'square', 0.001, 0.03, 0.20),
    tone(1046.5, 0.50, 'square', 0.001, 0.30, 0.25),
  );
  writeWav(path.join(outDir, 'arcade-victory.wav'), victory);

  const defeat = concat(
    tone(440, 0.10, 'sawtooth', 0.005, 0.04, 0.18),
    tone(330, 0.10, 'sawtooth', 0.005, 0.04, 0.18),
    tone(220, 0.40, 'sawtooth', 0.005, 0.20, 0.20),
  );
  writeWav(path.join(outDir, 'arcade-defeat.wav'), defeat);

  const error = noise(0.15, 0.20);
  writeWav(path.join(outDir, 'arcade-error.wav'), error);

  const lowtime = tone(880, 0.04, 'square', 0.001, 0.02, 0.20);
  writeWav(path.join(outDir, 'arcade-lowtime.wav'), lowtime);
}

// === SOFT (gentle wood-block feel) ===
{
  function pluck(freq, dur, gain = 0.22) {
    const n = Math.floor(dur * sampleRate);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / sampleRate;
      const env = Math.exp(-t * 18);
      out[i] = Math.sin(2 * Math.PI * freq * t) * env * gain;
    }
    return out;
  }

  const move = pluck(640, 0.08);
  writeWav(path.join(outDir, 'soft-move.wav'), move);

  const capture = concat(pluck(540, 0.06), pluck(360, 0.10));
  writeWav(path.join(outDir, 'soft-capture.wav'), capture);

  const check = concat(pluck(880, 0.06), pluck(1100, 0.10));
  writeWav(path.join(outDir, 'soft-check.wav'), check);

  const checkmate = concat(pluck(880, 0.10), pluck(660, 0.10), pluck(440, 0.30));
  writeWav(path.join(outDir, 'soft-checkmate.wav'), checkmate);

  const draw = concat(pluck(520, 0.10), pluck(390, 0.20));
  writeWav(path.join(outDir, 'soft-draw.wav'), draw);

  const victory = concat(pluck(523.25, 0.10), pluck(659.25, 0.10), pluck(783.99, 0.10), pluck(1046.5, 0.40));
  writeWav(path.join(outDir, 'soft-victory.wav'), victory);

  const defeat = concat(pluck(440, 0.10), pluck(330, 0.10), pluck(220, 0.40));
  writeWav(path.join(outDir, 'soft-defeat.wav'), defeat);

  const error = pluck(220, 0.20, 0.18);
  writeWav(path.join(outDir, 'soft-error.wav'), error);

  const lowtime = pluck(1320, 0.06);
  writeWav(path.join(outDir, 'soft-lowtime.wav'), lowtime);
}

// Keep classic ones too (used for the 'classic' pack)
{
  // Same as previous generation for the default 'classic' pack
  const checkmate = concat(
    tone(880, 0.18, 'square', 0.005, 0.05, 0.25),
    tone(659.25, 0.22, 'square', 0.005, 0.06, 0.25),
    tone(523.25, 0.45, 'sawtooth', 0.005, 0.18, 0.30),
  );
  writeWav(path.join(outDir, 'checkmate.wav'), checkmate);

  const error = tone(180, 0.18, 'square', 0.005, 0.04, 0.25);
  writeWav(path.join(outDir, 'error.wav'), error);

  const victory = concat(
    tone(523.25, 0.12, 'sine', 0.005, 0.04, 0.3),
    tone(659.25, 0.12, 'sine', 0.005, 0.04, 0.3),
    tone(783.99, 0.12, 'sine', 0.005, 0.04, 0.3),
    tone(1046.5, 0.4, 'sine', 0.005, 0.3, 0.4),
  );
  writeWav(path.join(outDir, 'victory.wav'), victory);
}

console.log('Generated sound files for packs:', Object.keys(packs).join(', '));

