import { getPannedDest } from "./audioUtils.js";
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

function runEffect(effectId, opts) {
  const { svc, ctx, categoryGain, spec } = opts;
  const t = opts.t ?? opts.time;
  const o = { ...opts, t };

  switch (effectId) {
    case "reboot_spin": {
      const spin = ctx.createOscillator();
      const spinGain = ctx.createGain();
      spin.type = "sawtooth";
      spin.frequency.setValueAtTime(spec.spinFreqHz, t);
      spin.frequency.exponentialRampToValueAtTime(spec.spinEndHz, t + spec.spinDurationS);
      spin.connect(spinGain);
      spinGain.connect(categoryGain);
      spinGain.gain.setValueAtTime(spec.spinGain, t);
      spinGain.gain.linearRampToValueAtTime(0, t + spec.spinDurationS);
      spin.start(t);
      spin.stop(t + spec.spinDurationS);
      return null;
    }
    case "reboot_relays": {
      spec.relayOffsetsS.forEach((offset) => {
        const relayTime = t + offset;
        const relayOsc = ctx.createOscillator();
        const relayGain = ctx.createGain();
        relayOsc.type = "square";
        relayOsc.frequency.setValueAtTime(spec.relayFreqHz, relayTime);
        relayOsc.frequency.exponentialRampToValueAtTime(spec.spinEndHz, relayTime + spec.relayDurationS);
        relayOsc.connect(relayGain);
        relayGain.connect(categoryGain);
        relayGain.gain.setValueAtTime(spec.relayGain, relayTime);
        relayGain.gain.exponentialRampToValueAtTime(0.01, relayTime + spec.relayDurationS);
        relayOsc.start(relayTime);
        relayOsc.stop(relayTime + spec.relayDurationS);
      });
      return null;
    }
    case "reboot_vacuum": {
      if (!svc._noiseBuffer) return null;
      const vacSrc = ctx.createBufferSource();
      vacSrc.buffer = svc._noiseBuffer;
      const vacFilter = ctx.createBiquadFilter();
      const vacGain = ctx.createGain();
      vacFilter.type = "bandpass";
      vacFilter.frequency.value = spec.vacFilterHz;
      vacFilter.Q.value = 1;
      vacSrc.connect(vacFilter);
      vacFilter.connect(vacGain);
      vacGain.connect(categoryGain);
      vacGain.gain.setValueAtTime(0, t + spec.vacStartDelayS);
      vacGain.gain.linearRampToValueAtTime(spec.vacGain, t + spec.vacFadeInEndS);
      vacGain.gain.setValueAtTime(spec.vacGain, t + spec.vacFadeOutStartS);
      vacGain.gain.linearRampToValueAtTime(0, t + spec.vacFadeOutEndS);
      vacSrc.start(t + spec.vacStartDelayS, 0, spec.vacDurationS);
      return null;
    }
    case "reboot_kick": {
      const ignitionTime = t + spec.ignitionDelayS;
      const kick = ctx.createOscillator();
      const kickGain = ctx.createGain();
      kick.type = "sine";
      kick.frequency.setValueAtTime(spec.kickFreqHz, ignitionTime);
      kick.frequency.exponentialRampToValueAtTime(spec.kickFreqEndHz, ignitionTime + spec.kickDecayS);
      kick.connect(kickGain);
      kickGain.connect(categoryGain);
      kickGain.gain.setValueAtTime(spec.kickGain, ignitionTime);
      kickGain.gain.exponentialRampToValueAtTime(0.01, ignitionTime + spec.kickDurationS);
      kick.start(ignitionTime);
      kick.stop(ignitionTime + spec.kickDurationS);
      return null;
    }
    case "reboot_pad": {
      const ignitionTime = t + spec.ignitionDelayS;
      spec.padFreqsHz.forEach((freq) => {
        const pad = ctx.createOscillator();
        const padGain = ctx.createGain();
        pad.type = "sine";
        pad.frequency.setValueAtTime(freq, ignitionTime);
        pad.frequency.linearRampToValueAtTime(freq * spec.padDetuneRatio, ignitionTime + spec.padDurationS);
        pad.connect(padGain);
        padGain.connect(categoryGain);
        padGain.gain.setValueAtTime(0, ignitionTime);
        padGain.gain.linearRampToValueAtTime(spec.padPeakGain, ignitionTime + spec.padFadeInS);
        padGain.gain.linearRampToValueAtTime(0, ignitionTime + spec.padDurationS);
        pad.start(ignitionTime);
        pad.stop(ignitionTime + spec.padDurationS);
      });
      return null;
    }
    case "objective_air": {
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
    }
    case "objective_stamp": {
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
    }
    case "objective_print": {
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
    }
    case "save_motor": {
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
    }
    case "save_seeks": {
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
    }
    case "save_latch": {
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
    }
    case "explosion_snap": {
      const { pan, masterVol, usePanner } = o;
      if (!svc._noiseBuffer) return null;
      const snapSrc = ctx.createBufferSource();
      snapSrc.buffer = svc._noiseBuffer;
      const snapFilter = ctx.createBiquadFilter();
      const snapGain = ctx.createGain();
      snapFilter.type = "highpass";
      snapFilter.frequency.value = spec.snapFilterHz;
      snapSrc.connect(snapFilter);
      snapFilter.connect(snapGain);
      snapGain.connect(getPannedDest(svc, categoryGain, pan, usePanner));
      snapGain.gain.setValueAtTime(masterVol, t);
      snapGain.gain.exponentialRampToValueAtTime(0.01, t + spec.snapDurationS);
      snapSrc.start(t);
      snapSrc.stop(t + spec.snapDurationS);
      return null;
    }
    case "explosion_boom": {
      const { pan, masterVol, usePanner } = o;
      const boom = ctx.createOscillator();
      const boomGain = ctx.createGain();
      boom.type = "triangle";
      boom.frequency.setValueAtTime(spec.boomFreqHz, t);
      boom.frequency.exponentialRampToValueAtTime(spec.boomFreqEndHz, t + spec.boomDecayS);
      boom.connect(boomGain);
      boomGain.connect(getPannedDest(svc, categoryGain, pan, usePanner));
      boomGain.gain.setValueAtTime(masterVol, t);
      boomGain.gain.exponentialRampToValueAtTime(0.01, t + spec.boomDurationS);
      boom.start(t);
      boom.stop(t + spec.boomDurationS);
      return null;
    }
    case "explosion_hiss": {
      const { masterVol, hissDuration } = o;
      if (!svc._noiseBuffer) return null;
      const hissSrc = ctx.createBufferSource();
      hissSrc.buffer = svc._noiseBuffer;
      const hissGain = ctx.createGain();
      const hissFilter = ctx.createBiquadFilter();
      hissFilter.type = "lowpass";
      hissFilter.frequency.setValueAtTime(spec.hissFilterHzStart, t);
      hissFilter.frequency.linearRampToValueAtTime(spec.hissFilterHzEnd, t + hissDuration);
      hissSrc.connect(hissFilter);
      hissFilter.connect(hissGain);
      hissGain.connect(categoryGain);
      hissGain.gain.setValueAtTime(masterVol * spec.hissGainRatio, t);
      hissGain.gain.exponentialRampToValueAtTime(0.001, t + hissDuration);
      hissSrc.start(t, Math.random() * 5, hissDuration);
      return null;
    }
    case "explosion_debris": {
      const { debrisCount } = o;
      for (let i = 0; i < debrisCount; i++) {
        const debrisTime = t + spec.debrisDelayS + Math.random() * spec.debrisSpreadS;
        const debrisOsc = ctx.createOscillator();
        const debrisGain = ctx.createGain();
        debrisOsc.type = Math.random() > 0.5 ? "sine" : "triangle";
        debrisOsc.frequency.setValueAtTime(spec.debrisFreqMinHz + Math.random() * spec.debrisFreqMaxHz, debrisTime);
        debrisOsc.connect(debrisGain);
        debrisGain.connect(categoryGain);
        debrisGain.gain.setValueAtTime(spec.debrisGain, debrisTime);
        debrisGain.gain.exponentialRampToValueAtTime(0.001, debrisTime + spec.debrisDurationS);
        debrisOsc.start(debrisTime);
        debrisOsc.stop(debrisTime + spec.debrisDurationS);
      }
      return null;
    }
    case "meltdown_spin": {
      const pdOsc = ctx.createOscillator();
      const pdGain = ctx.createGain();
      pdOsc.type = "sawtooth";
      pdOsc.frequency.setValueAtTime(spec.meltdownSpinFreqHz, t);
      pdOsc.frequency.exponentialRampToValueAtTime(spec.meltdownSpinEndHz, t + spec.meltdownSpinDurationS);
      pdOsc.connect(pdGain);
      pdGain.connect(categoryGain);
      pdGain.gain.setValueAtTime(spec.meltdownSpinGain, t);
      pdGain.gain.linearRampToValueAtTime(0, t + spec.meltdownSpinDurationS);
      pdOsc.start(t);
      pdOsc.stop(t + spec.meltdownSpinDurationS);
      return null;
    }
    case "flux_noise": {
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
    }
    case "flux_arc": {
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
    }
    case "flux_shims": {
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
    }
    case "overheat_groan": {
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
    }
    case "overheat_pings": {
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
    }
    case "depletion_fizz": {
      if (!svc._noiseBuffer) return null;
      const fizzSrc = ctx.createBufferSource();
      fizzSrc.buffer = svc._noiseBuffer;
      const fizzFilter = ctx.createBiquadFilter();
      const fizzGain = ctx.createGain();
      fizzFilter.type = "lowpass";
      fizzFilter.frequency.setValueAtTime(spec.fizzFilterStartHz, t);
      fizzFilter.frequency.exponentialRampToValueAtTime(spec.fizzFilterEndHz, t + spec.fizzDurationS);
      fizzSrc.connect(fizzFilter);
      fizzFilter.connect(fizzGain);
      fizzGain.connect(categoryGain);
      fizzGain.gain.setValueAtTime(spec.fizzGain, t);
      fizzGain.gain.exponentialRampToValueAtTime(0.001, t + spec.fizzDurationS);
      fizzSrc.start(t, Math.random() * 2, spec.fizzDurationS);
      return null;
    }
    case "depletion_rattle": {
      for (let i = 0; i < spec.rattleCount; i++) {
        const rattleTime = t + spec.rattleBaseDelayS + i * spec.rattleSpacingS + Math.random() * spec.rattleJitterS;
        const rattleOsc = ctx.createOscillator();
        const rattleGain = ctx.createGain();
        const rattleFilter = ctx.createBiquadFilter();
        rattleOsc.type = "square";
        rattleOsc.frequency.setValueAtTime(
          spec.rattleBaseFreqHz + Math.random() * spec.rattleFreqRangeHz,
          rattleTime
        );
        rattleFilter.type = "bandpass";
        rattleFilter.frequency.value = spec.rattleFilterHz;
        rattleFilter.Q.value = spec.rattleFilterQ;
        rattleOsc.connect(rattleFilter);
        rattleFilter.connect(rattleGain);
        rattleGain.connect(categoryGain);
        rattleGain.gain.setValueAtTime(spec.rattleGain, rattleTime);
        rattleGain.gain.exponentialRampToValueAtTime(0.001, rattleTime + spec.rattleDurationS);
        rattleOsc.start(rattleTime);
        rattleOsc.stop(rattleTime + spec.rattleDurationS);
      }
      return null;
    }
    default:
      return null;
  }
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
