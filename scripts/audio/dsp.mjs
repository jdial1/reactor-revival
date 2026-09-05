// Minimal DSP toolkit for the offline sound-effect generator.
// Everything is mono Float32 at SR; nothing here runs in the browser.

export const SR = 44100;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const secs = (d) => Math.round(d * SR);
export const buffer = (d) => new Float32Array(secs(d));

export function noise(n, rand) {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = rand() * 2 - 1;
  return out;
}

// RBJ biquad. type: lowpass | highpass | bandpass | peaking
export function biquad(input, type, freq, q = Math.SQRT1_2, gainDb = 0) {
  const w0 = (2 * Math.PI * freq) / SR;
  const cw = Math.cos(w0);
  const sw = Math.sin(w0);
  const alpha = sw / (2 * q);
  const A = Math.pow(10, gainDb / 40);
  let b0, b1, b2, a0, a1, a2;
  if (type === "lowpass") {
    b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0;
    a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
  } else if (type === "highpass") {
    b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0;
    a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
  } else if (type === "bandpass") {
    b0 = alpha; b1 = 0; b2 = -alpha;
    a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
  } else if (type === "peaking") {
    b0 = 1 + alpha * A; b1 = -2 * cw; b2 = 1 - alpha * A;
    a0 = 1 + alpha / A; a1 = -2 * cw; a2 = 1 - alpha / A;
  } else {
    throw new Error(`unknown filter ${type}`);
  }
  const out = new Float32Array(input.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const x = input[i];
    const y = (b0 / a0) * x + (b1 / a0) * x1 + (b2 / a0) * x2 - (a1 / a0) * y1 - (a2 / a0) * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    out[i] = y;
  }
  return out;
}

// Two cascaded lowpasses: a steeper ceiling than one biquad, used to keep
// every asset out of the ear's most piercing band.
export const ceiling = (buf, hz) => biquad(biquad(buf, "lowpass", hz), "lowpass", hz);

export function add(dst, src, gain = 1, offset = 0) {
  for (let i = 0; i < src.length && i + offset < dst.length; i++) dst[i + offset] += src[i] * gain;
  return dst;
}

// Exponential-decay tone. freq may be a number or (progress) => hz.
export function tone(dur, freq, { decay = 4, attack = 0.004, shape = Math.sin, detune = 0 } = {}) {
  const n = secs(dur);
  const out = new Float32Array(n);
  const atk = Math.max(1, secs(attack));
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const p = i / n;
    const hz = (typeof freq === "function" ? freq(p) : freq) + detune;
    phase += (2 * Math.PI * hz) / SR;
    const env = Math.exp(-decay * p) * Math.min(1, i / atk);
    out[i] = shape(phase) * env;
  }
  return out;
}

export const triangle = (ph) => {
  const t = (ph / (2 * Math.PI)) % 1;
  return 4 * Math.abs(t - 0.5) - 1;
};

// Percussive noise body: noise through a bandpass with an exponential tail.
export function hit(dur, { freq, q = 1, decay = 18, attack = 0.001, rand, type = "bandpass" }) {
  const n = secs(dur);
  const src = biquad(noise(n, rand), type, freq, q);
  const atk = Math.max(1, secs(attack));
  for (let i = 0; i < n; i++) src[i] *= Math.exp((-decay * i) / n) * Math.min(1, i / atk);
  return src;
}

export function fade(buf, inSec = 0.005, outSec = 0.02) {
  const a = Math.max(1, secs(inSec));
  const b = Math.max(1, secs(outSec));
  for (let i = 0; i < a && i < buf.length; i++) buf[i] *= i / a;
  for (let i = 0; i < b && i < buf.length; i++) buf[buf.length - 1 - i] *= i / b;
  return buf;
}

// Makes a buffer loop seamlessly by crossfading its tail over its head.
export function seamless(buf, fadeSec = 0.25) {
  const f = Math.min(secs(fadeSec), Math.floor(buf.length / 2));
  const out = buf.slice(0, buf.length - f);
  for (let i = 0; i < f; i++) {
    const w = i / f;
    out[i] = out[i] * w + buf[buf.length - f + i] * (1 - w);
  }
  return out;
}

export function softClip(buf) {
  for (let i = 0; i < buf.length; i++) buf[i] = Math.tanh(buf[i] * 0.9);
  return buf;
}

export const peakOf = (buf) => buf.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
export const rmsOf = (buf) => Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length);

export function normalize(buf, { peak = null, rms = null }) {
  let g = 1;
  if (rms != null) g = rms / (rmsOf(buf) || 1);
  if (peak != null) {
    const after = peakOf(buf) * g;
    if (rms == null || after > peak) g = peak / (peakOf(buf) || 1);
  }
  for (let i = 0; i < buf.length; i++) buf[i] *= g;
  return buf;
}
