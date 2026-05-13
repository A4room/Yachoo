import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, "assets", "sfx");
mkdirSync(outDir, { recursive: true });

const sampleRate = 44100;

function wavFromSamples(samples) {
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }

  return buffer;
}

function envelope(t, duration, attack = 0.01, release = 0.06) {
  if (t < attack) return t / attack;
  if (t > duration - release) return Math.max(0, (duration - t) / release);
  return 1;
}

function tone({ duration, frequency, sweep = 0, type = "sine", volume = 0.35, noise = 0 }) {
  const count = Math.floor(duration * sampleRate);
  const samples = new Float32Array(count);
  let phase = 0;

  for (let i = 0; i < count; i += 1) {
    const t = i / sampleRate;
    const f = frequency + sweep * (t / duration);
    phase += (Math.PI * 2 * f) / sampleRate;
    let wave = Math.sin(phase);

    if (type === "square") wave = wave >= 0 ? 1 : -1;
    if (type === "saw") wave = 2 * ((phase / (Math.PI * 2)) % 1) - 1;

    const crackle = noise ? (Math.random() * 2 - 1) * noise : 0;
    samples[i] = (wave * (1 - noise) + crackle) * envelope(t, duration) * volume;
  }

  return samples;
}

function merge(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const samples = new Float32Array(total);
  let offset = 0;
  for (const part of parts) {
    samples.set(part, offset);
    offset += part.length;
  }
  return samples;
}

function silence(duration) {
  return new Float32Array(Math.floor(duration * sampleRate));
}

const files = {
  "button_click.wav": merge([
    tone({ duration: 0.035, frequency: 1280, sweep: -260, type: "square", volume: 0.16 }),
    tone({ duration: 0.045, frequency: 760, sweep: -220, type: "sine", volume: 0.12 })
  ]),
  "dice_roll.wav": merge([
    tone({ duration: 0.12, frequency: 180, sweep: 720, type: "saw", volume: 0.23, noise: 0.55 }),
    tone({ duration: 0.1, frequency: 460, sweep: -180, type: "square", volume: 0.18, noise: 0.3 }),
    tone({ duration: 0.09, frequency: 230, sweep: 260, type: "saw", volume: 0.2, noise: 0.45 })
  ]),
  "score_lock.wav": merge([
    tone({ duration: 0.08, frequency: 520, type: "sine", volume: 0.22 }),
    tone({ duration: 0.08, frequency: 780, type: "sine", volume: 0.22 }),
    tone({ duration: 0.12, frequency: 1040, type: "sine", volume: 0.18 })
  ]),
  "confetti_pop.wav": merge([
    tone({ duration: 0.08, frequency: 140, sweep: 520, type: "saw", volume: 0.22, noise: 0.5 }),
    silence(0.02),
    tone({ duration: 0.18, frequency: 980, sweep: -420, type: "square", volume: 0.16, noise: 0.25 })
  ]),
  "buzzer.wav": tone({ duration: 0.22, frequency: 115, sweep: -22, type: "square", volume: 0.18, noise: 0.08 })
};

for (const [name, samples] of Object.entries(files)) {
  writeFileSync(join(outDir, name), wavFromSamples(samples));
  console.log(`wrote assets/sfx/${name}`);
}
