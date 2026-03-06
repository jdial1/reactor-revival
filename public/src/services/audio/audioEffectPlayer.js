import { EFFECT_PROFILES } from "./soundProfiles.js";
import { AUDIO_SPECS } from "./audioConfig.js";

const UI_HOVER = AUDIO_SPECS.uiHover;

function runOsc(svc, profile, opts) {
  const { ctx, t, category, pan, spatialOpts } = opts;
  let freq = profile.freq;
  if (profile.randomPitch) {
    const { base, range } = profile.randomPitch;
    freq *= (base || 0.95) + Math.random() * (range || 0.1);
  }
  let startTime = t;
  if (profile.delay) startTime += profile.delay;
  const oscOpts = {
    freqEnd: profile.freqEnd,
    volEnd: profile.volEnd ?? 0.001,
    category: category ?? "effects",
    pan,
    ...spatialOpts,
  };
  if (profile.dist) oscOpts.dist = true;
  if (profile.filterFreq != null) {
    oscOpts.filterFreq = profile.filterFreq;
    oscOpts.filterType = profile.filterType || "lowpass";
  }
  const result = svc._osc(startTime, profile.wave || "sine", freq, profile.gain ?? 0, profile.duration, oscOpts);
  if (result?.gain && profile.thudRampGain != null) {
    result.gain.gain.linearRampToValueAtTime(profile.thudRampGain, startTime + profile.thudRampTimeS);
  }
  if (result?.gain && profile.rampGain != null) {
    result.gain.gain.linearRampToValueAtTime(profile.rampGain, startTime + (profile.rampTime ?? 0.05));
  }
  return result;
}

function runNoise(svc, profile, opts) {
  const { category } = opts;
  const noiseOpts = {
    type: profile.filterType || "highpass",
    freq: profile.freq ?? 1000,
    Q: profile.Q,
    volEnd: profile.volEnd ?? 0.001,
    category: category ?? "effects",
  };
  const result = svc._noise(opts.t, profile.gain ?? 0, profile.duration, noiseOpts);
  if (result?.gain && profile.rampGain != null) {
    result.gain.gain.linearRampToValueAtTime(profile.rampGain, opts.t + (profile.rampTime ?? 0.05));
  }
  if (result?.filter && profile.lfoRate != null && profile.lfoDepth != null) {
    svc._lfo(opts.t, profile.lfoRate, profile.lfoDepth, result.filter.frequency, profile.duration);
  }
  if (result?.gain && profile.impactFreq != null) {
    const impact = opts.ctx.createOscillator();
    const impactGain = opts.ctx.createGain();
    impact.type = "square";
    impact.frequency.value = profile.impactFreq;
    impactGain.gain.value = 1;
    impact.connect(impactGain);
    impactGain.connect(result.gain.gain);
    impact.start(opts.t);
    impact.stop(opts.t + profile.duration);
  }
  return result;
}

