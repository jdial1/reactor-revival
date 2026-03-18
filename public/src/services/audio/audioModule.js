import { getResourceUrl, isTestEnv, logger, runWithConcurrencyLimit } from "../../utils/utils_constants.js";

export const AUDIO_RUNTIME_DEFAULTS = {
  warningIntervalMs: 1000,
  explosionIntervalMs: 100,
  limiterWindowMs: 60,
  limiterGlobalCap: 24,
  limiterPerSoundCap: 3,
  defaultMasterVolume: "0.25",
  defaultEffectsVolume: "0.50",
  defaultAlertsVolume: "0.50",
  defaultSystemVolume: "0.50",
  defaultAmbienceVolume: "0.12",
  defaultMutedMasterVolume: "0.12",
};

export const AUDIO_SPECS = {
  placement: {
    basePitchHz: 140,
    freqEndHz: 40,
    cellFreqHz: 55,
    cellFreqEndHz: 45,
    platingGain: 0.7,
    platingFreqHz: 1200,
    clickFreqHz: 800,
    thudDurationS: 0.25,
    thudRampGain: 0.5,
    thudRampTimeS: 0.02,
    clickGain: 0.15,
    clickDurationS: 0.05,
    cellDurationS: 0.3,
    cellGain: 0.15,
    platingDurationS: 0.4,
    platingBurstGain: 0.1,
    ventGain: 0.3,
    ventNoiseDurationS: 0.3,
    ventNoiseGain: 0.25,
  },
  click: {
    baseFreqHz: 300,
    filterFreqHz: 800,
    freqEndHz: 50,
    springFilterFreqHz: 2500,
    clickDurationS: 0.08,
    clickGain: 0.2,
    randomPitchRange: 0.1,
    randomPitchBase: 0.95,
    springGain: 0.1,
    springDurationS: 0.04,
  },
  tabSwitch: { freqHz: 200, freqEndHz: 50, gain: 0.15, durationS: 0.1 },
  uiHover: {
    freqHz: 8000,
    freqEndHz: 10000,
    staticFilterHz: 5000,
    flybackGain: 0.015,
    flybackDurationS: 0.05,
    staticGain: 0.03,
    staticDurationS: 0.03,
  },
  explosion: {
    snapFilterHz: 1500,
    boomFreqHz: 150,
    boomFreqEndHz: 40,
    hissFilterHzStart: 3000,
    hissFilterHzEnd: 1000,
    meltdownSpinFreqHz: 300,
    debrisFreqMinHz: 2000,
    debrisFreqMaxHz: 5000,
    debrisCount: 5,
    meltdownDebrisCount: 12,
    hissDurationS: 2,
    meltdownHissDurationS: 4,
    snapDurationS: 0.1,
    boomDurationS: 0.4,
    boomDecayS: 0.3,
    masterVolNormal: 0.5,
    masterVolMeltdown: 0.8,
    hissGainRatio: 0.4,
    debrisGain: 0.05,
    debrisDurationS: 0.05,
    debrisDelayS: 0.1,
    debrisSpreadS: 1.5,
    meltdownSpinDurationS: 3,
    meltdownSpinGain: 0.3,
    meltdownSpinEndHz: 10,
  },
  flux: {
    suckDurationS: 0.12,
    arcFreqHz: 400,
    fmFreqHz: 60,
    fmGain: 800,
    filterFreqHz: 2500,
    shimFreqsHz: [2200, 3150, 4800, 6200],
    noiseGain: 0.25,
    noiseFilterStartHz: 500,
    arcGain: 0.2,
    arcDurationS: 0.15,
    shimGain: 0.04,
    shimDurationS: 1.5,
    shimDriftRange: 40,
    shimDriftBias: 20,
    shimDriftTimeS: 1.2,
  },
  upgrade: {
    filterFreqHz: 1200,
    impactFreqHz: 18,
    toneStartHz: 200,
    toneEndHz: 600,
    crunchFreqHz: 880,
    wrenchDurationS: 0.3,
    wrenchRampGain: 0.2,
    wrenchRampTimeS: 0.05,
    toneDurationS: 0.4,
    toneGain: 0.05,
    crunchDelayS: 0.2,
    crunchGain: 0.05,
    crunchRampTimeS: 0.25,
  },
  reboot: {
    spinFreqHz: 200,
    relayFreqHz: 150,
    relayOffsetsS: [0.5, 1.2, 1.9],
    vacFilterHz: 400,
    kickFreqHz: 120,
    kickFreqEndHz: 30,
    padFreqsHz: [220, 277.18, 329.63],
    spinDurationS: 2.5,
    spinGain: 0.3,
    spinEndHz: 10,
    relayGain: 0.4,
    relayDurationS: 0.1,
    vacStartDelayS: 2,
    vacFadeInEndS: 2.5,
    vacGain: 0.1,
    vacFadeOutStartS: 3.4,
    vacFadeOutEndS: 3.5,
    vacDurationS: 1.5,
    ignitionDelayS: 3.5,
    kickGain: 0.8,
    kickDurationS: 0.5,
    kickDecayS: 0.2,
    padDurationS: 4,
    padDetuneRatio: 1.02,
    padPeakGain: 0.1,
    padFadeInS: 1,
  },
  objective: {
    thudFreqHz: 120,
    clankFreqHz: 400,
    headFreqMinHz: 1800,
    printCharCount: 8,
    airFilterHz: 800,
    airGain: 0.2,
    airDurationS: 0.1,
    stampDelayS: 0.12,
    thudEndHz: 30,
    thudDecayS: 0.15,
    thudPeakGain: 0.6,
    thudAttackS: 0.01,
    thudDurationS: 0.2,
    clankGain: 0.15,
    clankDurationS: 0.05,
    printStartDelayS: 0.35,
    printCharSpacingS: 0.06,
    headFreqRangeHz: 200,
    headGain: 0.08,
    headDurationS: 0.03,
  },
  overheat: {
    filterFreqStartHz: 450,
    filterFreqEndHz: 300,
    pingFreqMinHz: 2500,
    pingFreqMaxHz: 3500,
    groanQ: 15,
    groanDurationS: 1.5,
    groanPeakGain: 0.25,
    groanFadeInS: 0.2,
    maxPingCount: 2,
    pingDelayBaseS: 0.2,
    pingDelayRangeS: 0.8,
    pingGain: 0.1,
    pingDurationS: 0.3,
    pingAttackS: 0.001,
  },
  sell: { toneFreqHz: 400, toneFreqEndHz: 200, gain: 0.15, durationS: 0.08 },
  error: { freqHz: 150, freqEndHz: 100, gain: 0.15, durationS: 0.2 },
  purge: {
    freqHz: 1200,
    freqEndHz: 600,
    boilFilterHz: 400,
    lfoRateHz: 12,
    lfoDepthHz: 300,
    sawGain: 0.1,
    sawDurationS: 0.15,
    noiseGain: 0.25,
    noiseDurationS: 0.6,
    boilGain: 0.15,
    boilDurationS: 0.5,
  },
  depletion: {
    fizzFilterStartHz: 4000,
    fizzFilterEndHz: 100,
    fizzDurationS: 0.4,
    fizzGain: 0.2,
    rattleCount: 4,
    rattleBaseDelayS: 0.15,
    rattleSpacingS: 0.07,
    rattleJitterS: 0.02,
    rattleBaseFreqHz: 600,
    rattleFreqRangeHz: 200,
    rattleFilterHz: 800,
    rattleFilterQ: 8,
    rattleGain: 0.05,
    rattleDurationS: 0.05,
  },
  save: {
    motorFreqEndHz: 800,
    seekFilterHz: 2500,
    latchFreqHz: 150,
    latchFreqEndHz: 40,
    seekCount: 12,
    motorStartHz: 100,
    motorDurationS: 1.2,
    motorFadeInS: 0.5,
    motorGain: 0.1,
    seekDelayBaseS: 0.3,
    seekDelayRangeS: 0.8,
    seekGain: 0.12,
    seekDurationS: 0.05,
    latchDelayS: 1.3,
    latchGain: 0.15,
    latchDurationS: 0.1,
  },
};

