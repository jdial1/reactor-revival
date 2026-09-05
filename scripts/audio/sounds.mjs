// Sound definitions for the reactor. One entry per public/audio/*.mp3.
//
// Two rules hold for every entry, because the old assets broke both and the
// result was a high-pitched squeal under the reactor:
//   1. Nothing tonal and sustained lives above ~1.5 kHz. Transients may be
//      brighter, but only briefly, and everything passes a lowpass ceiling.
//   2. Levels are set here, not by chance. Peaks stay under 0.8 so no asset
//      clips, and looping beds are matched by RMS so one layer cannot shout
//      over the others.
//
// `loop: true` entries are wrapped with a crossfade so they repeat seamlessly.

import {
  SR, mulberry32, buffer, secs, noise, biquad, ceiling, add, tone, triangle,
  hit, fade, seamless, softClip, normalize,
} from "./dsp.mjs";

const saw = (ph) => {
  const t = (ph / (2 * Math.PI)) % 1;
  return 2 * t - 1;
};

// ---------------------------------------------------------------- ambience --

// A 5 s bed of coolant rumble. Partials are exact multiples of 1/5 Hz so the
// tonal part already loops; the noise is crossfaded by `seamless`.
function ambienceLow(rand) {
  const dur = 5.4;
  const out = buffer(dur);
  const n = out.length;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    out[i] =
      Math.sin(2 * Math.PI * 44 * t) * 0.55 +
      Math.sin(2 * Math.PI * 66 * t + 1.1) * 0.22 +
      Math.sin(2 * Math.PI * 88 * t + 2.3) * 0.12 * (0.6 + 0.4 * Math.sin(2 * Math.PI * 0.4 * t));
  }
  add(out, ceiling(biquad(noise(n, rand), "lowpass", 180), 400), 0.5);
  return normalize(seamless(ceiling(out, 500), 0.4), { rms: 0.09, peak: 0.7 });
}

// Warmer mid bed: the hum of a plant under load. Still nothing above 1 kHz.
function ambienceMedium(rand) {
  const dur = 5.4;
  const out = buffer(dur);
  const n = out.length;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const wobble = 1 + 0.03 * Math.sin(2 * Math.PI * 0.6 * t);
    out[i] =
      Math.sin(2 * Math.PI * 50 * t) * 0.35 +
      Math.sin(2 * Math.PI * 100 * t * wobble) * 0.3 +
      Math.sin(2 * Math.PI * 150 * t + 0.7) * 0.16 +
      Math.sin(2 * Math.PI * 200 * t + 2.0) * 0.08;
  }
  add(out, biquad(noise(n, rand), "bandpass", 320, 0.7), 0.35);
  return normalize(seamless(ceiling(out, 900), 0.4), { rms: 0.085, peak: 0.75 });
}

// The old ambience_high was a 2.3 kHz tone — the squeal. This replaces it with
// turbulence and a low harmonic stack: it reads as "stressed" through loudness
// and movement, not through pitch.
function ambienceHigh(rand) {
  const dur = 5.4;
  const out = buffer(dur);
  const n = out.length;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const surge = 0.7 + 0.3 * Math.sin(2 * Math.PI * 1.2 * t);
    out[i] =
      Math.sin(2 * Math.PI * 55 * t) * 0.3 +
      saw(2 * Math.PI * 110 * t) * 0.16 * surge +
      Math.sin(2 * Math.PI * 165 * t + 1.4) * 0.12 * surge;
  }
  const turbulence = biquad(noise(n, rand), "bandpass", 600, 0.5);
  for (let i = 0; i < n; i++) {
    turbulence[i] *= 0.7 + 0.5 * Math.sin(2 * Math.PI * 3.4 * (i / SR));
  }
  add(out, turbulence, 0.55);
  return normalize(seamless(ceiling(softClip(out), 1400), 0.4), { rms: 0.08, peak: 0.8 });
}

// ---------------------------------------------------------------------- ui --

const uiClick = (rand) => normalize(
  fade(add(
    hit(0.09, { freq: 1400, q: 1.2, decay: 45, rand }),
    tone(0.09, 320, { decay: 30 }), 0.7,
  ), 0.001, 0.03),
  { peak: 0.34 },
);

