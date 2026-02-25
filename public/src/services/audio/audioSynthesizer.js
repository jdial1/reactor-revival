export class AudioSynthesizer {
  constructor(service) {
    this.service = service;
  }

  osc(startTime, type, freq, volume, duration, options = {}) {
    const context = this.service.context;
    if (!context) return null;
    const osc = context.createOscillator();
    const gain = context.createGain();
    let source = osc;
    let resolvedFreq = freq;
    if (options.randomPitch) {
      const variation = typeof options.randomPitch === "number" ? options.randomPitch : 0.05;
      resolvedFreq *= (1 - variation) + Math.random() * (variation * 2);
    }
    osc.type = type;
    osc.frequency.setValueAtTime(resolvedFreq, startTime);
    if (options.freqEnd) {
      osc.frequency.exponentialRampToValueAtTime(options.freqEnd, startTime + duration);
    }
    if (options.dist) {
      const shaper = context.createWaveShaper();
      shaper.curve = this.service._distortionCurve || this.service._makeDistortionCurve(400);
      osc.connect(shaper);
      source = shaper;
    }
    if (options.filterFreq != null) {
      const filter = context.createBiquadFilter();
      filter.type = options.filterType || "lowpass";
      filter.frequency.value = options.filterFreq;
      source.connect(filter);
      source = filter;
    }
    source.connect(gain);
    let dest = this.service._getCategoryGain(options.category);
    if (options.pan !== undefined && options.pan !== null && context.createStereoPanner) {
      const panner = context.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, options.pan));
      panner.connect(dest);
      dest = panner;
    }
    gain.connect(dest);
    gain.gain.setValueAtTime(volume, startTime);
    const endVol = options.volEnd ?? 0.001;
    if (volume <= 0 || endVol <= 0) {
      gain.gain.linearRampToValueAtTime(endVol, startTime + duration);
    } else {
      gain.gain.exponentialRampToValueAtTime(endVol, startTime + duration);
    }
    osc.start(startTime);
    osc.stop(startTime + duration);
    return { osc, gain };
  }

  noise(startTime, volume, duration, options = {}) {
    const context = this.service.context;
    if (!this.service._noiseBuffer || !context) return null;
    const src = context.createBufferSource();
    src.buffer = this.service._noiseBuffer;
    const gain = context.createGain();
    let node = src;
    let filter = null;
    if (options.type || options.freq || options.freqEnd || options.Q) {
      filter = context.createBiquadFilter();
      filter.type = options.type || "highpass";
      const freq = options.freq ?? 1000;
      filter.frequency.setValueAtTime(freq, startTime);
      if (options.freqEnd) {
        const rampFn = options.linearFreq ? "linearRampToValueAtTime" : "exponentialRampToValueAtTime";
        filter.frequency[rampFn](options.freqEnd, startTime + duration);
      }
      if (options.Q) filter.Q.value = options.Q;
      node.connect(filter);
      node = filter;
    }
    node.connect(gain);
    let dest = this.service._getCategoryGain(options.category);
    if (options.pan !== undefined && options.pan !== null && context.createStereoPanner) {
      const panner = context.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, options.pan));
      panner.connect(dest);
      dest = panner;
    }
    gain.connect(dest);
    const available = Math.max(this.service._noiseBuffer.duration - duration, 0);
    const offset = Math.random() * available;
    gain.gain.setValueAtTime(volume, startTime);
    const endVol = options.volEnd ?? 0.001;
    if (volume <= 0 || endVol <= 0) {
      gain.gain.linearRampToValueAtTime(endVol, startTime + duration);
    } else {
      gain.gain.exponentialRampToValueAtTime(endVol, startTime + duration);
    }
    src.start(startTime, offset, duration);
    src.stop(startTime + duration);
    return { src, gain, filter };
  }

  lfo(startTime, frequency, depth, target, duration) {
    const context = this.service.context;
    if (!context || !target) return null;
    const lfo = context.createOscillator();
    const gain = context.createGain();
    lfo.frequency.value = frequency;
    gain.gain.value = depth;
    lfo.connect(gain);
    gain.connect(target);
    lfo.start(startTime);
    lfo.stop(startTime + duration);
    return { osc: lfo, gain };
  }
}
