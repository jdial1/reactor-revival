#!/usr/bin/env node
// Renders every entry in sounds.mjs to public/audio/<name>.mp3.
//
// The shipped assets had no source: they arrived in one bulk commit with no
// generator, so nobody could fix the one that squealed without replacing all
// of them by ear. This script is that source. Output is deterministic — each
// sound seeds its own PRNG — so regenerating produces byte-identical files.
//
//   node scripts/audio/generate-sfx.mjs            # write public/audio
//   node scripts/audio/generate-sfx.mjs --report   # measure, write nothing
//
// Requires @breezystack/lamejs (devDependency, build-time only).

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import lame from "@breezystack/lamejs";
import { SR, peakOf, rmsOf } from "./dsp.mjs";
import { SOUNDS, renderSound } from "./sounds.mjs";

const OUT_DIR = path.resolve(fileURLToPath(new URL("../../public/audio", import.meta.url)));
const KBPS = 96;
const reportOnly = process.argv.includes("--report");

function encodeMp3(samples) {
  const encoder = new lame.Mp3Encoder(1, SR, KBPS);
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    pcm[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  const chunks = [];
  const block = 1152;
  for (let i = 0; i < pcm.length; i += block) {
    const buf = encoder.encodeBuffer(pcm.subarray(i, i + block));
    if (buf.length) chunks.push(Buffer.from(buf));
  }
  const tail = encoder.flush();
  if (tail.length) chunks.push(Buffer.from(tail));
  return Buffer.concat(chunks);
}

// Share of total energy above `hz`. This is the number that made the old
// assets unpleasant, so it is the number the report leads with.
function highBandShare(samples, hz) {
  const N = 4096;
  const bins = new Float64Array(N / 2);
  let frames = 0;
  for (let off = 0; off + N <= samples.length && frames < 16; off += N, frames++) {
    for (let k = 1; k < N / 2; k++) {
      let re = 0;
      let im = 0;
      for (let i = 0; i < N; i++) {
        const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
        const a = (2 * Math.PI * k * i) / N;
        re += samples[off + i] * w * Math.cos(a);
        im -= samples[off + i] * w * Math.sin(a);
      }
      bins[k] += Math.hypot(re, im);
    }
  }
  if (!frames) return null;
  let total = 0;
  let high = 0;
  let peakBin = 0;
  for (let k = 1; k < N / 2; k++) {
    total += bins[k];
    if ((k * SR) / N >= hz) high += bins[k];
    if (bins[k] > bins[peakBin]) peakBin = k;
  }
  return { share: high / (total || 1), dominantHz: Math.round((peakBin * SR) / N) };
}

if (!reportOnly) fs.mkdirSync(OUT_DIR, { recursive: true });

const rows = [];
let failed = 0;
for (const name of Object.keys(SOUNDS)) {
  const samples = renderSound(name);
  const peak = peakOf(samples);
  const rms = rmsOf(samples);
  // Slow DFT: only worth running on the short assets and the head of long ones.
  const spectrum = highBandShare(samples.subarray(0, Math.min(samples.length, SR * 2)), 4000);
  const row = {
    name,
    seconds: +(samples.length / SR).toFixed(2),
    peak: +peak.toFixed(3),
    rms: +rms.toFixed(4),
    dominantHz: spectrum?.dominantHz ?? null,
    above4kHz: spectrum ? +(spectrum.share * 100).toFixed(1) : null,
    loop: !!SOUNDS[name].loop,
  };
  if (peak > 0.85) {
    console.error(`FAIL ${name}: peak ${row.peak} is too hot (clipping risk)`);
    failed++;
  }
  if (row.above4kHz != null && row.above4kHz > 12) {
    console.error(`FAIL ${name}: ${row.above4kHz}% of energy above 4 kHz (harshness budget is 12%)`);
    failed++;
  }
  if (!reportOnly) {
    const mp3 = encodeMp3(samples);
    fs.writeFileSync(path.join(OUT_DIR, `${name}.mp3`), mp3);
    row.kb = Math.round(mp3.length / 1024);
  }
  rows.push(row);
}

const pad = (v, w) => String(v).padEnd(w);
console.log(
  `${pad("sound", 20)}${pad("sec", 6)}${pad("peak", 7)}${pad("rms", 8)}${pad("domHz", 7)}${pad(">4kHz", 7)}${pad("loop", 6)}kb`,
);
for (const r of rows) {
  console.log(
    `${pad(r.name, 20)}${pad(r.seconds, 6)}${pad(r.peak, 7)}${pad(r.rms, 8)}${pad(r.dominantHz ?? "-", 7)}${pad(`${r.above4kHz ?? "-"}%`, 7)}${pad(r.loop ? "yes" : "", 6)}${r.kb ?? ""}`,
  );
}

if (failed) {
  console.error(`\n${failed} sound(s) failed the level/harshness budget.`);
  process.exit(1);
}
console.log(`\n${rows.length} sounds ${reportOnly ? "checked" : `written to ${OUT_DIR}`}.`);