const tabSwitch = (rand) => normalize(
  fade(add(
    add(buffer(0.12), tone(0.12, (p) => 300 + p * 110, { decay: 12, shape: triangle }), 0.8),
    hit(0.12, { freq: 900, q: 1.5, decay: 40, rand }), 0.35,
  ), 0.002, 0.03),
  { peak: 0.36 },
);

// ------------------------------------------------------------- placement ----

const placement = (rand) => normalize(
  fade(add(
    tone(0.18, (p) => 150 - p * 40, { decay: 16 }),
    hit(0.18, { freq: 700, q: 0.8, decay: 40, rand }), 0.4,
  ), 0.001, 0.04),
  { peak: 0.5 },
);

const placementCell = (rand) => {
  const out = buffer(0.3);
  add(out, tone(0.3, (p) => 170 - p * 50, { decay: 14 }), 0.9);
  add(out, tone(0.3, 480, { decay: 9, shape: triangle }), 0.28);
  add(out, hit(0.3, { freq: 1100, q: 1.4, decay: 45, rand }), 0.3);
  return normalize(fade(ceiling(out, 4500), 0.001, 0.05), { peak: 0.52 });
};

const placementPlating = (rand) => {
  const out = buffer(0.35);
  add(out, tone(0.35, (p) => 110 - p * 30, { decay: 11 }), 1);
  add(out, tone(0.35, 330, { decay: 22, shape: triangle }), 0.22);
  add(out, hit(0.35, { freq: 550, q: 1.1, decay: 30, rand }), 0.35);
  return normalize(fade(ceiling(out, 3500), 0.001, 0.06), { peak: 0.55 });
};

// ------------------------------------------------------------- feedback -----

// A rising minor triad. Confident, not shrill: the top note is 600 Hz.
const upgrade = () => {
  const out = buffer(0.55);
  [300, 450, 600].forEach((hz, i) => {
    add(out, tone(0.4, hz, { decay: 6, attack: 0.01, shape: triangle }), 0.55 - i * 0.1, secs(i * 0.07));
  });
  return normalize(fade(ceiling(out, 3000), 0.004, 0.1), { peak: 0.45 });
};

const sell = (rand) => {
  const out = buffer(0.4);
  add(out, tone(0.35, (p) => 520 - p * 260, { decay: 7, shape: triangle }), 0.7);
  add(out, hit(0.2, { freq: 1400, q: 2, decay: 30, rand }), 0.22);
  return normalize(fade(ceiling(out, 4000), 0.003, 0.08), { peak: 0.44 });
};

// Two short low buzzes. Reads as "no" without being painful.
const error = () => {
  const out = buffer(0.42);
  for (const at of [0, 0.2]) {
    add(out, tone(0.16, 155, { decay: 8, shape: saw }), 0.5, secs(at));
    add(out, tone(0.16, 78, { decay: 8 }), 0.4, secs(at));
  }
  return normalize(fade(ceiling(out, 1600), 0.004, 0.05), { peak: 0.5 });
};

const depletion = (rand) => {
  const out = buffer(0.9);
  add(out, tone(0.9, (p) => 340 * Math.pow(0.28, p), { decay: 3.5, shape: triangle }), 0.8);
  add(out, ceiling(hit(0.9, { freq: 400, q: 0.6, decay: 6, rand }), 1200), 0.4);
  return normalize(fade(out, 0.005, 0.15), { peak: 0.5 });
};

// Looped continuously as the research hum, so it must be seamless and very
// quiet — a faint charged hum with a little crackle, nothing piercing.
function epSpark(rand) {
  const dur = 1.3;
  const out = buffer(dur);
  const n = out.length;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    out[i] = Math.sin(2 * Math.PI * 120 * t) * 0.5 + Math.sin(2 * Math.PI * 180 * t + 0.9) * 0.2;
  }
  const crackle = biquad(noise(n, rand), "bandpass", 1200, 2.5);
  for (let i = 0; i < n; i++) crackle[i] *= Math.max(0, rand() - 0.985) * 60;
  add(out, crackle, 0.5);
  return normalize(seamless(ceiling(out, 2500), 0.15), { rms: 0.05, peak: 0.45 });
}

// ------------------------------------------------------------- industrial ---

const metalClank = (rand) => {
  const out = buffer(0.45);
  // Inharmonic partials, heavily damped — struck steel, ceiling at 4 kHz.
  [[420, 12], [733, 18], [1180, 26], [1970, 38]].forEach(([hz, d], i) => {
    add(out, tone(0.45, hz, { decay: d, shape: triangle }), 0.5 / (i + 1));
  });
  add(out, hit(0.08, { freq: 900, q: 0.7, decay: 60, rand }), 0.5);
  return normalize(fade(ceiling(out, 4000), 0.001, 0.08), { peak: 0.55 });
};