const effectHandlers = {
  objective_air: ({ svc, ctx, categoryGain, spec, t }) => {
    if (!svc._noiseBuffer) return null;
    const airSrc = ctx.createBufferSource();
    airSrc.buffer = svc._noiseBuffer;
    const airGain = ctx.createGain();
    const airFilter = ctx.createBiquadFilter();
    airFilter.type = "lowpass";
    airFilter.frequency.value = spec.airFilterHz;
    airSrc.connect(airFilter);
    airFilter.connect(airGain);
    airGain.connect(categoryGain);
    airGain.gain.setValueAtTime(spec.airGain, t);
    airGain.gain.linearRampToValueAtTime(0, t + spec.airDurationS);
    airSrc.start(t);
    airSrc.stop(t + spec.airDurationS);
    return null;
  },
  objective_stamp: ({ ctx, categoryGain, spec, t }) => {
    const stampTime = t + spec.stampDelayS;
    const thudOsc = ctx.createOscillator();
    const thudGain = ctx.createGain();
    thudOsc.type = "triangle";
    thudOsc.frequency.setValueAtTime(spec.thudFreqHz, stampTime);
    thudOsc.frequency.exponentialRampToValueAtTime(spec.thudEndHz, stampTime + spec.thudDecayS);
    thudOsc.connect(thudGain);
    thudGain.connect(categoryGain);
    thudGain.gain.setValueAtTime(0, stampTime);
    thudGain.gain.linearRampToValueAtTime(spec.thudPeakGain, stampTime + spec.thudAttackS);
    thudGain.gain.exponentialRampToValueAtTime(0.01, stampTime + spec.thudDurationS);
    thudOsc.start(stampTime);
    thudOsc.stop(stampTime + spec.thudDurationS);
    const clankOsc = ctx.createOscillator();
    const clankGain = ctx.createGain();
    clankOsc.type = "square";
    clankOsc.frequency.setValueAtTime(spec.clankFreqHz, stampTime);
    clankOsc.connect(clankGain);
    clankGain.connect(categoryGain);
    clankGain.gain.setValueAtTime(spec.clankGain, stampTime);
    clankGain.gain.exponentialRampToValueAtTime(0.001, stampTime + spec.clankDurationS);
    clankOsc.start(stampTime);
    clankOsc.stop(stampTime + spec.clankDurationS);
    return null;
  },
  objective_print: ({ ctx, categoryGain, spec, t }) => {
    const printStart = t + spec.printStartDelayS;
    for (let i = 0; i < spec.printCharCount; i++) {
      const charTime = printStart + i * spec.printCharSpacingS;
      const headOsc = ctx.createOscillator();
      const headGain = ctx.createGain();
      headOsc.type = "square";
      headOsc.frequency.setValueAtTime(spec.headFreqMinHz + Math.random() * spec.headFreqRangeHz, charTime);
      headOsc.connect(headGain);
      headGain.connect(categoryGain);
      headGain.gain.setValueAtTime(spec.headGain, charTime);
      headGain.gain.exponentialRampToValueAtTime(0.001, charTime + spec.headDurationS);
      headOsc.start(charTime);
      headOsc.stop(charTime + spec.headDurationS);
    }
    return null;
  },
  save_motor: ({ ctx, categoryGain, spec, t }) => {
    const motor = ctx.createOscillator();
    const motorGain = ctx.createGain();
    motor.type = "triangle";
    motor.frequency.setValueAtTime(spec.motorStartHz, t);
    motor.frequency.exponentialRampToValueAtTime(spec.motorFreqEndHz, t + spec.motorDurationS);
    motor.connect(motorGain);
    motorGain.connect(categoryGain);
    motorGain.gain.setValueAtTime(0, t);
    motorGain.gain.linearRampToValueAtTime(spec.motorGain, t + spec.motorFadeInS);
    motorGain.gain.linearRampToValueAtTime(0, t + spec.motorDurationS);
    motor.start(t);
    motor.stop(t + spec.motorDurationS);
    return null;
  },
  save_seeks: ({ svc, ctx, categoryGain, spec, t }) => {
    if (!svc._noiseBuffer) return null;
    for (let i = 0; i < spec.seekCount; i++) {
      const seekTime = t + spec.seekDelayBaseS + Math.random() * spec.seekDelayRangeS;
      const seekSrc = ctx.createBufferSource();
      seekSrc.buffer = svc._noiseBuffer;
      const seekFilter = ctx.createBiquadFilter();
      const seekGain = ctx.createGain();
      seekFilter.type = "bandpass";
      seekFilter.frequency.value = spec.seekFilterHz;
      seekFilter.Q.value = 2;
      seekSrc.connect(seekFilter);
      seekFilter.connect(seekGain);
      seekGain.connect(categoryGain);
      seekGain.gain.setValueAtTime(spec.seekGain, seekTime);
      seekGain.gain.exponentialRampToValueAtTime(0.001, seekTime + spec.seekDurationS);
      seekSrc.start(seekTime, Math.random(), spec.seekDurationS);
    }
    return null;
  },
  save_latch: ({ ctx, categoryGain, spec, t }) => {
    const parkTime = t + spec.latchDelayS;
    const saveLatch = ctx.createOscillator();
    const saveLatchGain = ctx.createGain();
    saveLatch.type = "square";
    saveLatch.frequency.setValueAtTime(spec.latchFreqHz, parkTime);
    saveLatch.frequency.exponentialRampToValueAtTime(spec.latchFreqEndHz, parkTime + spec.latchDurationS);
    saveLatch.connect(saveLatchGain);
    saveLatchGain.connect(categoryGain);
    saveLatchGain.gain.setValueAtTime(spec.latchGain, parkTime);
    saveLatchGain.gain.exponentialRampToValueAtTime(0.001, parkTime + spec.latchDurationS);
    saveLatch.start(parkTime);
    saveLatch.stop(parkTime + spec.latchDurationS);
    return null;
  },
  flux_noise: ({ svc, ctx, categoryGain, spec, t }) => {
    if (!svc._noiseBuffer) return null;
    const src = ctx.createBufferSource();
    src.buffer = svc._noiseBuffer;
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.setValueAtTime(UI_HOVER.freqHz, t);
    filter.frequency.exponentialRampToValueAtTime(spec.noiseFilterStartHz, t + spec.suckDurationS);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(categoryGain);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(spec.noiseGain, t + spec.suckDurationS);
    src.start(t);
    src.stop(t + spec.suckDurationS);
    return null;
  },
  flux_arc: ({ ctx, categoryGain, spec, t }) => {
    const impactT = t + spec.suckDurationS;
    const arcOsc = ctx.createOscillator();
    const arcGain = ctx.createGain();
    const arcFilter = ctx.createBiquadFilter();
    arcOsc.type = "sawtooth";
    arcOsc.frequency.setValueAtTime(spec.arcFreqHz, impactT);
    const fmOsc = ctx.createOscillator();
    fmOsc.type = "square";
    fmOsc.frequency.value = spec.fmFreqHz;
    const fmGain = ctx.createGain();
    fmGain.gain.value = spec.fmGain;
    fmOsc.connect(fmGain);
    fmGain.connect(arcOsc.frequency);
    arcFilter.type = "highpass";
    arcFilter.frequency.value = spec.filterFreqHz;
    arcOsc.connect(arcFilter);
    arcFilter.connect(arcGain);
    arcGain.connect(categoryGain);
    arcGain.gain.setValueAtTime(spec.arcGain, impactT);
    arcGain.gain.exponentialRampToValueAtTime(0.01, impactT + spec.arcDurationS);
    arcOsc.start(impactT);
    arcOsc.stop(impactT + spec.arcDurationS);
    fmOsc.start(impactT);
    fmOsc.stop(impactT + spec.arcDurationS);
    return null;
  },
  flux_shims: ({ ctx, categoryGain, spec, t }) => {
    const impactT = t + spec.suckDurationS;
    spec.shimFreqsHz.forEach((freq) => {
        const shim = ctx.createOscillator();
        const shimGain = ctx.createGain();
        shim.type = "sine";
        shim.frequency.setValueAtTime(freq, impactT);
        const drift = freq + (Math.random() * spec.shimDriftRange - spec.shimDriftBias);
        shim.frequency.linearRampToValueAtTime(drift, impactT + spec.shimDriftTimeS);
        shim.connect(shimGain);
        shimGain.connect(categoryGain);
        shimGain.gain.setValueAtTime(spec.shimGain, impactT);
        shimGain.gain.exponentialRampToValueAtTime(0.001, impactT + spec.shimDurationS);
        shim.start(impactT);
        shim.stop(impactT + spec.shimDurationS);
      });
    return null;
  },
  overheat_groan: ({ svc, ctx, categoryGain, spec, t }) => {
    if (!svc._noiseBuffer) return null;
    const groanSrc = ctx.createBufferSource();
    groanSrc.buffer = svc._noiseBuffer;
    const groanFilter = ctx.createBiquadFilter();
    const groanGain = ctx.createGain();
    groanFilter.type = "bandpass";
    groanFilter.Q.value = spec.groanQ;
    groanFilter.frequency.setValueAtTime(spec.filterFreqStartHz, t);
    groanFilter.frequency.exponentialRampToValueAtTime(spec.filterFreqEndHz, t + spec.groanDurationS);
    groanSrc.connect(groanFilter);
    groanFilter.connect(groanGain);
    groanGain.connect(categoryGain);
    groanGain.gain.setValueAtTime(0, t);
    groanGain.gain.linearRampToValueAtTime(spec.groanPeakGain, t + spec.groanFadeInS);
    groanGain.gain.linearRampToValueAtTime(0, t + spec.groanDurationS);
    groanSrc.start(t, Math.random() * 5, spec.groanDurationS);
    return null;
  },
  overheat_pings: ({ ctx, categoryGain, spec, t }) => {
    const pingCount = 1 + Math.floor(Math.random() * spec.maxPingCount);
    for (let i = 0; i < pingCount; i++) {
        const pingTime = t + spec.pingDelayBaseS + Math.random() * spec.pingDelayRangeS;
        const pingOsc = ctx.createOscillator();
        const pingGain = ctx.createGain();
        pingOsc.type = "sine";
        pingOsc.frequency.setValueAtTime(
          spec.pingFreqMinHz + Math.random() * (spec.pingFreqMaxHz - spec.pingFreqMinHz),
          pingTime
        );
        pingOsc.connect(pingGain);
        pingGain.connect(categoryGain);
        pingGain.gain.setValueAtTime(0, pingTime);
        pingGain.gain.setValueAtTime(spec.pingGain, pingTime + spec.pingAttackS);
        pingGain.gain.exponentialRampToValueAtTime(0.001, pingTime + spec.pingDurationS);
        pingOsc.start(pingTime);
        pingOsc.stop(pingTime + spec.pingDurationS);
      }
    return null;
  },
};

function runEffect(effectId, opts) {
  const t = opts.t ?? opts.time;
  const o = { ...opts, t };
  const handler = effectHandlers[effectId];
  if (handler) return handler(o);
  return null;
}

export function playAudioEffect(effectId, context, spec, time, options = {}) {
  const opts = { ...context, spec, time, t: time, ...options };
  return runEffect(effectId, opts);
}

export function playSoundEffect(svc, effectId, context, audioOptions = {}) {
  const profile = EFFECT_PROFILES[effectId];
  if (!profile || !svc.context || svc.context.state !== "running") return null;
  const { t, ctx, categoryGain, category, pan, spatialOpts } = context;
  const contextShape = { svc, ctx, categoryGain, category, pan, spatialOpts };
  const spec = profile.spec ?? profile;

  if (profile.type === "osc") {
    return runOsc(svc, profile, { ...contextShape, t, category, pan, spatialOpts });
  }
  if (profile.type === "noise") {
    return runNoise(svc, profile, { ...contextShape, t, category });
  }
  return playAudioEffect(effectId, contextShape, spec, t, audioOptions);
}