const PU = AUDIO_SPECS.purge;
const O = AUDIO_SPECS.objective;
const SV = AUDIO_SPECS.save;
const F = AUDIO_SPECS.flux;
const OH = AUDIO_SPECS.overheat;

const EFFECT_PROFILES = {
  purge_saw: {
    type: "osc",
    wave: "sawtooth",
    freq: PU.freqHz,
    freqEnd: PU.freqEndHz,
    gain: PU.sawGain,
    duration: PU.sawDurationS,
    volEnd: 0,
  },
  purge_noise: {
    type: "noise",
    filterType: "highpass",
    freq: 1000,
    gain: PU.noiseGain,
    duration: PU.noiseDurationS,
  },
  purge_boil: {
    type: "noise",
    filterType: "bandpass",
    freq: PU.boilFilterHz,
    Q: 8,
    gain: PU.boilGain,
    duration: PU.boilDurationS,
    volEnd: 0,
    lfoRate: PU.lfoRateHz,
    lfoDepth: PU.lfoDepthHz,
  },
  objective_air: { type: "objective_air", spec: O },
  objective_stamp: { type: "objective_stamp", spec: O },
  objective_print: { type: "objective_print", spec: O },
  save_motor: { type: "save_motor", spec: SV },
  save_seeks: { type: "save_seeks", spec: SV },
  save_latch: { type: "save_latch", spec: SV },
  flux_noise: { type: "flux_noise", spec: F },
  flux_arc: { type: "flux_arc", spec: F },
  flux_shims: { type: "flux_shims", spec: F },
  overheat_groan: { type: "overheat_groan", spec: OH },
  overheat_pings: { type: "overheat_pings", spec: OH },
};