// The old hiss put 55% of its energy in 6-12 kHz. Steam is broadband, but the
// part you want is the 400-2500 Hz body, not the tweeter.
const steamHiss = (rand) => {
  const n = secs(0.8);
  const out = ceiling(biquad(noise(n, rand), "bandpass", 900, 0.6), 2000);
  for (let i = 0; i < n; i++) {
    const p = i / n;
    out[i] *= Math.min(1, p * 12) * Math.exp(-2.6 * p);
  }
  return normalize(fade(out, 0.02, 0.15), { peak: 0.42 });
};

// ---------------------------------------------------------------- events ----

const explosion = (rand) => {
  const out = buffer(1.6);
  const n = out.length;
  const body = biquad(noise(n, rand), "lowpass", 700);
  for (let i = 0; i < n; i++) body[i] *= Math.exp((-5 * i) / n);
  add(out, body, 0.9);
  add(out, tone(1.2, (p) => 90 * Math.pow(0.4, p), { decay: 4 }), 0.8);
  add(out, hit(0.25, { freq: 1800, q: 0.5, decay: 22, rand }), 0.3);
  return normalize(fade(ceiling(softClip(out), 5000), 0.001, 0.2), { peak: 0.78 });
};

const meltdown = (rand) => {
  const dur = 4;
  const out = buffer(dur);
  const n = out.length;
  const roar = biquad(noise(n, rand), "lowpass", 500);
  for (let i = 0; i < n; i++) {
    const p = i / n;
    roar[i] *= Math.min(1, p * 6) * (1 - p * 0.35);
  }
  add(out, roar, 0.9);
  add(out, tone(dur, (p) => 60 + p * 35, { decay: 0.6, attack: 0.2, shape: saw }), 0.45);
  add(out, tone(dur, (p) => 90 - p * 25, { decay: 0.5, attack: 0.3 }), 0.4);
  return normalize(fade(ceiling(softClip(out), 2200), 0.05, 0.6), { peak: 0.78 });
};

// Power-up, read from the bottom of the range: a contactor thump, then a sub
// sweep and a swelling filtered bed. Deliberately no rising whine.
const reboot = (rand) => {
  const dur = 3;
  const out = buffer(dur);
  const n = out.length;
  add(out, tone(0.3, (p) => 130 - p * 60, { decay: 14 }), 0.7);
  add(out, hit(0.3, { freq: 600, q: 0.8, decay: 26, rand }), 0.3);
  add(out, tone(dur, (p) => 38 + p * 52, { decay: 0.4, attack: 0.25 }), 0.75);
  const swell = biquad(noise(n, rand), "lowpass", 420);
  for (let i = 0; i < n; i++) {
    const p = i / n;
    swell[i] *= Math.min(1, p * 2.2) * Math.exp(-1.4 * Math.max(0, p - 0.55));
  }
  add(out, swell, 0.5);
  return normalize(fade(ceiling(out, 2000), 0.01, 0.4), { peak: 0.62 });
};

export const SOUNDS = {
  ambience_low: { seed: 101, loop: true, make: ambienceLow },
  ambience_medium: { seed: 102, loop: true, make: ambienceMedium },
  ambience_high: { seed: 103, loop: true, make: ambienceHigh },
  ui_click: { seed: 201, make: uiClick },
  tab_switch: { seed: 202, make: tabSwitch },
  placement: { seed: 203, make: placement },
  placement_cell: { seed: 204, make: placementCell },
  placement_plating: { seed: 205, make: placementPlating },
  upgrade: { seed: 206, make: upgrade },
  sell: { seed: 207, make: sell },
  error: { seed: 208, make: error },
  depletion: { seed: 209, make: depletion },
  ep_spark: { seed: 210, loop: true, make: epSpark },
  metal_clank: { seed: 301, make: metalClank },
  steam_hiss: { seed: 302, make: steamHiss },
  explosion: { seed: 401, make: explosion },
  meltdown: { seed: 402, make: meltdown },
  reboot: { seed: 403, make: reboot },
};

export const renderSound = (name) => {
  const def = SOUNDS[name];
  return def.make(mulberry32(def.seed));
};