const EVENT_TO_EFFECTS = {
  click: { sampleKey: "click", duckAmbience: true },
  error: { sampleKey: "error" },
  tab_switch: { sampleKey: "tab_switch", sampleFallback: "click" },
  ui_hover: { sampleKey: "click" },
  sell: { sampleKey: "sell", sampleFallback: "click", duckAmbience: true },
  placement: {
    sampleMap: { cell: "placement_cell", plating: "placement_plating", vent: "placement", default: "placement" },
  },
  purge: { effects: ["purge_saw", "purge_noise", "purge_boil"] },
  upgrade: { sampleKey: "upgrade" },
  reboot: { sampleKey: "reboot" },
  objective: { effects: ["objective_air", "objective_stamp", "objective_print"] },
  save: { effects: ["save_motor", "save_seeks", "save_latch"] },
  explosion: {
    sampleKey: "explosion",
    meltdownSampleKey: "meltdown",
    throttle: true,
  },
  flux: { effects: ["flux_noise", "flux_arc", "flux_shims"] },
  component_overheat: { effects: ["overheat_groan", "overheat_pings"] },
  depletion: { sampleKey: "depletion" },
};

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

function playAudioEffect(effectId, context, spec, time, options = {}) {
  const opts = { ...context, spec, time, t: time, ...options };
  return runEffect(effectId, opts);
}

function playSoundEffect(svc, effectId, context, audioOptions = {}) {
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

function trySample(svc, sampleKey, category, pan) {
  const buf = svc._uiBuffers?.[sampleKey];
  if (buf) {
    svc._playSample(sampleKey, category, pan);
    return true;
  }
  return false;
}

function handleClick(svc, opts) {
  const config = EVENT_TO_EFFECTS.click;
  if (config.duckAmbience) svc._duckAmbience();
  trySample(svc, config.sampleKey, opts.category, opts.pan);
}

function handleError(svc, opts) {
  const config = EVENT_TO_EFFECTS.error;
  trySample(svc, config.sampleKey, opts.category, opts.pan);
}

function handleTabSwitch(svc, opts) {
  const config = EVENT_TO_EFFECTS.tab_switch;
  if (trySample(svc, config.sampleKey, opts.category, opts.pan)) return;
  if (config.sampleFallback) trySample(svc, config.sampleFallback, opts.category, opts.pan);
}

function handleUiHover(svc, opts) {
  const config = EVENT_TO_EFFECTS.ui_hover;
  trySample(svc, config.sampleKey, opts.category, opts.pan);
}

function handleSell(svc, opts) {
  const config = EVENT_TO_EFFECTS.sell;
  if (config.duckAmbience) svc._duckAmbience();
  if (trySample(svc, config.sampleKey, opts.category, opts.pan)) return;
  if (config.sampleFallback) trySample(svc, config.sampleFallback, opts.category, opts.pan);
}

function handlePlacement(svc, opts) {
  const config = EVENT_TO_EFFECTS.placement;
  const { subtype, category, pan } = opts;
  const sampleKey = config.sampleMap?.[subtype] ?? config.sampleMap?.default ?? "placement";
  trySample(svc, sampleKey, category, pan);
}

function handlePurge(svc, opts) {
  const config = EVENT_TO_EFFECTS.purge;
  config.effects.forEach((id) => playSoundEffect(svc, id, opts, opts));
}

function handleUpgrade(svc, opts) {
  const config = EVENT_TO_EFFECTS.upgrade;
  trySample(svc, config.sampleKey, opts.category, null);
}

function handleReboot(svc, opts) {
  const config = EVENT_TO_EFFECTS.reboot;
  trySample(svc, config.sampleKey, opts.category, opts.pan);
}

function handleObjective(svc, opts) {
  const config = EVENT_TO_EFFECTS.objective;
  config.effects.forEach((id) => playSoundEffect(svc, id, opts, opts));
}

function handleSave(svc, opts) {
  const config = EVENT_TO_EFFECTS.save;
  config.effects.forEach((id) => playSoundEffect(svc, id, opts, opts));
}

function handleExplosion(svc, opts) {
  const config = EVENT_TO_EFFECTS.explosion;
  const { param, now } = opts;
  const isMeltdown = opts.subtype === "meltdown" || param === "meltdown";
  if (config.throttle && !isMeltdown && now - svc._lastExplosionTime < svc._config.explosionInterval) return;
  svc._lastExplosionTime = now;
  trySample(svc, config.sampleKey, opts.category, opts.pan);
  if (isMeltdown && config.meltdownSampleKey) {
    trySample(svc, config.meltdownSampleKey, opts.category, opts.pan);
  }
}

function handleFlux(svc, opts) {
  const config = EVENT_TO_EFFECTS.flux;
  config.effects.forEach((id) => playSoundEffect(svc, id, opts, opts));
}

function handleComponentOverheat(svc, opts) {
  const config = EVENT_TO_EFFECTS.component_overheat;
  config.effects.forEach((id) => playSoundEffect(svc, id, opts, opts));
}

function handleDepletion(svc, opts) {
  const config = EVENT_TO_EFFECTS.depletion;
  trySample(svc, config.sampleKey, opts.category, opts.pan);
}

function handleWarning(svc, opts) {
  const intensity = opts.intensity ?? 0.5;
  svc.warningManager.startWarningLoop(intensity);
}

const EVENT_HANDLERS = {
  click: handleClick,
  error: handleError,
  tab_switch: handleTabSwitch,
  ui_hover: handleUiHover,
  sell: handleSell,
  placement: handlePlacement,
  purge: handlePurge,
  upgrade: handleUpgrade,
  reboot: handleReboot,
  objective: handleObjective,
  save: handleSave,
  explosion: handleExplosion,
  flux: handleFlux,
  component_overheat: handleComponentOverheat,
  depletion: handleDepletion,
  warning: handleWarning,
};

export function handleAudioEvent(svc, eventType, context, options = {}) {
  const handler = EVENT_HANDLERS[eventType];
  if (handler) {
    const merged = { ...context, ...options };
    handler(svc, merged);
  }
}

const AUDIO_LOAD_CONCURRENCY = 6;

async function loadUrlMapInto(svc, urlMap, target) {
  const tasks = Object.entries(urlMap).map(([key, url]) => async () => {
    try {
      const r = await fetch(url);
      const ab = await r.arrayBuffer();
      target[key] = await svc.context.decodeAudioData(ab);
    } catch (e) {
      logger.log('warn', 'audio', 'Audio load failed', url, e);
    }
  });
  await runWithConcurrencyLimit(tasks, AUDIO_LOAD_CONCURRENCY);
}

async function loadAmbienceLayers(svc, base) {
  const layerUrls = [base + 'ambience_low.mp3', base + 'ambience_medium.mp3', base + 'ambience_high.mp3'];
  const results = await Promise.allSettled(
    layerUrls.map(async (url) => {
      try {
        const r = await fetch(url);
        const ab = await r.arrayBuffer();
        return await svc.context.decodeAudioData(ab);
      } catch (e) {
        logger.log('warn', 'audio', 'Ambience load failed', url, e);
        return null;
      }
    })
  );
  return results.map((p) => (p.status === 'fulfilled' ? p.value : null));
}

function shouldRestartAmbience(svc) {
  return svc._ambienceBuffers.length >= 3 && svc._ambienceBuffers.every(Boolean) &&
    svc.enabled && svc.ambienceGain?.gain.value > 0 && svc.ambienceManager.hasActiveAmbience();
}

export async function loadSampleBuffers(svc) {
  if (!svc.context || isTestEnv()) return;
  const base = getResourceUrl('audio/');
  const uiUrls = {
    click: base + 'ui_click.mp3',
    placement: base + 'placement.mp3',
    placement_cell: base + 'placement_cell.mp3',
    placement_plating: base + 'placement_plating.mp3',
    upgrade: base + 'upgrade.mp3',
    error: base + 'error.mp3',
    sell: base + 'sell.mp3',
    tab_switch: base + 'tab_switch.mp3',
    explosion: base + 'explosion.mp3',
    meltdown: base + 'meltdown.mp3',
    depletion: base + 'depletion.mp3',
    reboot: base + 'reboot.mp3'
  };
  const industrialUrls = { metal_clank: base + 'metal_clank.mp3', steam_hiss: base + 'steam_hiss.mp3' };
  const [, , ambienceResults] = await Promise.all([
    loadUrlMapInto(svc, uiUrls, svc._uiBuffers),
    loadUrlMapInto(svc, industrialUrls, svc._industrialBuffers),
    loadAmbienceLayers(svc, base),
  ]);
  svc._ambienceBuffers.push(...ambienceResults);
  if (shouldRestartAmbience(svc)) {
    svc.ambienceManager.stopAmbience();
    svc.ambienceManager.startAmbience();
  }
}

export class AudioAmbienceManager {
  constructor(svc) {
    this.svc = svc;
    this._ambienceNodes = [];
    this._ambienceLayerGains = [];
    this._ambienceFilter = null;
    this._ambienceHeatRatio = 0;
  }

  _ambienceLayerWeights(heatRatio) {
    const r = Math.max(0, Math.min(1, heatRatio));
    const l1 = r <= 0.3 ? 1 : Math.max(0, (0.5 - r) / 0.2);
    const l2 = r < 0.3 ? 0 : (r > 0.7 ? Math.max(0, (1 - r) / 0.3) : 1);
    const l3 = r < 0.7 ? 0 : Math.min(1, (r - 0.7) / 0.3);
    return [l1, l2, l3];
  }

  updateAmbienceHeat(currentHeat, maxHeat) {
    if (!this._ambienceLayerGains.length || !this.svc.context) return;
    const heatRatio = maxHeat > 0 ? Math.max(0, Math.min(1, currentHeat / maxHeat)) : 0;
    this._ambienceHeatRatio = heatRatio;
    const [l1, l2, l3] = this._ambienceLayerWeights(heatRatio);
    const t = this.svc.context.currentTime;
    this._ambienceLayerGains[0].gain.setTargetAtTime(l1, t, 0.5);
    this._ambienceLayerGains[1].gain.setTargetAtTime(l2, t, 0.5);
    this._ambienceLayerGains[2].gain.setTargetAtTime(l3, t, 0.5);
    if (this._ambienceFilter) {
      const minFreq = 80;
      const maxFreq = 16000;
      const targetFreq = minFreq * Math.pow(maxFreq / minFreq, heatRatio);
      this._ambienceFilter.frequency.setTargetAtTime(targetFreq, t, 0.5);
    }
  }

  startAmbience() {
    if (!this.svc.enabled || !this.svc.context || this._ambienceNodes.length > 0) return;
    const t = this.svc.context.currentTime;
    const dest = this.svc.ambienceGain || this.svc.masterGain;
    const useLayers = this.svc._ambienceBuffers.length >= 3 &&
      this.svc._ambienceBuffers[0] && this.svc._ambienceBuffers[1] && this.svc._ambienceBuffers[2];
    if (!useLayers) return;
    this._ambienceFilter = this.svc.context.createBiquadFilter();
    this._ambienceFilter.type = 'lowpass';
    this._ambienceFilter.frequency.value = 100;
    this._ambienceFilter.Q.value = 1;
    this._ambienceFilter.connect(dest);
    const [l1, l2, l3] = this._ambienceLayerWeights(this._ambienceHeatRatio);
    for (let i = 0; i < 3; i++) {
      const src = this.svc.context.createBufferSource();
      src.buffer = this.svc._ambienceBuffers[i];
      src.loop = true;
      const gain = this.svc.context.createGain();
      gain.gain.value = [l1, l2, l3][i];
      src.connect(gain);
      gain.connect(this._ambienceFilter);
      src.start(t);
      this._ambienceLayerGains.push(gain);
      this._ambienceNodes.push(src, gain);
    }
    this._ambienceNodes.push(this._ambienceFilter);
  }

  hasActiveAmbience() {
    return this._ambienceNodes.length > 0;
  }

  stopAmbience() {
    this._ambienceNodes.forEach(node => {
      try {
        if (typeof node.stop === 'function') node.stop();
      } catch (e) {}
      try {
        node.disconnect?.();
      } catch (e) {}
    });
    this._ambienceNodes = [];
    this._ambienceLayerGains = [];
    this._ambienceFilter = null;
    if (this.svc.industrialManager) this.svc.industrialManager.stopIndustrialAmbience();
  }
}

export class AudioWarningManager {
  constructor(svc) {
    this.svc = svc;
    this._warningLoopActive = false;
    this._warningIntensity = 0.5;
    this._warningRefillTimeout = null;
    this._warningNextScheduleTime = 0;
    this._geigerActive = false;
    this._geigerRefillTimeout = null;
    this._geigerNextTime = 0;
  }

  _scheduleWarningBatch() {
    if (!this._warningLoopActive || !this.svc.context || this.svc.context.state !== 'running') return;
    const ctx = this.svc.context;
    const interval = 5;
    const now = ctx.currentTime;
    const count = 4;
    let base = this._warningNextScheduleTime || now;
    if (base < now - interval) base = Math.ceil(now / interval) * interval;
    for (let i = 0; i < count; i++) {
      const when = base + i * interval;
      if (when >= now - 0.05) this._playWarningSoundAt(this._warningIntensity, when);
    }
    this._warningNextScheduleTime = base + count * interval;
    this._warningRefillTimeout = setTimeout(() => this._scheduleWarningBatch(), (count - 1) * interval * 1000);
  }

  startWarningLoop(intensity = 0.5) {
    if (this._warningLoopActive) {
      this._warningIntensity = intensity;
      return;
    }
    this._warningLoopActive = true;
    this._warningIntensity = intensity;
    this._warningNextScheduleTime = this.svc.context ? this.svc.context.currentTime : 0;
    this._scheduleWarningBatch();
    this._startGeigerTicks(intensity);
  }

  stopWarningLoop() {
    this._warningLoopActive = false;
    if (this._warningRefillTimeout) {
      clearTimeout(this._warningRefillTimeout);
      this._warningRefillTimeout = null;
    }
    this._warningNextScheduleTime = 0;
    this._stopGeigerTicks();
  }

  _playGeigerTickAt(intensity, startTime) {
    if (!this.svc.enabled || !this.svc.context || this.svc.context.state !== 'running') return;
    const ctx = this.svc.context;
    const t = startTime;
    const categoryGain = this.svc._getCategoryGain('alerts');
    const tickOsc = ctx.createOscillator();
    const tickGain = ctx.createGain();
    const tickFilter = ctx.createBiquadFilter();
    tickOsc.type = 'square';
    tickOsc.frequency.value = 8000 + Math.random() * 2000;
    tickFilter.type = 'bandpass';
    tickFilter.frequency.value = 6000;
    tickFilter.Q.value = 8;
    tickOsc.connect(tickFilter);
    tickFilter.connect(tickGain);
    tickGain.connect(categoryGain);
    tickGain.gain.setValueAtTime(0.08 * intensity, t);
    tickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.01);
    tickOsc.start(t);
    tickOsc.stop(t + 0.01);
  }

  _scheduleGeigerBatch(intensity) {
    if (!this._geigerActive || !this.svc.context || this.svc.context.state !== 'running') return;
    const ctx = this.svc.context;
    const baseInterval = 200 + (1 - intensity) * 300;
    const count = 25;
    let t = this._geigerNextTime || ctx.currentTime;
    if (t < ctx.currentTime - 1) t = ctx.currentTime;
    for (let i = 0; i < count; i++) {
      this._playGeigerTickAt(intensity, t);
      t += (baseInterval + (Math.random() * 100 - 50)) / 1000;
    }
    this._geigerNextTime = t;
    const refillMs = (count * baseInterval * 0.8) | 0;
    this._geigerRefillTimeout = setTimeout(() => this._scheduleGeigerBatch(this._warningIntensity), refillMs);
  }

  _startGeigerTicks(intensity = 0.5) {
    if (this._geigerActive || !this.svc.enabled || !this.svc.context) return;
    this._geigerActive = true;
    this._geigerNextTime = 0;
    this._scheduleGeigerBatch(intensity);
  }

  _stopGeigerTicks() {
    this._geigerActive = false;
    if (this._geigerRefillTimeout) {
      clearTimeout(this._geigerRefillTimeout);
      this._geigerRefillTimeout = null;
    }
    this._geigerNextTime = 0;
  }

  _playWarningSoundAt(intensity, startTime) {
    if (!this.svc.enabled || !this.svc.context || this.svc.context.state !== 'running') return;
    const ctx = this.svc.context;
    const t = startTime;
    const categoryGain = this.svc._getCategoryGain('alerts');
    const alarmDuration = 2.5;
    const oscKlaxon = ctx.createOscillator();
    const gainKlaxon = ctx.createGain();
    const shaper = ctx.createWaveShaper();
    const klaxonFilter = ctx.createBiquadFilter();
    oscKlaxon.type = 'square';
    oscKlaxon.frequency.setValueAtTime(180, t);
    oscKlaxon.frequency.linearRampToValueAtTime(160, t + alarmDuration);
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 4;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 15;
    lfo.connect(lfoGain);
    lfoGain.connect(oscKlaxon.frequency);
    lfo.start(t);
    lfo.stop(t + alarmDuration);
    shaper.curve = this.svc._distortionCurve || this.svc._makeDistortionCurve(800);
    klaxonFilter.type = 'lowpass';
    klaxonFilter.frequency.value = 800;
    klaxonFilter.Q.value = 1;
    oscKlaxon.connect(shaper);
    shaper.connect(klaxonFilter);
    klaxonFilter.connect(gainKlaxon);
    gainKlaxon.connect(categoryGain);
    gainKlaxon.gain.setValueAtTime(0.25, t);
    gainKlaxon.gain.linearRampToValueAtTime(0, t + alarmDuration);
    oscKlaxon.start(t);
    oscKlaxon.stop(t + alarmDuration);
    const oscTurbine = ctx.createOscillator();
    const gainTurbine = ctx.createGain();
    const startFreq = 2000 + intensity * 1000;
    oscTurbine.type = 'triangle';
    oscTurbine.frequency.setValueAtTime(startFreq, t);
    oscTurbine.frequency.linearRampToValueAtTime(startFreq + 200, t + alarmDuration);
    oscTurbine.connect(gainTurbine);
    gainTurbine.connect(categoryGain);
    gainTurbine.gain.setValueAtTime(0.05 * intensity, t);
    gainTurbine.gain.linearRampToValueAtTime(0, t + alarmDuration);
    oscTurbine.start(t);
    oscTurbine.stop(t + alarmDuration);
  }

  isWarningLoopActive() {
    return this._warningLoopActive;
  }

  getWarningIntensity() {
    return this._warningIntensity;
  }

  isGeigerActive() {
    return this._geigerActive;
  }
}

export class AudioIndustrialManager {
  constructor(svc) {
    this.svc = svc;
    this._industrialAmbienceTimeout = null;
    this._industrialAmbienceVentCount = 0;
    this._industrialAmbienceExchangerCount = 0;
  }

  stopIndustrialAmbience() {
    if (this._industrialAmbienceTimeout) {
      clearTimeout(this._industrialAmbienceTimeout);
      this._industrialAmbienceTimeout = null;
    }
    this._industrialAmbienceVentCount = 0;
    this._industrialAmbienceExchangerCount = 0;
  }

  scheduleIndustrialAmbience(ventCount, exchangerCount) {
    this._industrialAmbienceVentCount = ventCount;
    this._industrialAmbienceExchangerCount = exchangerCount;
    if (ventCount + exchangerCount === 0) {
      if (this._industrialAmbienceTimeout) {
        clearTimeout(this._industrialAmbienceTimeout);
        this._industrialAmbienceTimeout = null;
      }
      return;
    }
    if (this._industrialAmbienceTimeout) return;
    this._scheduleNextIndustrialAmbience();
  }

  _scheduleNextIndustrialAmbience() {
    const ventCount = this._industrialAmbienceVentCount;
    const exchangerCount = this._industrialAmbienceExchangerCount;
    if (ventCount + exchangerCount === 0) return;
    const divisor = 1 + ventCount * 0.1 + exchangerCount * 0.1;
    const intervalMs = (Math.random() * 5000) / divisor;
    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
    this._industrialAmbienceTimeout = setTimeout(() => {
      this._industrialAmbienceTimeout = null;
      this._playIndustrialAmbienceAccent();
      this._scheduleNextIndustrialAmbience();
    }, clamp(intervalMs, 800, 12000));
  }

  _playIndustrialAmbienceAccent() {
    const keys = ['metal_clank', 'steam_hiss'];
    const key = keys[Math.floor(Math.random() * keys.length)];
    const buffer = this.svc._industrialBuffers[key];
    if (!buffer || !this.svc.context || this.svc.context.state !== 'running' || !this.svc.enabled || !this.svc.ambienceGain) return;
    const ctx = this.svc.context;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = 0.85 + Math.random() * 0.3;
    const gain = ctx.createGain();
    const ambienceLevel = this.svc.ambienceGain.gain.value;
    gain.gain.value = ambienceLevel * 0.3;
    src.connect(gain);
    let dest = this.svc.ambienceGain;
    if (ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = -0.8 + Math.random() * 1.6;
      panner.connect(dest);
      dest = panner;
    }
    gain.connect(dest);
    src.start(t);
    src.stop(t + buffer.duration);
  }
}

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
