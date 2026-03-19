import { fromError } from "zod-validation-error";
import { z } from "zod";
import { QueryClient } from "@tanstack/query-core";
import { html, render } from "lit-html";
import { proxy, subscribe } from "valtio/vanilla";
import {
  PartDefinitionSchema,
  UpgradeDefinitionSchema,
  TechTreeSchema,
  ObjectiveListSchema,
  DifficultyPresetSchema,
  HelpTextSchema,
  VersionSchema,
  SaveDataSchema,
  getVolumePreferences,
  preferences,
  fetchResolvedSaves,
  showCloudVsLocalConflictModal,
  showLoadBackupModal,
  fetchCloudSaveSlots,
} from "./state.js";
import {
  logger,
  StorageUtils,
  StorageAdapter,
  serializeSave,
  deserializeSave,
  getBasePath,
  getResourceUrl,
  isTestEnv,
  runWithConcurrencyLimit,
  setSlot1FromBackupAsync,
  escapeHtml,
  classMap,
  Format,
  formatPlaytimeLog,
  rotateSlot1ToBackupAsync,
  GOOGLE_DRIVE_CONFIG,
  getGoogleDriveAuth as getGoogleDriveConfig,
  getSupabaseUrl,
  getSupabaseAnonKey,
  BaseComponent,
} from "./utils.js";
import { MODAL_IDS } from "./components/ui_modals.js";
import {
  LoadFromCloudButton,
  GoogleSignInButton,
  createLoadingButton,
  createGoogleSignInButtonWithIcon,
} from "./components/buttonFactory.js";
import { ReactiveLitComponent } from "./components/ReactiveLitComponent.js";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      retry: 2,
    },
  },
});

export const queryKeys = {
  gameData: (resource) => (resource ? ["gameData", resource] : ["gameData"]),
  leaderboard: (sortBy, limit) => ["leaderboard", "top", sortBy, limit],
  saves: {
    resolved: () => ["saves", "resolved"],
    local: (slot) => ["saves", "local", slot],
    cloud: (provider) => ["saves", "cloud", provider],
  },
};

const fetchAndValidate = async (path, schema) => {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Failed to load ${path}`);
  const json = await response.json();
  const data = json.default ?? json;
  try {
    return schema.parse(data);
  } catch (err) {
    const msg = `Data corruption in ${path}: ${fromError(err).toString()}`;
    logger.log("error", "data", msg);
    throw new Error(msg);
  }
};

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Failed to load ${path}`);
  const json = await response.json();
  return json.default ?? json;
}

const prefetchOptions = {
  staleTime: Infinity,
  gcTime: Infinity,
  networkMode: "offlineFirst",
};

class DataService {
  _getQuery(key, path, schema) {
    return queryClient.fetchQuery({
      queryKey: queryKeys.gameData(key),
      queryFn: () => fetchAndValidate(path, schema),
      ...prefetchOptions,
    });
  }

  async ensureAllGameDataLoaded() {
    const results = await Promise.all([
      this._getQuery("parts", "./data/part_list.json", z.array(PartDefinitionSchema)),
      this._getQuery("upgrades", "./data/upgrade_list.json", z.array(UpgradeDefinitionSchema)),
      this._getQuery("techTree", "./data/tech_tree.json", TechTreeSchema),
      this._getQuery("objectives", "./data/objective_list.json", ObjectiveListSchema),
      this._getQuery("difficulty", "./data/difficulty_curves.json", z.record(z.string(), DifficultyPresetSchema)),
      this._getQuery("helpText", "./data/help_text.json", HelpTextSchema),
    ]);
    return {
      parts: results[0],
      upgrades: results[1],
      techTree: results[2],
      objectives: results[3],
      difficulty: results[4],
      helpText: results[5],
    };
  }

  async loadData(filePath) {
    return queryClient.fetchQuery({
      queryKey: [...queryKeys.gameData(), "raw", filePath],
      queryFn: () => fetchJson(filePath),
      ...prefetchOptions,
    });
  }

  async loadFlavorText() {
    return this._getQuery("flavorText", "./data/flavor_text.json", z.array(z.string()));
  }

  async loadHelpText() {
    return this._getQuery("helpText", "./data/help_text.json", HelpTextSchema);
  }

  async loadSettingsHelp() {
    return this._getQuery("settingsHelp", "./data/settings_help.json", z.record(z.string(), z.string()));
  }

  async loadObjectiveList() {
    return this._getQuery("objectives", "./data/objective_list.json", ObjectiveListSchema);
  }

  async loadPartList() {
    return this._getQuery("parts", "./data/part_list.json", z.array(PartDefinitionSchema));
  }

  async loadUpgradeList() {
    return this._getQuery("upgrades", "./data/upgrade_list.json", z.array(UpgradeDefinitionSchema));
  }

  async loadTechTree() {
    return this._getQuery("techTree", "./data/tech_tree.json", TechTreeSchema);
  }

  async loadDifficultyCurves() {
    return this._getQuery("difficulty", "./data/difficulty_curves.json", z.record(z.string(), DifficultyPresetSchema));
  }

  clearCache() {
    queryClient.clear();
  }

  getCachedData(resource) {
    const key = resource ? queryKeys.gameData(resource) : queryKeys.gameData();
    return queryClient.getQueryData(key);
  }
}

const dataService = new DataService();

export default dataService;

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


export class AudioService {
  constructor() {
  this.context = null;
  this.enabled = true;
  this.masterGain = null;
  this._isInitialized = false;
  this._noiseBuffer = null;
  this._distortionCurve = null;
  this._lastWarningTime = 0;
  this._lastExplosionTime = 0;
  this._config = {
  warningInterval: AUDIO_RUNTIME_DEFAULTS.warningIntervalMs,
  explosionInterval: AUDIO_RUNTIME_DEFAULTS.explosionIntervalMs
  };
  this.effectsGain = null;
  this.alertsGain = null;
  this.systemGain = null;
  this.ambienceGain = null;
  this._testLoopInterval = null;
  this._testSoundType = null;
  this._hasUnlocked = false;
  this._pendingAmbience = false;
  this.ambienceManager = new AudioAmbienceManager(this);
  this.warningManager = new AudioWarningManager(this);
  this.industrialManager = new AudioIndustrialManager(this);
  this.synthesizer = new AudioSynthesizer(this);
  this._soundLimiter = {
  windowMs: AUDIO_RUNTIME_DEFAULTS.limiterWindowMs,
  lastWindowStart: 0,
  counts: new Map(),
  globalCap: AUDIO_RUNTIME_DEFAULTS.limiterGlobalCap,
  perSoundCap: AUDIO_RUNTIME_DEFAULTS.limiterPerSoundCap
  };
  this._activeLimiter = null;
  this._uiBuffers = { click: null, placement: null, placement_cell: null, placement_plating: null, upgrade: null, error: null, sell: null, tab_switch: null };
  this._industrialBuffers = { metal_clank: null, steam_hiss: null };
  this._ambienceBuffers = [];
  this._ambienceDuckGain = null;
  }

  get _ambienceNodes() {
    return this.ambienceManager._ambienceNodes;
  }
  set _ambienceNodes(v) {
    this.ambienceManager._ambienceNodes = v;
  }
  get _warningLoopActive() {
    return this.warningManager.isWarningLoopActive();
  }
  get _warningIntensity() {
    return this.warningManager.getWarningIntensity();
  }
  get _geigerActive() {
    return this.warningManager.isGeigerActive();
  }
  get _warningLoopInterval() {
    return this.warningManager._warningRefillTimeout ?? null;
  }
  _duckAmbience() {
  if (!this._ambienceDuckGain || !this.context || this.context.state !== 'running') return;
  const t = this.context.currentTime;
  this._ambienceDuckGain.gain.setValueAtTime(this._ambienceDuckGain.gain.value, t);
  this._ambienceDuckGain.gain.linearRampToValueAtTime(0.55, t + 0.03);
  this._ambienceDuckGain.gain.linearRampToValueAtTime(1, t + 0.12);
  }
  async _loadSampleBuffers() {
    await loadSampleBuffers(this);
  }
  _playSample(type, category, pan) {
  const buffer = this._uiBuffers[type];
  if (!buffer || !this.context || this.context.state !== 'running') return;
  const ctx = this.context;
  const t = ctx.currentTime;
  const categoryGain = this._getCategoryGain(category);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const cents = (Math.random() * 10 - 5) / 1200;
  src.playbackRate.value = Math.pow(2, cents);
  const gain = ctx.createGain();
  gain.gain.value = 1;
  src.connect(gain);
  let dest = categoryGain;
  if (pan !== null && pan !== undefined && ctx.createStereoPanner) {
  const panner = ctx.createStereoPanner();
  panner.pan.value = Math.max(-1, Math.min(1, pan));
  panner.connect(dest);
  dest = panner;
  }
  gain.connect(dest);
  src.start(t);
  src.stop(t + buffer.duration);
  }
  async init() {
  if (this._isInitialized) return;
  try {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) {
  logger.log('warn', 'audio', 'Web Audio API not supported');
  return;
  }
  this.context = new AudioContext();
  this.masterGain = this.context.createGain();
  const volPrefs = getVolumePreferences();
  const savedMasterVol = volPrefs.master ?? AUDIO_RUNTIME_DEFAULTS.defaultMasterVolume;
  const isContextSuspended = this.context.state === 'suspended';
  if (isContextSuspended) {
  this.masterGain.gain.value = 0;
  } else {
  this.masterGain.gain.value = savedMasterVol;
  this._hasUnlocked = true;
  }
  this.masterGain.connect(this.context.destination);
  this.effectsGain = this.context.createGain();
  this.alertsGain = this.context.createGain();
  this.systemGain = this.context.createGain();
  this.ambienceGain = this.context.createGain();
  this._ambienceDuckGain = this.context.createGain();
  this._ambienceDuckGain.gain.value = 1;
  this.effectsGain.connect(this.masterGain);
  this.alertsGain.connect(this.masterGain);
  this.systemGain.connect(this.masterGain);
  this.ambienceGain.connect(this._ambienceDuckGain);
  this._ambienceDuckGain.connect(this.masterGain);
  this._loadVolumeSettings();
  if (isContextSuspended) {
  this.masterGain.gain.value = 0;
  }
  const bufferSize = this.context.sampleRate * 4;
  this._noiseBuffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
  const data = this._noiseBuffer.getChannelData(0);
  let lastOut = 0;
  for (let i = 0; i < bufferSize; i++) {
  const white = Math.random() * 2 - 1;
  data[i] = (lastOut + (0.02 * white)) / 1.02;
  lastOut = data[i];
  data[i] *= 3.5;
  if (i < 500) data[i] *= (i / 500);
  if (i > bufferSize - 500) data[i] *= ((bufferSize - i) / 500);
  }
  this._distortionCurve = this._makeDistortionCurve(400);
  this._isInitialized = true;
  this._loadSampleBuffers();
  if (volPrefs.mute) {
  this.toggleMute(true);
  } else if (!isContextSuspended) {
  this.ambienceManager.startAmbience();
  } else {
  this._pendingAmbience = true;
  }
  const unlockAudio = async () => {
  if (!this._hasUnlocked && this.context) {
  const wasSuspended = this.context.state === 'suspended';
  if (wasSuspended) {
  await this.context.resume();
  }
  this._hasUnlocked = true;
  const volPrefs = getVolumePreferences();
  const savedMasterVol = volPrefs.master ?? AUDIO_RUNTIME_DEFAULTS.defaultMasterVolume;
  const t = this.context.currentTime;
  const currentVol = this.masterGain.gain.value;
  if (wasSuspended || currentVol < 0.001) {
  this.masterGain.gain.setValueAtTime(0, t);
  this.masterGain.gain.linearRampToValueAtTime(savedMasterVol, t + 1.5);
  }
  if (this._pendingAmbience) {
  this._pendingAmbience = false;
  this.ambienceManager.startAmbience();
  }
  if (this.warningManager.isWarningLoopActive()) {
  this.warningManager._startGeigerTicks(this.warningManager.getWarningIntensity());
  }
  document.removeEventListener('touchstart', unlockAudio);
  document.removeEventListener('click', unlockAudio);
  }
  };
  document.addEventListener('touchstart', unlockAudio);
  document.addEventListener('click', unlockAudio);
  document.addEventListener("visibilitychange", () => {
  if (!this._isInitialized || !this.context) return;
  if (document.hidden) {
  this.context.suspend();
  } else {
  this.context.resume().then(() => {
  if (this._hasUnlocked && !document.hidden) {
  const volPrefs = getVolumePreferences();
  const savedMasterVol = volPrefs.master ?? AUDIO_RUNTIME_DEFAULTS.defaultMasterVolume;
  const currentVol = this.masterGain.gain.value;
  if (currentVol < savedMasterVol * 0.1) {
  const t = this.context.currentTime;
  this.masterGain.gain.setValueAtTime(currentVol, t);
  this.masterGain.gain.linearRampToValueAtTime(savedMasterVol, t + 0.8);
  }
  }
  });
  }
  });
  } catch (e) {
  logger.log('warn', 'audio', 'Audio init failed', e);
  }
  }
  _makeDistortionCurve(amount) {
  const n = 44100;
  const curve = new Float32Array(n);
  const deg = Math.PI / 180;
  for (let i = 0; i < n; i++) {
  const x = (i * 2) / n - 1;
  curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
  }
  _loadVolumeSettings() {
  if (!this._isInitialized) return;
  const vol = getVolumePreferences();
  const masterVol = vol.master ?? AUDIO_RUNTIME_DEFAULTS.defaultMasterVolume;
  const effectsVol = vol.effects ?? AUDIO_RUNTIME_DEFAULTS.defaultEffectsVolume;
  const alertsVol = vol.alerts ?? AUDIO_RUNTIME_DEFAULTS.defaultAlertsVolume;
  const systemVol = vol.system ?? AUDIO_RUNTIME_DEFAULTS.defaultSystemVolume;
  const ambienceVol = vol.ambience ?? AUDIO_RUNTIME_DEFAULTS.defaultAmbienceVolume;
  if (this.masterGain) this.masterGain.gain.value = masterVol;
  if (this.effectsGain) this.effectsGain.gain.value = effectsVol;
  if (this.alertsGain) this.alertsGain.gain.value = alertsVol;
  if (this.systemGain) this.systemGain.gain.value = systemVol;
  if (this.ambienceGain) this.ambienceGain.gain.value = ambienceVol;
  }
  setVolume(category, value) {
  if (!this._isInitialized) return;
  const clampedValue = Math.max(0, Math.min(1, value));
  const prefKey = { master: "volumeMaster", effects: "volumeEffects", alerts: "volumeAlerts", system: "volumeSystem", ambience: "volumeAmbience" }[category];
  if (prefKey) preferences[prefKey] = clampedValue;
  switch (category) {
  case 'master':
  if (this.masterGain) this.masterGain.gain.value = clampedValue;
  if (clampedValue === 0) {
  this.stopTestSound();
  this.warningManager.stopWarningLoop();
  this.ambienceManager.stopAmbience();
  }
  break;
  case 'effects':
  if (this.effectsGain) this.effectsGain.gain.value = clampedValue;
  if (clampedValue === 0 && this._testSoundType === 'effects') {
  this.stopTestSound();
  }
  break;
  case 'alerts':
  if (this.alertsGain) this.alertsGain.gain.value = clampedValue;
  if (clampedValue === 0) {
  if (this._testSoundType === 'alerts') {
  this.stopTestSound();
  }
  this.warningManager.stopWarningLoop();
  }
  break;
  case 'system':
  if (this.systemGain) this.systemGain.gain.value = clampedValue;
  if (clampedValue === 0 && this._testSoundType === 'system') {
  this.stopTestSound();
  }
  break;
  case 'ambience':
  if (this.ambienceGain) this.ambienceGain.gain.value = clampedValue;
  if (clampedValue === 0) {
  this.ambienceManager.stopAmbience();
  }
  break;
  default:
  break;
  }
  }
  getVolume(category) {
  if (!this._isInitialized) return category === 'master' ? 0.12 : (category === 'ambience' ? 0.25 : 0.50);
  switch (category) {
  case 'master':
  return this.masterGain ? this.masterGain.gain.value : 0.12;
  case 'effects':
  return this.effectsGain ? this.effectsGain.gain.value : 0.50;
  case 'alerts':
  return this.alertsGain ? this.alertsGain.gain.value : 0.50;
  case 'system':
  return this.systemGain ? this.systemGain.gain.value : 0.50;
  case 'ambience':
  return this.ambienceGain ? this.ambienceGain.gain.value : 0.25;
  default:
  return 0.50;
  }
  }
  startTestSound(category) {
  this.stopTestSound();
  if (!this.enabled || !this.context || this.context.state !== 'running') return;
  this._testSoundType = category;
  const soundMap = {
  'effects': 'placement',
  'alerts': 'warning',
  'system': 'click'
  };
  const soundType = soundMap[category] || 'click';
  this._testLoopInterval = setInterval(() => {
  if (this._testSoundType === category) {
  this.play(soundType, category === 'alerts' ? 0.5 : null);
  }
  }, soundType === 'warning' ? 800 : 300);
  }
  stopTestSound() {
  if (this._testLoopInterval) {
  clearInterval(this._testLoopInterval);
  this._testLoopInterval = null;
  }
  this._testSoundType = null;
  }
  getTestSoundCategory() {
  return this._testSoundType;
  }
  toggleMute(muted) {
    if (!this._isInitialized) return;
    this.enabled = !muted;
    preferences.mute = muted;
    if (this.masterGain) {
      const targetVol = this.enabled ? (getVolumePreferences().master ?? AUDIO_RUNTIME_DEFAULTS.defaultMutedMasterVolume) : 0;
      this.masterGain.gain.setTargetAtTime(targetVol, this.context.currentTime, 0.1);
    }
    if (this.enabled) {
      this.ambienceManager.startAmbience();
      if (this.warningManager.isWarningLoopActive()) {
        this.warningManager._startGeigerTicks(this.warningManager.getWarningIntensity());
      }
    } else {
      this.ambienceManager.stopAmbience();
      this.warningManager.stopWarningLoop();
    }
  }
  _osc(startTime, type, freq, volume, duration, options = {}) {
  return this.synthesizer.osc(startTime, type, freq, volume, duration, options);
  }
  _noise(startTime, volume, duration, options = {}) {
  return this.synthesizer.noise(startTime, volume, duration, options);
  }
  _lfo(startTime, frequency, depth, target, duration) {
  return this.synthesizer.lfo(startTime, frequency, depth, target, duration);
  }
  _getLimiterScale(type, subtype, nowMs) {
  const limiter = this._soundLimiter;
  if (!limiter || !type) return 1;
  if (nowMs - limiter.lastWindowStart >= limiter.windowMs) {
  limiter.lastWindowStart = nowMs;
  limiter.counts.clear();
  }
  const key = subtype ? `${type}:${subtype}` : type;
  const globalCount = limiter.counts.get("global") || 0;
  const soundCount = limiter.counts.get(key) || 0;
  const nextGlobal = globalCount + 1;
  const nextSound = soundCount + 1;
  limiter.counts.set("global", nextGlobal);
  limiter.counts.set(key, nextSound);
  if (limiter.globalCap && nextGlobal > limiter.globalCap) return 0;
  if (limiter.perSoundCap && nextSound > limiter.perSoundCap) return 0;
  const globalScale = 1 / Math.max(1, Math.log2(nextGlobal + 1));
  const soundScale = 1 / Math.max(1, Math.log2(nextSound + 1));
  return Math.min(globalScale, soundScale);
  }
  _getCategoryGain(category) {
  if (!this._isInitialized) return this.masterGain;
  if (this._activeLimiter?.category === category) return this._activeLimiter.node;
  switch (category) {
  case 'effects':
  return this.effectsGain || this.masterGain;
  case 'alerts':
  return this.alertsGain || this.masterGain;
  case 'system':
  return this.systemGain || this.masterGain;
  default:
  return this.masterGain;
  }
  }
  _getSoundCategory(type) {
  switch (type) {
  case 'warning':
  case 'explosion':
  return 'alerts';
  case 'reboot':
  case 'flux':
  return 'system';
  default:
  return 'effects';
  }
  }
  trigger(eventId, options = {}) {
    const { param = null, pan = null } = options;
    if (!this.enabled || !this.context || this.context.state !== "running") return;
    const ctx = this.context;
    const now = Date.now();
    const t = ctx.currentTime;
    const subtype = typeof param === "string" ? param : "generic";
    const intensity = typeof param === "number" ? Math.min(Math.max(param, 0), 1) : 0.5;
    const category = this._getSoundCategory(eventId);
    let categoryGain = this._getCategoryGain(category);
    const limiterScale = this._getLimiterScale(eventId, subtype, now);
    if (!limiterScale) return;
    let limiterNode = null;
    if (limiterScale < 0.999) {
      limiterNode = ctx.createGain();
      limiterNode.gain.value = limiterScale;
      limiterNode.connect(categoryGain);
      this._activeLimiter = { category, node: limiterNode };
      categoryGain = limiterNode;
    }
    const spatialOpts = { category, pan, randomPitch: 0.08 };
    const context = { t, ctx, categoryGain, category, spatialOpts, subtype, intensity, now };
    const mergedOptions = { param, pan };
    try {
      handleAudioEvent(this, eventId, context, mergedOptions);
    } finally {
      if (limiterNode) this._activeLimiter = null;
    }
  }

  play(type, param = null, pan = null) {
    this.trigger(type, { param, pan });
  }
}


function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const pathParts = window.location.pathname.split('/').filter(p => p);
  const repoName = pathParts.length > 0 ? pathParts[0] : '';
  const basePath = repoName ? `/${repoName}` : '';
  const swPath = `${basePath}/sw.js`;
  const scope = `${basePath}/`;

  navigator.serviceWorker.register(swPath, { scope })
    .then(function(registration) {
      logger.log('info', 'ui', '[SW] Service Worker registered successfully:', registration.scope);
      if (!navigator.serviceWorker.controller) {
        navigator.serviceWorker.addEventListener('controllerchange', function() { window.location.reload(); }, { once: true });
      }
      registration.addEventListener('updatefound', function() {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', function() {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              logger.log('info', 'ui', '[SW] New service worker available');
            }
          });
        }
      });
    })
    .catch(function(error) {
      logger.error('[SW] Service Worker registration failed:', error);
    });
}

export function initializePwa() {
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (isLocalhost) {
    logger.log('info', 'ui', '[SW] Localhost detected. Skipping Service Worker registration.');
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        for (let registration of registrations) {
          registration.unregister();
        }
      });
    }
    return;
  }
  window.addEventListener('load', registerServiceWorker);
}

let deferredPrompt = null;

export function getDeferredPrompt() {
  return deferredPrompt;
}

export function clearDeferredPrompt() {
  deferredPrompt = null;
}

function setupInstallPrompt(manager) {
  if (typeof window === "undefined") return;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    if (manager) manager.installPrompt = e;
    deferredPrompt = e;
    const btn = document.querySelector("#install_pwa_btn");
    if (btn) {
      btn.classList.remove("hidden");
      if (!btn.dataset.installListenerAttached) {
        btn.dataset.installListenerAttached = "1";
        btn.addEventListener("click", async () => {
          if (deferredPrompt) {
            deferredPrompt.prompt();
            try {
              await deferredPrompt.userChoice;
            } catch (_) {}
            deferredPrompt = null;
            btn.classList.add("hidden");
          }
        });
      }
    }
  });
}

let wakeLock = null;
let wakeLockEnabled = false;
let wakeLockVisibilityListenerAttached = false;

async function acquireWakeLock() {
  if (!wakeLockEnabled) return;
  if (!('wakeLock' in navigator)) return;
  if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
  } catch (_err) {}
}

export async function requestWakeLock() {
  wakeLockEnabled = true;
  if (!wakeLockVisibilityListenerAttached && typeof document !== "undefined" && typeof document.addEventListener === "function") {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        acquireWakeLock();
      }
    });
    wakeLockVisibilityListenerAttached = true;
  }
  await acquireWakeLock();
}

export function releaseWakeLock() {
  wakeLockEnabled = false;
  if (wakeLock !== null) {
    wakeLock.release();
    wakeLock = null;
  }
}

if (typeof document !== "undefined" && typeof window !== "undefined") {
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && window.splashManager) {
      window.splashManager.forceHide();
    }
    if (e.ctrlKey && e.shiftKey && e.key === "V") {
      e.preventDefault();
      if (window.splashManager) {
        window.splashManager?.versionChecker?.triggerVersionCheckToast();
      }
    }
  });

  window.addEventListener("appinstalled", () => {
    clearDeferredPrompt();
    const btn = document.querySelector("#install_pwa_btn");
    if (btn) btn.classList.add("hidden");
  });
}

if (typeof document !== "undefined" && typeof window !== "undefined") {
  (function setupConnectivityUI() {
    function updateGoogleDriveButtonState() {
      const isOnline = navigator.onLine;
      const selectors = [
        "#splash-load-cloud-btn",
        "#splash-google-signin-btn",
        "#splash-google-signout-btn",
        "#splash-signin-btn",
        "#splash-signout-btn",
        "#splash-upload-option-btn",
      ];
      selectors.forEach((sel) => {
        const el = document.querySelector(sel);
        if (el) {
          el.disabled = !isOnline;
          el.title = isOnline ? "Requires Google Drive permissions" : "Requires an internet connection";
        }
      });
      const cloudArea = document.getElementById("splash-cloud-button-area");
      if (cloudArea) {
        cloudArea.querySelectorAll("button").forEach((btn) => {
          btn.disabled = !isOnline;
          btn.title = isOnline ? btn.title || "" : "Requires an internet connection";
        });
      }
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", updateGoogleDriveButtonState, { once: true });
    } else {
      updateGoogleDriveButtonState();
    }

    window.addEventListener("online", updateGoogleDriveButtonState);
    window.addEventListener("offline", updateGoogleDriveButtonState);
  })();
}

if (typeof window !== "undefined") {
  window.showHotkeyHelp = function () {};
}

export class VersionChecker {
  constructor(splashManagerRef) {
    this.splashManagerRef = splashManagerRef;
    this.currentVersion = null;
  }

  startVersionChecking() {
    this.currentVersion = null;
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'NEW_VERSION_AVAILABLE') {
          this.handleNewVersion(event.data.version, event.data.currentVersion);
        }
      });
    }
  }

  async checkForNewVersion() {
    try {
      const localResponse = await fetch('./version.json', { cache: 'no-cache' });

      if (!localResponse.ok) {
        logger.log('warn', 'ui', `Local version check failed with status: ${localResponse.status}`);
        return;
      }

      const contentType = localResponse.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        logger.log('warn', 'ui', `Local version response is not JSON. Content-Type: ${contentType}`);
        return;
      }

      const localVersionData = await localResponse.json();
      const parsedLocal = VersionSchema.safeParse(localVersionData);
      const currentLocalVersion = parsedLocal.success ? parsedLocal.data.version : "Unknown";

      if (!currentLocalVersion) {
        logger.log('warn', 'ui', 'Local version data missing or invalid:', localVersionData);
        return;
      }

      if (this.currentVersion === null) {
        this.currentVersion = currentLocalVersion;
      }

      const latestVersion = await this.checkDeployedVersion();

      if (latestVersion && this.isNewerVersion(latestVersion, currentLocalVersion)) {
        this.handleNewVersion(latestVersion, currentLocalVersion);
      }
    } catch (error) {
      logger.log('warn', 'ui', 'Failed to check for new version:', error);
    }
  }

  async checkDeployedVersion() {
    try {
      if (!navigator.onLine) {
        return null;
      }
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return null;
      }

      const { getBasePath } = await import("./utils.js");
      const basePath = getBasePath();
      const versionUrl = `${window.location.origin}${basePath}/version.json`;

      const response = await fetch(versionUrl, {
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });

      if (response.ok) {
        const data = await response.json();
        const parsed = VersionSchema.safeParse(data);
        return parsed.success ? parsed.data.version : null;
      }
    } catch (error) {
      logger.log('warn', 'ui', 'Failed to check deployed version:', error);
    }
    return null;
  }

  async getLocalVersion() {
    try {
      const cache = await caches.open("static-resources");
      const { getBasePath } = await import("./utils.js");
      const basePath = getBasePath();
      const versionUrl = `${basePath}/version.json`;
      const response = await cache.match(versionUrl);
      if (response) {
        const data = await response.json();
        const parsed = VersionSchema.safeParse(data);
        return parsed.success ? parsed.data.version : null;
      }
    } catch (error) {
      logger.log('warn', 'ui', 'Failed to get local version from cache:', error);
    }

    try {
      const { getResourceUrl } = await import("./utils.js");
      const versionUrl = getResourceUrl("version.json");
      const response = await fetch(versionUrl, { cache: 'no-cache' });
      if (response.ok) {
        const data = await response.json();
        const parsed = VersionSchema.safeParse(data);
        return parsed.success ? parsed.data.version : null;
      }
    } catch (error) {
      console.warn("Failed to get local version from direct fetch:", error);
    }

    try {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        return new Promise((resolve) => {
          const messageChannel = new MessageChannel();
          messageChannel.port1.onmessage = (event) => {
            if (event.data && event.data.type === 'VERSION_RESPONSE') {
              resolve(event.data.version);
            } else {
              resolve(null);
            }
          };

          navigator.serviceWorker.controller.postMessage({
            type: 'GET_VERSION'
          }, [messageChannel.port2]);

          setTimeout(() => resolve(null), 2000);
        });
      }
    } catch (error) {
      logger.log('warn', 'ui', 'Failed to get local version from service worker:', error);
    }

    return null;
  }

  isNewerVersion(deployedVersion, localVersion) {
    if (!deployedVersion || !localVersion) {
      return false;
    }
    return deployedVersion > localVersion;
  }

  handleNewVersion(newVersion, currentVersion = null) {
    const lastNotifiedVersion = StorageUtils.get('reactor-last-notified-version');
    if (lastNotifiedVersion === newVersion) return;
    this.showUpdateToast(newVersion, currentVersion || this.currentVersion);
    this.currentVersion = newVersion;
    StorageUtils.set('reactor-last-notified-version', newVersion);
  }

  showUpdateNotification(newVersion, currentVersion) {
    const modal = document.createElement("div");
    modal.className = "update-notification-modal";
    const onDismiss = () => modal.remove();
    render(html`
      <style>
        .update-notification-modal {
          position: fixed; top: 0; left: 0; width: 100%; height: 100%;
          background: rgba(0, 0, 0, 0.8); display: flex; justify-content: center;
          align-items: center; z-index: 10000; font-family: 'Press Start 2P', monospace;
        }
        .update-notification-content {
          background: #2a2a2a; border: 2px solid #4a4a4a; border-radius: 8px;
          padding: 20px; max-width: 400px; text-align: center; color: #fff;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        }
        .update-notification-content h3 { margin: 0 0 15px 0; color: #4CAF50; font-size: 1.2em; }
        .version-comparison { margin: 15px 0; display: flex; justify-content: space-around; gap: 20px; }
        .version-item { display: flex; flex-direction: column; align-items: center; gap: 5px; }
        .version-label { font-size: 0.9em; color: #ccc; }
        .version-value { font-size: 1.1em; font-weight: bold; padding: 5px 10px; border-radius: 4px; }
        .version-value.current { background: #f44336; color: white; }
        .version-value.latest { background: #4CAF50; color: white; }
        .update-instruction { margin: 15px 0; font-size: 0.9em; line-height: 1.4; }
        .update-instruction a { color: #4CAF50; text-decoration: none; }
        .update-instruction a:hover { text-decoration: underline; }
        .update-actions { display: flex; gap: 10px; justify-content: center; margin-top: 20px; }
        .update-btn { padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; font-family: 'Press Start 2P', monospace; font-size: 0.9em; transition: background-color 0.2s; }
        .update-btn.refresh { background: #4CAF50; color: white; }
        .update-btn.refresh:hover { background: #45a049; }
        .update-btn.dismiss { background: #666; color: white; }
        .update-btn.dismiss:hover { background: #777; }
      </style>
      <div class="update-notification-content">
        <h3>🚀 Update Available!</h3>
        <p>A new version of Reactor Revival is available:</p>
        <div class="version-comparison">
          <div class="version-item">
            <span class="version-label">Current:</span>
            <span class="version-value current">${escapeHtml(currentVersion)}</span>
          </div>
          <div class="version-item">
            <span class="version-label">Latest:</span>
            <span class="version-value latest">${escapeHtml(newVersion)}</span>
          </div>
        </div>
        <p class="update-instruction">
          To get the latest version, refresh your browser or check for updates.
        </p>
        <div class="update-actions">
          <button class="update-btn refresh" @click=${() => window.location.reload()}>
            🔄 Refresh Now
          </button>
          <button class="update-btn dismiss" @click=${onDismiss}>
            ✕ Dismiss
          </button>
        </div>
      </div>
    `, modal);

    document.body.appendChild(modal);

    setTimeout(() => {
      if (document.body.contains(modal)) {
        modal.remove();
      }
    }, 30000);
  }

  showUpdateToast(_newVersion, _currentVersion) {
    const existingToast = document.querySelector('.update-toast');
    if (existingToast) {
      existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.className = 'update-toast';
    const onRefresh = () => {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
      }
      window.location.reload();
    };
    const onClose = () => toast.remove();
    render(html`
      <style>
        .update-toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: #2a2a2a; border: 2px solid #4CAF50; border-radius: 8px; padding: 0; z-index: 10000; font-family: 'Press Start 2P', monospace; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5); animation: toast-slide-up 0.3s ease-out; max-width: 400px; width: 90%; }
        .update-toast-content { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; gap: 12px; }
        .update-toast-message { display: flex; align-items: center; gap: 8px; flex: 1; color: #fff; }
        .update-toast-text { font-size: 0.9em; font-weight: 500; }
        .update-toast-button { background: #4CAF50; color: white; border: none; border-radius: 4px; padding: 8px 16px; font-family: 'Press Start 2P', monospace; font-size: 0.8em; cursor: pointer; transition: background-color 0.2s; white-space: nowrap; }
        .update-toast-button:hover { background: #45a049; }
        .update-toast-close { background: transparent; color: #ccc; border: none; font-size: 1.2em; cursor: pointer; padding: 4px; line-height: 1; transition: color 0.2s; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; }
        .update-toast-close:hover { color: #fff; }
        @keyframes toast-slide-up { from { transform: translateX(-50%) translateY(100px); opacity: 0; } to { transform: translateX(-50%) translateY(0); opacity: 1; } }
        @media (max-width: 480px) { .update-toast { bottom: 10px; left: 10px; right: 10px; transform: none; max-width: none; width: auto; } .update-toast-content { padding: 10px 12px; gap: 8px; } .update-toast-text { font-size: 0.8em; } .update-toast-button { padding: 6px 12px; font-size: 0.75em; } }
      </style>
      <div class="update-toast-content">
        <div class="update-toast-message">
          <span class="update-toast-text">New content available, click to reload.</span>
        </div>
        <button class="update-toast-button" @click=${onRefresh}>Reload</button>
        <button class="update-toast-close" @click=${onClose}>×</button>
      </div>
    `, toast);

    document.body.appendChild(toast);

    setTimeout(() => {
      if (document.body.contains(toast)) {
        toast.style.animation = 'toast-slide-up 0.3s ease-out reverse';
        setTimeout(() => {
          if (document.body.contains(toast)) {
            toast.remove();
          }
        }, 300);
      }
    }, 10000);
  }

  async triggerVersionCheckToast() {
    try {
      const currentVersion = await this.getLocalVersion() || "Unknown";
      const deployedVersion = await this.checkDeployedVersion();
      if (deployedVersion && this.isNewerVersion(deployedVersion, currentVersion)) {
        this.showUpdateToast(deployedVersion, currentVersion);
      } else if (deployedVersion && deployedVersion === currentVersion) {
        this.showVersionCheckToast(`You're running the latest version: ${currentVersion}`, 'info');
      } else if (deployedVersion && !this.isNewerVersion(deployedVersion, currentVersion) && deployedVersion !== currentVersion) {
        this.showVersionCheckToast(`Current version: ${currentVersion} (Deployed: ${deployedVersion})`, 'warning');
      } else {
        this.showVersionCheckToast(`Current version: ${currentVersion} (Unable to check for updates)`, 'warning');
      }
    } catch (error) {
      logger.log('error', 'ui', 'Version check failed:', error);
      this.showVersionCheckToast('Version check failed. Please try again later.', 'error');
    }
  }

  showVersionCheckToast(message, type = "info") {
    const existingToast = document.querySelector(".version-check-toast");
    if (existingToast) {
      existingToast.remove();
    }

    const toast = document.createElement("div");
    toast.className = "version-check-toast";
    const icon = type === "info" ? "ℹ️" : type === "warning" ? "⚠️" : "❌";
    const borderColor = type === "info" ? "#2196F3" : type === "warning" ? "#FF9800" : "#f44336";
    const onClose = () => toast.remove();
    render(html`
      <style>
        .version-check-toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: #2a2a2a; border: 2px solid ${borderColor}; border-radius: 8px; padding: 0; z-index: 10000; font-family: 'Press Start 2P', monospace; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5); animation: toast-slide-up 0.3s ease-out; max-width: 400px; width: 90%; }
        .version-check-toast-content { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; gap: 12px; }
        .version-check-toast-message { display: flex; align-items: center; gap: 8px; flex: 1; }
        .version-check-toast-icon { font-size: 1.2em; }
        .version-check-toast-text { color: #fff; font-size: 0.7em; line-height: 1.4; }
        .version-check-toast-close { background: transparent; color: #ccc; border: none; font-size: 1.2em; cursor: pointer; padding: 4px; line-height: 1; transition: color 0.2s; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; }
        .version-check-toast-close:hover { color: #fff; }
        @keyframes toast-slide-up { from { transform: translateX(-50%) translateY(100px); opacity: 0; } to { transform: translateX(-50%) translateY(0); opacity: 1; } }
        @media (max-width: 480px) { .version-check-toast { bottom: 10px; left: 10px; right: 10px; transform: none; max-width: none; width: auto; } .version-check-toast-content { padding: 10px 12px; gap: 8px; } .version-check-toast-text { font-size: 0.6em; } }
      </style>
      <div class="version-check-toast-content">
        <div class="version-check-toast-message">
          <span class="version-check-toast-icon">${icon}</span>
          <span class="version-check-toast-text">${message}</span>
        </div>
        <button class="version-check-toast-close" @click=${onClose}>×</button>
      </div>
    `, toast);

    document.body.appendChild(toast);

    setTimeout(() => {
      if (document.body.contains(toast)) {
        toast.style.animation = 'toast-slide-up 0.3s ease-out reverse';
        setTimeout(() => {
          if (document.body.contains(toast)) {
            toast.remove();
          }
        }, 300);
      }
    }, 5000);
  }

  clearVersionNotification() {
    StorageUtils.remove('reactor-last-notified-version');
    const versionEl = this.splashManagerRef.splashScreen?.querySelector('#splash-version-text');
    if (versionEl) {
      versionEl.classList.remove('new-version');
      versionEl.title = 'Click to check for updates';
    }
  }
}

const partImagesByTier = {
  1: [
    'img/parts/accelerators/accelerator_1.png',
    'img/parts/capacitors/capacitor_1.png',
    'img/parts/cells/cell_1_1.png',
    'img/parts/cells/cell_1_2.png',
    'img/parts/cells/cell_1_4.png',
    'img/parts/coolants/coolant_cell_1.png',
    'img/parts/exchangers/exchanger_1.png',
    'img/parts/inlets/inlet_1.png',
    'img/parts/outlets/outlet_1.png',
    'img/parts/platings/plating_1.png',
    'img/parts/reflectors/reflector_1.png',
    'img/parts/vents/vent_1.png',
  ],
  2: [
    'img/parts/accelerators/accelerator_2.png',
    'img/parts/capacitors/capacitor_2.png',
    'img/parts/cells/cell_2_1.png',
    'img/parts/cells/cell_2_2.png',
    'img/parts/cells/cell_2_4.png',
    'img/parts/coolants/coolant_cell_2.png',
    'img/parts/exchangers/exchanger_2.png',
    'img/parts/inlets/inlet_2.png',
    'img/parts/outlets/outlet_2.png',
    'img/parts/platings/plating_2.png',
    'img/parts/reflectors/reflector_2.png',
    'img/parts/vents/vent_2.png',
  ],
  3: [
    'img/parts/accelerators/accelerator_3.png',
    'img/parts/capacitors/capacitor_3.png',
    'img/parts/cells/cell_3_1.png',
    'img/parts/cells/cell_3_2.png',
    'img/parts/cells/cell_3_4.png',
    'img/parts/coolants/coolant_cell_3.png',
    'img/parts/exchangers/exchanger_3.png',
    'img/parts/inlets/inlet_3.png',
    'img/parts/outlets/outlet_3.png',
    'img/parts/platings/plating_3.png',
    'img/parts/reflectors/reflector_3.png',
    'img/parts/vents/vent_3.png',
  ],
  4: [
    'img/parts/accelerators/accelerator_4.png',
    'img/parts/capacitors/capacitor_4.png',
    'img/parts/cells/cell_4_1.png',
    'img/parts/cells/cell_4_2.png',
    'img/parts/cells/cell_4_4.png',
    'img/parts/coolants/coolant_cell_4.png',
    'img/parts/exchangers/exchanger_4.png',
    'img/parts/inlets/inlet_4.png',
    'img/parts/outlets/outlet_4.png',
    'img/parts/platings/plating_4.png',
    'img/parts/reflectors/reflector_4.png',
    'img/parts/vents/vent_4.png',
  ],
  5: [
    'img/parts/accelerators/accelerator_5.png',
    'img/parts/capacitors/capacitor_5.png',
    'img/parts/coolants/coolant_cell_5.png',
    'img/parts/exchangers/exchanger_5.png',
    'img/parts/inlets/inlet_5.png',
    'img/parts/outlets/outlet_5.png',
    'img/parts/platings/plating_5.png',
    'img/parts/cells/cell_5_1.png',
    'img/parts/cells/cell_5_2.png',
    'img/parts/cells/cell_5_4.png',
    'img/parts/reflectors/reflector_5.png',
    'img/parts/vents/vent_5.png',
  ],
  6: [
    'img/parts/accelerators/accelerator_6.png',
    'img/parts/capacitors/capacitor_6.png',
    'img/parts/cells/cell_6_1.png',
    'img/parts/cells/cell_6_2.png',
    'img/parts/cells/cell_6_4.png',
    'img/parts/cells/xcell_1_1.png',
    'img/parts/cells/xcell_1_2.png',
    'img/parts/cells/xcell_1_4.png',
    'img/parts/coolants/coolant_cell_6.png',
    'img/parts/exchangers/exchanger_6.png',
    'img/parts/inlets/inlet_6.png',
    'img/parts/outlets/outlet_6.png',
    'img/parts/platings/plating_6.png',
    'img/parts/reflectors/reflector_6.png',
    'img/parts/vents/vent_6.png',
  ],
};

const maxTier = 6;

function getUiIconAssets() {
  return [
    'img/ui/icons/icon_cash.png', 'img/ui/icons/icon_heat.png',
    'img/ui/icons/icon_power.png', 'img/ui/icons/icon_time.png',
    'img/ui/icons/icon_inlet.png', 'img/ui/icons/icon_outlet.png',
    'img/ui/icons/icon_vent.png', 'img/ui/icons/icon_cash_outline.svg',
    'img/ui/icons/icon_copy.svg', 'img/ui/icons/icon_deselect.svg',
    'img/ui/icons/icon_dropper.svg', 'img/ui/icons/icon_paste.svg',
  ];
}

function getStatusAndNavAssets() {
  return [
    'img/ui/status/status_bolt.png', 'img/ui/status/status_infinity.png',
    'img/ui/status/status_plus.png', 'img/ui/status/status_star.png',
    'img/ui/status/status_time.png', 'img/ui/nav/nav_experimental.png',
    'img/ui/nav/nav_normal.png', 'img/ui/nav/nav_pause.png',
    'img/ui/nav/nav_play.png', 'img/ui/nav/nav_renew.png',
    'img/ui/nav/nav_unrenew.png',
  ];
}

function getBorderAndPanelAssets() {
  return [
    'img/ui/borders/button/button_border.png', 'img/ui/borders/button/button_border_alt.png',
    'img/ui/borders/button/button_border_alt_active.png', 'img/ui/borders/button/button_border_alt_down.png',
    'img/ui/borders/button/button_border_alt_down_active.png', 'img/ui/borders/button/small_button_down.png',
    'img/ui/borders/button/small_button_off.png', 'img/ui/borders/button/small_button_on.png',
    'img/ui/borders/panel/medium_panel.png', 'img/ui/borders/panel/panel_border.png',
    'img/ui/borders/panel/panel_border_first_first.png', 'img/ui/borders/panel/panel_border_first_last.png',
    'img/ui/borders/panel/panel_border_last_first.png', 'img/ui/borders/panel/panel_border_last_last.png',
    'img/ui/borders/panel/panel_border_last_middle.png',
  ];
}

function getInnerAndFlowAssets() {
  return [
    'img/ui/inner/inner_border.png', 'img/ui/inner/inner_border_alt.png',
    'img/ui/inner/inner_border_alt_active.png', 'img/ui/inner/inner_border_alt_down.png',
    'img/ui/inner/inner_border_alt_flip.png', 'img/ui/inner/inner_border_alt_flip_active.png',
    'img/ui/inner/inner_border_alt_flip_down.png', 'img/ui/flow/flow-arrow-down.svg',
    'img/ui/flow/flow-arrow-left.svg', 'img/ui/flow/flow-arrow-right.svg',
    'img/ui/flow/flow-arrow-up.svg', 'img/ui/effects/explosion_map.png',
    'img/ui/connector_border.png', 'img/ui/tile.png',
  ];
}

function getPartAssets() {
  return [
    'img/parts/cells/cell_1_1.png', 'img/parts/cells/cell_1_2.png', 'img/parts/cells/cell_1_4.png',
    'img/parts/accelerators/accelerator_1.png', 'img/parts/capacitors/capacitor_1.png',
    'img/parts/coolants/coolant_cell_1.png', 'img/parts/exchangers/exchanger_1.png',
    'img/parts/inlets/inlet_1.png', 'img/parts/outlets/outlet_1.png',
    'img/parts/platings/plating_1.png', 'img/parts/reflectors/reflector_1.png',
    'img/parts/vents/vent_1.png', 'img/parts/valves/valve_1_1.png',
    'img/parts/valves/valve_1_2.png', 'img/parts/valves/valve_1_3.png',
    'img/parts/valves/valve_1_4.png',
  ];
}

export function getCriticalUiIconAssets() {
  return [
    ...getUiIconAssets(),
    ...getStatusAndNavAssets(),
    ...getBorderAndPanelAssets(),
    ...getInnerAndFlowAssets(),
    ...getPartAssets(),
  ];
}

export async function warmImageCache(imagePaths) {
  const loadPromises = imagePaths.map(async (imagePath) => {
    try {
      const img = new Image();
      const loadPromise = new Promise((resolve) => {
        img.onload = () => resolve({ success: true, path: imagePath });
        img.onerror = () => resolve({ success: false, path: imagePath });
      });
      img.src = imagePath;
      return loadPromise;
    } catch (error) {
      return { success: false, path: imagePath, error };
    }
  });
  try {
    const results = await Promise.allSettled(loadPromises);
    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const failed = results.filter(r => r.status === 'fulfilled' && !r.value.success).length;
    if (failed > 0) {
      const failedAssets = results
        .filter(r => r.status === 'fulfilled' && !r.value.success)
        .map(r => r.value.path);
      logger.log('warn', 'ui', `[PWA] Failed to preload: ${failedAssets.join(', ')}`);
    }
  } catch (error) {
    console.warn('[PWA] Image cache warming encountered an error:', error);
  }
}

export async function preloadTierImages(tier) {
  const tierImages = partImagesByTier[tier] || [];
  if (tierImages.length === 0) {
    return;
  }
  const loadPromises = tierImages.map(async (imagePath) => {
    try {
      const img = new Image();
      const loadPromise = new Promise((resolve) => {
        img.onload = () => resolve(imagePath);
        img.onerror = () => resolve(imagePath);
      });
      img.src = imagePath;
      return loadPromise;
    } catch (error) {
      logger.log('warn', 'ui', `[PWA] Error preloading tier ${tier} image ${imagePath}:`, error);
      return imagePath;
    }
  });
  await Promise.allSettled(loadPromises);
}

export async function preloadAllPartImages() {
  const tierPromises = Array.from({ length: maxTier }, (_, i) => preloadTierImages(i + 1));
  await Promise.all(tierPromises);
}

export function getPartImagesByTier() {
  return partImagesByTier;
}

export function getMaxTier() {
  return maxTier;
}


function restoreAuthToken(service) {
  try {
    const tokenData = StorageUtils.get("google_drive_auth_token");
    if (tokenData) {
      if (tokenData.expires_at && tokenData.expires_at > Date.now() + 300000) {
        service.authToken = tokenData.access_token;
        service.isSignedIn = true;
      } else {
        StorageUtils.remove("google_drive_auth_token");
      }
    }
  } catch {
    StorageUtils.remove("google_drive_auth_token");
  }
}

function restoreUserInfo(service) {
  try {
    const userInfo = StorageUtils.get("google_drive_user_info");
    if (userInfo) service.userInfo = userInfo;
  } catch {
    StorageUtils.remove("google_drive_user_info");
  }
}

function isConfigured(service) {
  try {
    if (!service.config) {
      service.config = getGoogleDriveConfig();
    }
    return !!(service.config && service.config.CLIENT_ID && service.config.API_KEY);
  } catch {
    return false;
  }
}

function loadScript(src, errorName) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(errorName));
    document.head.appendChild(script);
  });
}

async function loadGsiClientIfNeeded() {
  if (window.google?.accounts) return;
  await loadScript("https://accounts.google.com/gsi/client", "gsi load failed");
}

async function loadGapiApiIfNeeded() {
  if (window.gapi) return;
  await loadScript("https://apis.google.com/js/api.js", "gapi load failed");
}

async function loadGapiClientAndDrive(service) {
  await new Promise((resolve, reject) => {
    gapi.load("client", async () => {
      try {
        await gapi.client.init({ apiKey: service.config.API_KEY });
        await gapi.client.load("drive", "v3");
        resolve();
      } catch (e) {
        reject(e);
      }
    });
  });
}

function initTokenClient(service) {
  service.tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: service.config.CLIENT_ID,
    scope: "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata",
    callback: async (response) => {
      if (response.access_token) {
        await handleAuthSuccess(service, response);
      }
    },
  });
}

async function loadGapiScripts(service) {
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("offline");
  await loadGsiClientIfNeeded();
  await loadGapiApiIfNeeded();
  await loadGapiClientAndDrive(service);
  initTokenClient(service);
}

async function handleAuthSuccess(service, response) {
  const expiresAt = Date.now() + (response.expires_in || 3600) * 1000;
  const tokenData = { access_token: response.access_token, expires_at: expiresAt };
  StorageUtils.set("google_drive_auth_token", tokenData);
  service.authToken = response.access_token;
  service.isSignedIn = true;
  try {
    const userResponse = await fetch("https://www.googleapis.com/drive/v3/about?fields=user", {
      headers: { Authorization: `Bearer ${service.authToken}` },
    });
    if (userResponse.ok) {
      const userData = await userResponse.json();
      if (userData.user) {
        service.userInfo = {
          id: userData.user.permissionId || userData.user.emailAddress,
          email: userData.user.emailAddress,
          name: userData.user.displayName,
          imageUrl: userData.user.photoLink,
        };
        StorageUtils.set("google_drive_user_info", service.userInfo);
      }
    }
  } catch (err) {
    logger.log('error', 'game', 'Error fetching user info:', err);
  }
}

function tryRestoreTokenFromStorage(service) {
  if (service.authToken) return;
  const tokenData = StorageUtils.get("google_drive_auth_token");
  if (!tokenData) return;
  try {
    if (tokenData.expires_at && tokenData.expires_at > Date.now() + 300000) {
      service.authToken = tokenData.access_token;
    } else {
      StorageUtils.remove("google_drive_auth_token");
    }
  } catch {
    StorageUtils.remove("google_drive_auth_token");
  }
}

async function validateTokenWithDriveApi(service) {
  const response = await fetch("https://www.googleapis.com/drive/v3/about?fields=user", {
    headers: { Authorization: `Bearer ${service.authToken}` },
  });
  if (!response.ok) return false;
  const data = await response.json();
  if (!data.user) return false;
  service.userInfo = {
    id: data.user.permissionId || data.user.emailAddress,
    email: data.user.emailAddress,
    name: data.user.displayName,
    imageUrl: data.user.photoLink,
  };
  StorageUtils.set("google_drive_user_info", service.userInfo);
  service.isSignedIn = true;
  return true;
}

function clearAuthState(service) {
  service.authToken = null;
  service.isSignedIn = false;
  service.userInfo = null;
  StorageUtils.remove("google_drive_auth_token");
  StorageUtils.remove("google_drive_user_info");
}

function tryLegacyGapiAuth(service) {
  if (!window.gapi?.auth2) return false;
  const authInstance = window.gapi.auth2.getAuthInstance();
  if (!authInstance || !authInstance.isSignedIn.get()) return false;
  const user = authInstance.currentUser.get();
  const authResponse = user.getAuthResponse();
  service.authToken = authResponse.access_token;
  service.isSignedIn = true;
  const expiresAt = Date.now() + (authResponse.expires_in || 3600) * 1000;
  StorageUtils.set("google_drive_auth_token", { access_token: authResponse.access_token, expires_at: expiresAt });
  const profile = user.getBasicProfile();
  if (profile) {
    service.userInfo = {
      id: profile.getId(),
      email: profile.getEmail(),
      name: profile.getName(),
      imageUrl: profile.getImageUrl(),
    };
    StorageUtils.set("google_drive_user_info", service.userInfo);
  }
  return true;
}

async function checkAuth(service, silent = true) {
  if (!isConfigured(service)) return false;
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    if (service.authToken) service.isSignedIn = true;
    return !!service.authToken;
  }
  try {
    tryRestoreTokenFromStorage(service);
    if (service.authToken) {
      const valid = await validateTokenWithDriveApi(service);
      if (valid) return true;
      clearAuthState(service);
    }
    if (tryLegacyGapiAuth(service)) return true;
    return false;
  } catch {
    return false;
  }
}

function getUserInfo(service) {
  if (!service.isSignedIn) return null;
  if (service.userInfo) return service.userInfo;
  try {
    if (window.gapi && window.gapi.auth2) {
      const authInstance = window.gapi.auth2.getAuthInstance();
      if (authInstance && authInstance.isSignedIn.get()) {
        const user = authInstance.currentUser.get();
        const profile = user.getBasicProfile();
        if (profile) {
          service.userInfo = {
            id: profile.getId(),
            email: profile.getEmail(),
            name: profile.getName(),
            imageUrl: profile.getImageUrl(),
          };
          StorageUtils.set("google_drive_user_info", service.userInfo);
          return service.userInfo;
        }
      }
    }
  } catch (err) {
    logger.log('error', 'game', 'Error getting Google user info:', err);
  }
  return null;
}

function getUserId(service) {
  const userInfo = getUserInfo(service);
  return userInfo ? userInfo.id : null;
}

function signOut(service) {
  if (service.authToken && typeof google !== "undefined" && google.accounts?.oauth2?.revoke) {
    google.accounts.oauth2.revoke(service.authToken);
  }
  StorageUtils.remove("google_drive_auth_token");
  StorageUtils.remove("google_drive_save_file_id");
  StorageUtils.remove("google_drive_user_info");
  service.isSignedIn = false;
  service.authToken = null;
  service.saveFileId = null;
  service.userInfo = null;
}

function signIn(service) {
  if (!service.tokenClient) throw new Error("Google Drive not initialized");
  return new Promise((resolve, reject) => {
    service.tokenClient.callback = (response) => {
      if (response.error) {
        reject(new Error(response.error));
      } else {
        handleAuthSuccess(service, response).then(resolve).catch(reject);
      }
    };
    service.tokenClient.requestAccessToken({ prompt: "consent" });
  });
}

async function findSaveFile(service) {
  if (!service.isSignedIn) return false;
  try {
    const searchQuery = encodeURIComponent("name contains 'reactor-revival-save'");
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${searchQuery}&orderBy=createdTime desc&spaces=drive`,
      { headers: { Authorization: `Bearer ${service.authToken}` } }
    );
    if (response.ok) {
      const data = await response.json();
      if (data.files && data.files.length > 0) {
        const mostRecent = data.files[0];
        service.saveFileId = mostRecent.id;
        StorageUtils.set("google_drive_save_file_id", mostRecent.id);
        return true;
      }
    }
    if (service.saveFileId) {
      const verifyResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files/${service.saveFileId}`,
        { headers: { Authorization: `Bearer ${service.authToken}` } }
      );
      if (verifyResponse.ok) return true;
      service.saveFileId = null;
      StorageUtils.remove("google_drive_save_file_id");
    }
    return false;
  } catch (err) {
    logger.log('error', 'game', 'Error finding save file:', err);
    return false;
  }
}

async function loadZipLibrary(service) {
  if (typeof pako === "undefined") {
    throw new Error("pako library not loaded. Check that lib/pako.min.js is included in HTML.");
  }
  if (typeof window.zip === "undefined") {
    throw new Error("zip.js library not loaded. Check that lib/zip.min.js is included in HTML.");
  }
  if (window.zip) {
    window.zip.configure({ useWebWorkers: false });
  }
}

async function compressAndEncrypt(service, saveData) {
  await loadZipLibrary(service);
  if (!window.zip) throw new Error("zip.js library failed to load");
  const password = "reactor-revival-secure-save-2024";
  const zipWriter = new window.zip.ZipWriter(new window.zip.BlobWriter("application/zip"), {
    password,
    zipCrypto: true,
  });
  const text = typeof saveData === "string" ? saveData : serializeSave(saveData);
  await zipWriter.add("save.json", new window.zip.TextReader(text));
  return await zipWriter.close();
}

async function decompressAndDecryptLegacy(service, encryptedData) {
  if (!(encryptedData instanceof ArrayBuffer)) throw new Error("Encrypted data must be an ArrayBuffer.");
  const key = "a_very_secure_key";
  const encryptedBytes = new Uint8Array(encryptedData);
  const decryptedBytes = new Uint8Array(encryptedBytes.length);
  for (let i = 0; i < encryptedBytes.length; i++) {
    decryptedBytes[i] = encryptedBytes[i] ^ key.charCodeAt(i % key.length);
  }
  if (typeof pako === "undefined") throw new Error("pako is not defined");
  const decompressedData = pako.inflate(decryptedBytes, { to: "string" });
  return deserializeSave(decompressedData);
}

async function decompressAndDecrypt(service, encryptedData) {
  await loadZipLibrary(service);
  if (!window.zip) throw new Error("zip.js library failed to load");
  try {
    const blob = new Blob([encryptedData], { type: "application/zip" });
    const zipReader = new window.zip.ZipReader(new window.zip.BlobReader(blob));
    const password = "reactor-revival-secure-save-2024";
    const entries = await zipReader.getEntries({ password });
    if (entries.length > 0) {
      const writer = new window.zip.TextWriter();
      const jsonText = await entries[0].getData(writer, { password });
      await zipReader.close();
      return deserializeSave(jsonText);
    }
    await zipReader.close();
    throw new Error("No data found in save file.");
  } catch (err) {
    if (err.message && err.message.includes("password")) {
      return decompressAndDecryptLegacy(service, encryptedData);
    }
    throw err;
  }
}

async function load(service) {
  if (!service.isSignedIn || !service.saveFileId) throw new Error("No save file available");
  try {
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${service.saveFileId}?alt=media`,
      { headers: { Authorization: `Bearer ${service.authToken}` } }
    );
    if (!response.ok) throw new Error(`Failed to download save file: ${response.status}`);
    const encryptedData = await response.arrayBuffer();
    return await decompressAndDecrypt(service, encryptedData);
  } catch (err) {
    logger.log('error', 'game', 'Failed to load from Google Drive:', err);
    throw err;
  }
}

async function uploadToExistingFile(service, fileId, encryptedBlob) {
  return await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${service.authToken}`, "Content-Type": "application/zip" },
      body: encryptedBlob,
    }
  );
}

async function createNewSaveFile(service) {
  const timestamp = new Date().toISOString().slice(0, 16).replace(/:/g, "-");
  const fileName = `reactor-revival-save-${timestamp}.zip`;
  const metadataResponse = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${service.authToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: fileName, description: "Reactor Revival game save (encrypted)" }),
  });
  if (!metadataResponse.ok) throw new Error(`File creation failed: ${metadataResponse.status}`);
  return await metadataResponse.json();
}

async function uploadToNewFile(service, encryptedBlob) {
  const fileMetadata = await createNewSaveFile(service);
  return await uploadToExistingFile(service, fileMetadata.id, encryptedBlob);
}

async function performSave(service, saveData) {
  const encryptedBlob = await compressAndEncrypt(service, saveData);

  let response;
  if (service.saveFileId) {
    response = await uploadToExistingFile(service, service.saveFileId, encryptedBlob);
  } else {
    response = await uploadToNewFile(service, encryptedBlob);
  }

  if (!response.ok) {
    if (response.status === 404 && service.saveFileId) {
      service.saveFileId = null;
      return await performSave(service, saveData);
    }
    throw new Error(`Save failed: ${response.status}`);
  }

  const result = await response.json();
  service.saveFileId = result.id;
  StorageUtils.set("google_drive_save_file_id", result.id);
  return true;
}

async function save(service, saveData, immediate = false) {
  if (!service.isSignedIn) throw new Error("Not signed in to Google Drive");
  if (!immediate) {
    service.pendingSaveData = saveData;
    if (service.saveTimeoutId) clearTimeout(service.saveTimeoutId);
    service.saveTimeoutId = setTimeout(() => {
      if (service.pendingSaveData) {
        const data = service.pendingSaveData;
        service.pendingSaveData = null;
        performSave(service, data);
      }
    }, 2000);
    return true;
  }
  return await performSave(service, saveData);
}

async function uploadLocalSave(service, saveDataString) {
  if (!service.isSignedIn) throw new Error("User is not signed in to Google Drive");
  const success = await performSave(service, saveDataString);
  if (success) {
    try {
      const localSave = deserializeSave(saveDataString);
      localSave.isCloudSynced = true;
      localSave.cloudUploadedAt = new Date().toISOString();
      await StorageAdapter.set("reactorGameSave", localSave);
    } catch (e) {
      logger.log('error', 'game', 'Failed to mark local save as synced after upload.', e);
    }
  }
  return success;
}

async function canUploadLocalSave(service) {
  if (!service.isSignedIn) return { showUpload: false };
  const localSave = await StorageAdapter.get("reactorGameSave");
  if (!localSave) return { showUpload: false };
  try {
    if (localSave.isCloudSynced) return { showUpload: false };
    const hasCloudSave = await findSaveFile(service);
    if (hasCloudSave) return { showUpload: false };
    return { showUpload: true, gameState: localSave };
  } catch {
    return { showUpload: false };
  }
}

async function offerLocalSaveUpload(service) {
  if (!service.isSignedIn) return { hasLocalSave: false };
  const gameState = await StorageAdapter.get("reactorGameSave");
  if (!gameState) return { hasLocalSave: false };
  try {
    const saveSize = `${(serializeSave(gameState).length / 1024).toFixed(1)}KB`;
    const hasCloudSave = await findSaveFile(service);
    if (hasCloudSave) return { hasLocalSave: false };
    if (gameState.isCloudSynced) {
      delete gameState.isCloudSynced;
      delete gameState.cloudUploadedAt;
      await StorageAdapter.set("reactorGameSave", gameState);
    }
    return { hasLocalSave: true, gameState, saveSize };
  } catch {
    return { hasLocalSave: false };
  }
}

async function flushPendingSave(service) {
  if (service.pendingSaveData && service.isSignedIn) {
    const dataToSave = service.pendingSaveData;
    service.pendingSaveData = null;
    if (service.saveTimeoutId) {
      clearTimeout(service.saveTimeoutId);
      service.saveTimeoutId = null;
    }
    return await performSave(service, dataToSave);
  }
  return true;
}

async function testBasicFileOperations(service) {
  if (!service.isSignedIn) return false;
  try {
    const response = await fetch("https://www.googleapis.com/drive/v3/about?fields=user", {
      headers: { Authorization: `Bearer ${service.authToken}` },
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function deleteSave(service) {
  if (!service.isSignedIn || !service.saveFileId) throw new Error("No save file to delete");
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${service.saveFileId}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${service.authToken}` } }
  );
  if (response.ok) {
    service.saveFileId = null;
    return true;
  }
  throw new Error(`Failed to delete save file: ${response.status}`);
}

export class GoogleDriveSave {
  constructor() {
    this.enabled = GOOGLE_DRIVE_CONFIG.ENABLE_GOOGLE_DRIVE;
    this.isSignedIn = false;
    this.authToken = null;
    this.userInfo = null;
    this.saveFileId = StorageUtils.get("google_drive_save_file_id") || null;
    this.lastSaveTime = 0;
    this.pendingSaveData = null;
    this.saveTimeoutId = null;
    this.config = null;
    restoreAuthToken(this);
    restoreUserInfo(this);
    if (this.enabled) this.init();
  }

  isConfigured() {
    return isConfigured(this);
  }

  async init() {
    if (!this.isConfigured()) return false;
    if (typeof navigator !== "undefined" && !navigator.onLine) return false;
    try {
      await loadGapiScripts(this);
      await checkAuth(this, true);
      return true;
    } catch {
      return false;
    }
  }

  async checkAuth(silent = true) {
    return checkAuth(this, silent);
  }

  getUserInfo() {
    return getUserInfo(this);
  }

  getUserId() {
    return getUserId(this);
  }

  async handleAuthSuccess(response) {
    return handleAuthSuccess(this, response);
  }

  async signIn() {
    return signIn(this);
  }

  signOut() {
    signOut(this);
  }

  async findSaveFile() {
    return findSaveFile(this);
  }

  async load() {
    return load(this);
  }

  async save(saveData, immediate = false) {
    return save(this, saveData, immediate);
  }

  async _performSave(saveData) {
    return performSave(this, saveData);
  }

  async uploadLocalSave(saveDataString) {
    return uploadLocalSave(this, saveDataString);
  }

  async canUploadLocalSave() {
    return canUploadLocalSave(this);
  }

  async offerLocalSaveUpload() {
    return offerLocalSaveUpload(this);
  }

  async flushPendingSave() {
    return flushPendingSave(this);
  }

  async testBasicFileOperations() {
    return testBasicFileOperations(this);
  }

  async deleteSave() {
    return deleteSave(this);
  }
}

function getStableRedirectUri() {
  if (typeof window === 'undefined' || !window.location) return '';
  const basePath = getBasePath();
  return window.location.origin + (basePath || '/');
}

export class SupabaseAuth {
  constructor() {
    this.token = null;
    this.user = null;
    this.expiresAt = 0;
    this.refreshToken = null;
    this.init();
  }

  init() {
    const session = StorageUtils.get('supabase_auth_session');
    if (session) {
      try {
        if (session.expires_at > Date.now()) {
          this.token = session.access_token;
          this.user = session.user;
          this.expiresAt = session.expires_at;
          this.refreshToken = session.refresh_token;
        } else if (session.refresh_token) {
          this.refreshToken = session.refresh_token;
          this.user = session.user;
          this.refreshAccessToken();
        } else {
          this.signOut();
        }
      } catch {
        this.signOut();
      }
    }
  }

  async refreshAccessToken() {
    if (!this.refreshToken || !getSupabaseAnonKey()) {
      return false;
    }

    try {
      const response = await fetch(`${getSupabaseUrl()}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': getSupabaseAnonKey()
        },
        body: JSON.stringify({ refresh_token: this.refreshToken })
      });

      const data = await response.json();

      if (response.ok && data.access_token) {
        this.setSession(data);
        return true;
      } else {
        this.signOut();
        return false;
      }
    } catch (error) {
      this.signOut();
      return false;
    }
  }

  async signUp(email, password) {
    try {
      if (!getSupabaseAnonKey()) {
        throw new Error('Supabase ANON_KEY is not configured');
      }

      const response = await fetch(`${getSupabaseUrl()}/auth/v1/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': getSupabaseAnonKey()
        },
        body: JSON.stringify({
          email: email,
          password: password
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error_description || data.msg || 'Sign up failed');
      }

      return { data, error: null };
    } catch (error) {
      return { data: null, error: error.message || 'Sign up failed' };
    }
  }

  async signInWithPassword(email, password) {
    try {
      if (!getSupabaseAnonKey()) {
        throw new Error('Supabase ANON_KEY is not configured');
      }

      const response = await fetch(`${getSupabaseUrl()}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': getSupabaseAnonKey()
        },
        body: JSON.stringify({
          email: email,
          password: password
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error_description || data.msg || 'Sign in failed');
      }

      this.setSession(data);
      return { data, error: null };
    } catch (error) {
      return { data: null, error: error.message || 'Sign in failed' };
    }
  }

  async resetPasswordForEmail(email) {
    try {
      if (!getSupabaseAnonKey()) {
        throw new Error('Supabase ANON_KEY is not configured');
      }

      const response = await fetch(`${getSupabaseUrl()}/auth/v1/recover`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': getSupabaseAnonKey()
        },
        body: JSON.stringify({
          email: email,
          redirect_to: `${getStableRedirectUri()}?type=recovery`
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error_description || data.msg || 'Password reset failed');
      }

      return { data, error: null };
    } catch (error) {
      return { data: null, error: error.message || 'Password reset failed' };
    }
  }

  async updatePassword(newPassword) {
    try {
      if (!this.token) {
        throw new Error('Not authenticated');
      }

      if (!getSupabaseAnonKey()) {
        throw new Error('Supabase ANON_KEY is not configured');
      }

      const response = await fetch(`${getSupabaseUrl()}/auth/v1/user`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'apikey': getSupabaseAnonKey(),
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({
          password: newPassword
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error_description || data.msg || 'Password update failed');
      }

      return { data, error: null };
    } catch (error) {
      return { data: null, error: error.message || 'Password update failed' };
    }
  }

  async handleEmailConfirmation(tokenHash, type) {
    try {
      if (!getSupabaseAnonKey()) {
        throw new Error('Supabase ANON_KEY is not configured');
      }

      const response = await fetch(`${getSupabaseUrl()}/auth/v1/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': getSupabaseAnonKey()
        },
        body: JSON.stringify({
          token_hash: tokenHash,
          type: type
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error_description || data.msg || 'Verification failed');
      }

      if (data.access_token) {
        this.setSession(data);
      }

      return { data, error: null };
    } catch (error) {
      return { data: null, error: error.message || 'Verification failed' };
    }
  }

  setSession(data) {
    this.token = data.access_token;
    this.refreshToken = data.refresh_token;
    this.user = data.user || { id: data.user_id, email: data.email };
    this.expiresAt = Date.now() + ((data.expires_in || 3600) * 1000);

    StorageUtils.set('supabase_auth_session', {
      access_token: this.token,
      refresh_token: this.refreshToken,
      user: this.user,
      expires_at: this.expiresAt
    });
  }

  signOut() {
    this.token = null;
    this.user = null;
    this.expiresAt = 0;
    this.refreshToken = null;
    StorageUtils.remove('supabase_auth_session');
  }

  isSignedIn() {
    if (this.token && this.expiresAt > Date.now()) {
      return true;
    }
    if (this.refreshToken && this.expiresAt <= Date.now()) {
      this.refreshAccessToken();
      return !!this.token && this.expiresAt > Date.now();
    }
    return false;
  }

  getUser() {
    return this.user;
  }

  getUserId() {
    return this.user ? this.user.id : null;
  }
}

const LeaderboardEntrySchema = z.object({
  user_id: z.string(),
  run_id: z.string().optional(),
  heat: z.number().optional().default(0),
  power: z.number().optional().default(0),
  money: z.number().optional().default(0),
  time: z.number().optional(),
  layout: z.string().nullable().optional(),
  timestamp: z.union([z.number(), z.string()]).optional()
}).passthrough();

const LeaderboardResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(LeaderboardEntrySchema).optional().default([])
}).passthrough();

function getLeaderboardApiUrl() {
  return 'https://reactor-revival.onrender.com';
}

export const LEADERBOARD_CONFIG = { get API_URL() { return getLeaderboardApiUrl(); } };

export class SupabaseSave {
  constructor() {
    this.apiBaseUrl = LEADERBOARD_CONFIG.API_URL;
  }

  async saveGame(slotId, saveData) {
    if (!window.supabaseAuth?.isSignedIn()) throw new Error("Not signed in");

    const userId = window.supabaseAuth.getUserId();
    const token = window.supabaseAuth.token;
    const payload = {
      user_id: userId,
      slot_id: slotId,
      save_data: serializeSave(saveData),
      timestamp: Date.now()
    };

    const response = await fetch(`${this.apiBaseUrl}/api/saves`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error("Failed to save to cloud");
    return await response.json();
  }

  async getSaves() {
    if (!window.supabaseAuth?.isSignedIn()) return [];

    const userId = window.supabaseAuth.getUserId();
    const token = window.supabaseAuth.token;
    const response = await fetch(`${this.apiBaseUrl}/api/saves/${userId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) throw new Error("Failed to fetch saves");
    const json = await response.json();
    return json.success ? json.data : [];
  }
}

export const supabaseSave = new SupabaseSave();

export class LeaderboardService {
  constructor() {
    this.initialized = false;
    this.initPromise = null;
    this.apiBaseUrl = LEADERBOARD_CONFIG.API_URL;
    this.lastSaveTime = 0;
    this.saveCooldownMs = 60000;
    this.pendingSave = null;
    this.disabled = isTestEnv();
  }

  async _performSaveRun(stats) {
    try {
      const response = await fetch(`${this.apiBaseUrl}/api/leaderboard/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: stats.user_id,
          run_id: stats.run_id,
          heat: stats.heat,
          power: stats.power,
          money: stats.money,
          time: stats.time,
          layout: stats.layout || null
        })
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        logger.log('error', 'game', 'Error saving run to leaderboard:', errorData.error || response.statusText);
      } else {
        this.lastSaveTime = Date.now();
      }
    } catch (e) {
      logger.log('error', 'game', 'Error saving run to leaderboard', e);
    } finally {
      this.pendingSave = null;
    }
  }

  async init() {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;
    if (this.disabled) {
      this.initialized = true;
      return;
    }

    this.initPromise = (async () => {
      try {
        const response = await fetch(`${this.apiBaseUrl}/health`);
        if (response.ok) {
          this.initialized = true;
        } else {
          logger.log('warn', 'game', 'Leaderboard API health check failed');
        }
      } catch (e) {
        const errorMsg = e.message || String(e);
        logger.log('debug', 'game', 'Leaderboard service unavailable:', errorMsg);
      } finally {
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  async saveRun(stats) {
    if (this.disabled) return;
    if (!this.initialized) {
      await this.init();
    }

    const now = Date.now();
    const timeSinceLastSave = now - this.lastSaveTime;

    if (timeSinceLastSave < this.saveCooldownMs) {
      return;
    }

    if (this.pendingSave) {
      return;
    }

    this.pendingSave = this._performSaveRun(stats);

    return this.pendingSave;
  }

  async getTopRuns(sortBy = 'power', limit = 10) {
    if (this.disabled) return [];
    if (!this.initialized) await this.init();

    const validSorts = ['heat', 'power', 'money', 'timestamp'];
    const safeSort = validSorts.includes(sortBy) ? sortBy : 'power';

    return queryClient.fetchQuery({
      queryKey: queryKeys.leaderboard(safeSort, limit),
      queryFn: async () => {
        try {
          const response = await fetch(
            `${this.apiBaseUrl}/api/leaderboard/top?sortBy=${safeSort}&limit=${limit}`
          );
          if (!response.ok) {
            logger.log('error', 'game', 'Error getting top runs:', response.statusText);
            return [];
          }
          const data = await response.json();
          const parsed = LeaderboardResponseSchema.safeParse(data);
          if (!parsed.success) {
            logger.log('warn', 'game', 'Invalid leaderboard data format');
            return [];
          }
          return parsed.data.success ? parsed.data.data : [];
        } catch (e) {
          logger.log('debug', 'game', 'Leaderboard fetch failed (503/CORS/network):', e?.message || e);
          return [];
        }
      },
      staleTime: 60 * 1000,
      retry: 2,
    });
  }
}

export const leaderboardService = new LeaderboardService();

const FADE_SLIGHT_MS = 15000;
const FADE_FULL_MS = 30000;
const FADE_CLASS_SLIGHT = "splash-menu-fade-slight";
const FADE_CLASS_FULL = "splash-menu-fade-full";

function scheduleFadeSteps(panel, slightTimerRef, fullTimerRef) {
  if (slightTimerRef.current) clearTimeout(slightTimerRef.current);
  if (fullTimerRef.current) clearTimeout(fullTimerRef.current);
  panel.classList.remove(FADE_CLASS_SLIGHT, FADE_CLASS_FULL);
  slightTimerRef.current = setTimeout(() => {
    panel.classList.add(FADE_CLASS_SLIGHT);
    slightTimerRef.current = null;
  }, FADE_SLIGHT_MS);
  fullTimerRef.current = setTimeout(() => {
    panel.classList.remove(FADE_CLASS_SLIGHT);
    panel.classList.add(FADE_CLASS_FULL);
    fullTimerRef.current = null;
  }, FADE_FULL_MS);
}

function bindWakeListeners(panel, slightTimerRef, fullTimerRef, handlers) {
  const wake = () => {
    scheduleFadeSteps(panel, slightTimerRef, fullTimerRef);
  };
  const events = ["click", "touchstart", "pointerdown", "pointermove", "keydown"];
  events.forEach((ev) => {
    const h = (e) => {
      if (ev === "pointermove" && e.buttons === 0) return;
      wake();
    };
    document.addEventListener(ev, h, { capture: true, passive: ev === "pointermove" });
    handlers.push({ event: ev, handler: h });
  });
}

function unbindWakeListeners(handlers) {
  handlers.forEach(({ event, handler }) => {
    document.removeEventListener(event, handler, { capture: true });
  });
  handlers.length = 0;
}

function initSplashMenuIdleFade(panelElement) {
  if (!panelElement) return () => {};
  const slightTimerRef = { current: null };
  const fullTimerRef = { current: null };
  const handlers = [];
  scheduleFadeSteps(panelElement, slightTimerRef, fullTimerRef);
  bindWakeListeners(panelElement, slightTimerRef, fullTimerRef, handlers);
  return () => {
    if (slightTimerRef.current) clearTimeout(slightTimerRef.current);
    if (fullTimerRef.current) clearTimeout(fullTimerRef.current);
    unbindWakeListeners(handlers);
    panelElement.classList.remove(FADE_CLASS_SLIGHT, FADE_CLASS_FULL);
  };
}

async function fetchVersionFromUrl(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.text();
}

function parseVersionFromResponse(text) {
  try {
    const data = JSON.parse(text);
    const parsed = VersionSchema.safeParse(data);
    return parsed.success ? parsed.data.version : "Unknown";
  } catch {
    return "Unknown";
  }
}

async function tryPrimaryVersionUrl() {
  const versionUrl = getResourceUrl("version.json");
  try {
    return await fetchVersionFromUrl(versionUrl);
  } catch (urlError) {
    logger.log("warn", "splash", "Primary URL failed, trying direct path:", urlError);
    return await fetchVersionFromUrl("/version.json");
  }
}

async function tryDirectOrAbsolutePath() {
  try {
    const directResponse = await fetch("./version.json");
    if (directResponse.ok) return parseVersionFromResponse(await directResponse.text());
  } catch (directError) {
    logger.warn("Could not load direct local version:", directError);
  }
  try {
    const absoluteResponse = await fetch("/version.json");
    if (absoluteResponse.ok) return parseVersionFromResponse(await absoluteResponse.text());
  } catch (absoluteError) {
    logger.log("warn", "splash", "Could not load absolute path version:", absoluteError);
  }
  return null;
}

async function tryLocalVersionFallback(versionChecker) {
  const localVersion = await versionChecker.getLocalVersion();
  if (localVersion) return localVersion;
  return await tryDirectOrAbsolutePath();
}

async function fetchVersionForSplash(versionChecker) {
  try {
    const responseText = await tryPrimaryVersionUrl();
    return parseVersionFromResponse(responseText);
  } catch (error) {
    logger.warn("Could not load version info:", error);
    try {
      const fallback = await tryLocalVersionFallback(versionChecker);
      return fallback ?? "Unknown";
    } catch (localError) {
      logger.log("warn", "splash", "Could not load local version:", localError);
      return "Unknown";
    }
  }
}

function mountSplashUserCountReactive(splashScreen, ui) {
  const userCountEl = splashScreen?.querySelector("#user-count-text");
  if (!userCountEl || !ui?.uiState) return;
  ReactiveLitComponent.mountMulti(
    [{ state: ui.uiState, keys: ["user_count"] }],
    () => html`${ui.uiState?.user_count ?? 0}`,
    userCountEl
  );
}

function addSplashStats(splashScreen, version, versionChecker, ui) {
  const versionText = splashScreen.querySelector("#splash-version-text");
  if (!versionText) return;
  versionText.title = "Click to check for updates";
  versionText.style.cursor = "pointer";
  versionText.onclick = () => versionChecker.triggerVersionCheckToast();
  if (ui?.uiState) {
    ReactiveLitComponent.mountMulti(
      [{ state: ui.uiState, keys: ["version"] }],
      () => html`v.${ui.uiState?.version ?? ""}`,
      versionText
    );
  } else {
    versionText.textContent = `v.${version}`;
  }
}

class SplashUIManager extends BaseComponent {
  constructor(refs) {
    super();
    this.statusElement = refs.statusElement;
    this.splashScreen = refs.splashScreen;
  }

  setRefs(refs) {
    this.statusElement = refs.statusElement;
    this.splashScreen = refs.splashScreen;
  }

  updateStatus(message) {
    if (!this.statusElement) {
      logger.log("warn", "splash", "Status element not ready, skipping update:", message);
      return;
    }
    this.statusElement.textContent = message;
    this.statusElement.classList.add("splash-element-visible");
  }

  stopFlavorText() {}

  hide(onHidden) {
    if (!this.splashScreen) return;
    this.stopFlavorText();
    this.splashScreen.classList.add("fade-out");
    setTimeout(() => {
      this.isVisible = false;
      this.setElementVisible(this.splashScreen, false);
      onHidden?.();
    }, 500);
  }

  show() {
    if (this.splashScreen) {
      this.isVisible = true;
      this.splashScreen.classList.remove("fade-out");
      this.setElementVisible(this.splashScreen, true);
    }
  }

  forceHide() {
    if (this.splashScreen) {
      this.isVisible = false;
      this.splashScreen.classList.add("fade-out");
      this.setElementVisible(this.splashScreen, false);
    }
  }
}

async function waitForSplashElement(selector, maxAttempts = 20) {
  for (let i = 0; i < maxAttempts; i++) {
    const el = document.querySelector(selector);
    if (el) return el;
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
}

async function runLoadSplashScreen(manager) {
  if (isTestEnv()) return false;
  try {
    manager.splashScreen = document.querySelector("#splash-screen") ?? await waitForSplashElement("#splash-screen");
    manager.statusElement =
      document.querySelector("#splash-status") ?? manager.splashScreen?.querySelector("#splash-status");
    if (!manager.splashScreen) throw new Error("Splash screen not found (AppRoot must render first)");
    manager.uiManager?.setRefs({ statusElement: manager.statusElement, splashScreen: manager.splashScreen });
    await manager.initializeSplashStats();
    manager.updateUserCountDisplay();
    try {
      await warmImageCache(getCriticalUiIconAssets());
      preloadAllPartImages().catch((error) =>
        logger.log("warn", "splash", "[PWA] Background part image preloading failed:", error)
      );
    } catch (e) {
      logger.log("warn", "splash", "[PWA] Failed to warm image cache:", e);
    }
    return true;
  } catch (error) {
    logger.log("error", "splash", "Error loading splash screen:", error);
    return false;
  }
}

function runSetStep(manager, stepId) {
  const stepIndex = manager.loadingSteps.findIndex((step) => step.id === stepId);
  if (stepIndex === -1) return;
  manager.currentStep = stepIndex;
  const step = manager.loadingSteps[manager.currentStep];
  if (manager.statusElement) {
    manager.statusElement.classList.remove("splash-element-hidden");
    manager.statusElement.classList.add("splash-element-visible");
    manager.statusElement.textContent = step.message;
  }
}

function runSetSubStep(manager, message) {
  if (manager.statusElement) {
    manager.statusElement.classList.remove("splash-element-hidden");
    manager.statusElement.classList.add("splash-element-visible");
    manager.statusElement.textContent = message;
  }
}

const SPLASH_HIDE_DELAY_MS = 600;

async function loadFromDataImpl(splashManager, saveData, ctx) {
  const str = typeof saveData === "string" ? saveData : serializeSave(saveData);
  await rotateSlot1ToBackupAsync(str);
  await loadFromSaveSlotImpl(splashManager, 1, ctx);
}

async function teardownSplashAndWait() {
  const saveSlotEl = document.getElementById("save-slot-screen");
  if (saveSlotEl) saveSlotEl.remove();
  if (window.splashManager) window.splashManager.hide();
  await new Promise((resolve) => setTimeout(resolve, SPLASH_HIDE_DELAY_MS));
}

async function handleBackupLoadFlow(ctx, slot) {
  if (!ctx?.game?.saveManager) return null;
  let loadSuccess = await ctx.game.saveManager.loadGame(slot);
  if (loadSuccess && typeof loadSuccess === "object" && loadSuccess.backupAvailable) {
    const useBackup = await showLoadBackupModal();
    if (!useBackup) return null;
    await setSlot1FromBackupAsync();
    loadSuccess = await ctx.game.saveManager.loadGame(1);
  }
  return loadSuccess;
}

async function startGameOrFallback(ctx) {
  if (!ctx?.game || !ctx?.ui || !ctx?.pageRouter) return;
  if (typeof window.startGame === "function") {
    await window.startGame(ctx);
    return;
  }
  logger.log("error", "splash", "startGame function not available globally");
  await ctx.pageRouter.loadGameLayout();
  ctx.ui.initMainLayout();
  await ctx.pageRouter.loadPage("reactor_section");
  ctx.game.tooltip_manager = new (await import("./components/ui_tooltips_tutorial.js")).TooltipManager(
    "#main",
    "#tooltip",
    ctx.game
  );
  ctx.game.engine = new (await import("./logic.js")).Engine(ctx.game);
  await ctx.game.startSession();
  ctx.game.engine.start();
}

async function loadFromSaveSlotImpl(splashManager, slot, ctx) {
  try {
    await teardownSplashAndWait();
    const appCtx =
      ctx ?? (splashManager._appContext || { game: window.game, ui: window.ui, pageRouter: window.pageRouter });
    if (!appCtx.game) {
      logger.log("error", "splash", "Game instance not available");
      return;
    }
    const loadSuccess = await handleBackupLoadFlow(appCtx, slot);
    if (loadSuccess !== true || !appCtx.pageRouter || !appCtx.ui) {
      logger.log("error", "splash", "Failed to load game or missing dependencies");
      return;
    }
    await startGameOrFallback(appCtx);
  } catch (error) {
    logger.log("error", "splash", "Error loading from save slot:", error);
  }
}

const GOOGLE_LABEL = "[G]";
const EMAIL_LABEL = "[M]";

const authState = proxy({
  email: "",
  password: "",
  message: "",
  isError: false,
  showEmailForm: false,
});

function showMessage(msg, isError = false) {
  authState.message = msg;
  authState.isError = isError;
}

async function refreshAuthTokens() {
  if (window.googleDriveSave) {
    await window.googleDriveSave.checkAuth(true);
  }
  if (window.supabaseAuth && window.supabaseAuth.refreshToken && !window.supabaseAuth.isSignedIn()) {
    await window.supabaseAuth.refreshAccessToken();
  }
}

async function fetchGoogleUserInfo() {
  const googleSignedIn = window.googleDriveSave && window.googleDriveSave.isSignedIn;
  let googleUserInfo = null;
  if (googleSignedIn) {
    googleUserInfo = window.googleDriveSave.getUserInfo();
    if (!googleUserInfo && window.googleDriveSave.authToken) {
      try {
        const userResponse = await fetch(
          "https://www.googleapis.com/drive/v3/about?fields=user",
          { headers: { Authorization: `Bearer ${window.googleDriveSave.authToken}` } }
        );
        if (userResponse.ok) {
          const userData = await userResponse.json();
          if (userData.user) {
            googleUserInfo = {
              id: userData.user.permissionId || userData.user.emailAddress,
              email: userData.user.emailAddress,
              name: userData.user.displayName,
              imageUrl: userData.user.photoLink,
            };
            window.googleDriveSave.userInfo = googleUserInfo;
            StorageUtils.set("google_drive_user_info", googleUserInfo);
          }
        }
      } catch (error) {
        logger.log("error", "splash", "Error fetching Google user info:", error);
      }
    }
  }
  return { googleSignedIn, googleUserInfo };
}

async function handleAuthLogout(container, splashManager, { supabaseSignedIn, googleSignedIn }) {
  if (supabaseSignedIn && window.supabaseAuth) window.supabaseAuth.signOut();
  if (googleSignedIn && window.googleDriveSave) {
    if (window.googleDriveSave.signOut) {
      await window.googleDriveSave.signOut();
    } else {
      window.googleDriveSave.isSignedIn = false;
      window.googleDriveSave.authToken = null;
      StorageUtils.remove("google_drive_auth_token");
      StorageUtils.remove("google_drive_user_info");
    }
  }
  render(html``, container);
  await splashManager.setupSupabaseAuth(container);
}

function signedInTemplate(container, splashManager, { googleSignedIn, googleUserInfo, supabaseSignedIn, supabaseUser }) {
  const authLabel = googleUserInfo ? GOOGLE_LABEL : supabaseUser ? EMAIL_LABEL : "";
  const onLogout = () => handleAuthLogout(container, splashManager, { supabaseSignedIn, googleSignedIn });
  return html`
    <div class="splash-auth-signed-in">
      ${authLabel ? html`<span class="splash-auth-signed-in-icon">${authLabel}</span>` : ""}
      <button class="splash-auth-icon-btn" title="Sign out" aria-label="Sign out" @click=${onLogout}>✕</button>
    </div>
  `;
}

async function handleGoogleSignIn(container, splashManager) {
  if (!window.googleDriveSave) return;
  try {
    await window.googleDriveSave.signIn();
    await window.googleDriveSave.checkAuth(false);
    render(html``, container);
    splashManager.setupSupabaseAuth(container);
  } catch (error) {
    logger.log("error", "splash", "Google sign-in error:", error);
  }
}

const getCredentials = () => ({ email: authState.email, password: authState.password });

async function executeSignIn(container, splashManager) {
  const { email, password } = getCredentials();
  if (!email || !password) return showMessage("Please enter email and password", true);
  showMessage("Signing in...");
  const { error } = await window.supabaseAuth.signInWithPassword(email, password);
  if (error) {
    showMessage(error, true);
  } else {
    showMessage("Signed in successfully!");
    authState.password = "";
    setTimeout(() => {
      render(html``, container);
      splashManager.setupSupabaseAuth(container);
    }, 1000);
  }
}

async function executeSignUp() {
  const { email, password } = getCredentials();
  if (!email || !password) return showMessage("Please enter email and password", true);
  if (password.length < 6) return showMessage("Password must be at least 6 characters", true);
  showMessage("Signing up...");
  const { error } = await window.supabaseAuth.signUp(email, password);
  if (error) {
    showMessage(error, true);
  } else {
    showMessage("Sign up successful! Please check your email to confirm your account.");
    authState.password = "";
  }
}

async function executeReset() {
  const { email } = getCredentials();
  if (!email) return showMessage("Please enter your email address", true);
  showMessage("Sending password reset email...");
  const { error } = await window.supabaseAuth.resetPasswordForEmail(email);
  if (error) {
    showMessage(error, true);
  } else {
    showMessage("Password reset email sent! Please check your email.");
  }
}

function CommsButton(container, splashManager) {
  return html`
    <div class="splash-auth-comms-wrap">
      <button class="splash-auth-comms-btn" title="Sign in" aria-label="Sign in options" aria-haspopup="true" aria-expanded="false">
        [ COMMS ]
      </button>
      <div class="splash-auth-comms-dropdown hidden">
        <div class="splash-auth-comms-prompt">> AWAITING OPERATOR CREDENTIALS</div>
        <button class="splash-auth-comms-option" @click=${() => handleGoogleSignIn(container, splashManager)}>
          <span class="splash-auth-comms-icon">${GOOGLE_LABEL}</span> Sign in with Google
        </button>
        <button
          class="splash-auth-comms-option"
          @click=${() => {
            authState.showEmailForm = true;
            authState.message = "";
            renderSignInForm(container, splashManager);
          }}
        >
          <span class="splash-auth-comms-icon">${EMAIL_LABEL}</span> Sign in with Email
        </button>
      </div>
    </div>
  `;
}

function AuthForm(state, handlers, onBack) {
  const { onInput, onSignIn, onSignUp, onReset } = handlers;
  const { email, password, message, isError } = state;
  const msgColor = isError ? "#ff6666" : "var(--game-success-color)";
  return html`
    <div id="splash-email-auth-form" class="splash-auth-terminal-form">
      <div class="splash-auth-terminal-prompt">> AWAITING OPERATOR CREDENTIALS</div>
      ${onBack ? html`<button class="splash-auth-back-btn" @click=${onBack} type="button">&lt; Back</button>` : ""}
      <input
        type="email"
        id="splash-supabase-email"
        placeholder="Email"
        class="pixel-input splash-auth-input"
        .value=${email}
        @input=${(e) => onInput(e, "email")}
      />
      <input
        type="password"
        id="splash-supabase-password"
        placeholder="Password"
        class="pixel-input splash-auth-input"
        .value=${password}
        @input=${(e) => onInput(e, "password")}
      />
      <div class="splash-auth-form-actions">
        <button class="splash-btn splash-auth-form-btn" @click=${onSignIn}>Sign In</button>
        <button class="splash-btn splash-auth-form-btn" @click=${onSignUp}>Sign Up</button>
        <button class="splash-btn splash-auth-form-btn" @click=${onReset}>Reset</button>
      </div>
      <div id="splash-supabase-message" class="splash-auth-message" style="color: ${msgColor}">${message}</div>
    </div>
  `;
}

function renderSignInForm(container, splashManager) {
  const onInput = (e, field) => {
    authState[field] = e.target.value;
  };
  const goBack = () => {
    authState.showEmailForm = false;
    authState.message = "";
    renderSignInForm(container, splashManager);
  };

  const handlers = {
    onInput,
    onSignIn: () => executeSignIn(container, splashManager),
    onSignUp: executeSignUp,
    onReset: executeReset,
  };

  const template = html`
    <div class="splash-auth-buttons">
      ${authState.showEmailForm ? AuthForm(authState, handlers, goBack) : CommsButton(container, splashManager)}
    </div>
  `;
  render(template, container);
  const wrap = container.querySelector(".splash-auth-comms-wrap");
  if (wrap) {
    const btn = wrap.querySelector(".splash-auth-comms-btn");
    const dropdown = wrap.querySelector(".splash-auth-comms-dropdown");
    const closeDropdown = () => {
      dropdown?.classList.add("hidden");
      btn?.setAttribute("aria-expanded", "false");
      document.removeEventListener("click", closeDropdown);
    };
    const onDocumentClick = (e) => {
      if (!wrap.contains(e.target)) closeDropdown();
    };
    btn?.addEventListener("click", (e) => {
      e.stopPropagation();
      const isHidden = dropdown?.classList.toggle("hidden");
      btn?.setAttribute("aria-expanded", isHidden ? "false" : "true");
      if (!isHidden) setTimeout(() => document.addEventListener("click", onDocumentClick), 0);
    });
  }
}

async function setupSplashAuth(container, splashManager) {
  await refreshAuthTokens();
  const { googleSignedIn, googleUserInfo } = await fetchGoogleUserInfo();
  const supabaseSignedIn = window.supabaseAuth && window.supabaseAuth.isSignedIn();
  const supabaseUser = supabaseSignedIn ? window.supabaseAuth.getUser() : null;
  const isAnySignedIn = googleSignedIn || supabaseSignedIn;

  if (isAnySignedIn) {
    render(
      signedInTemplate(container, splashManager, {
        googleSignedIn,
        googleUserInfo,
        supabaseSignedIn,
        supabaseUser,
      }),
      container
    );
  } else {
    authState.email = "";
    authState.password = "";
    authState.message = "";
    authState.isError = false;
    authState.showEmailForm = false;
    if (!container._hasValtioSub) {
      container._hasValtioSub = true;
      subscribe(authState, () => {
        if (document.body.contains(container) && !window.supabaseAuth?.isSignedIn?.()) {
          renderSignInForm(container, splashManager);
        }
      });
    }
    renderSignInForm(container, splashManager);
  }
}

async function shouldAbortDueToConflict(cloudSaveData) {
  const { maxLocalTime } = await fetchResolvedSaves();
  const cloudTime = cloudSaveData.last_save_time || 0;
  if (maxLocalTime <= 0 || cloudTime <= maxLocalTime) return false;
  const orchestrator = window.ui?.modalOrchestrator;
  const choice = orchestrator
    ? await orchestrator.showModal(MODAL_IDS.CLOUD_VS_LOCAL_CONFLICT, { cloudSaveData })
    : await showCloudVsLocalConflictModal(cloudSaveData);
  return choice === "cancel" || choice === "local";
}

function backupLocalSaveToSession(dataJSON) {
  if (dataJSON && typeof sessionStorage !== "undefined") {
    sessionStorage.setItem("reactorSaveBackupBeforeCloud", dataJSON);
    sessionStorage.setItem("reactorSaveBackupTimestamp", String(Date.now()));
  }
}

async function applyCloudSaveAndLaunch(cloudSaveData) {
  const { pageRouter, ui, game } = window;
  if (!pageRouter || !ui || !game) return;
  const validated = game.saveManager.validateSaveData(cloudSaveData);
  await game.applySaveState(validated);
  if (typeof window.startGame === "function") {
    await window.startGame({ pageRouter, ui, game });
    return;
  }
  await pageRouter.loadGameLayout();
  ui.initMainLayout();
  await pageRouter.loadPage("reactor_section");
  game.tooltip_manager = new (await import("./components/ui_tooltips_tutorial.js")).TooltipManager("#main", "#tooltip", game);
  game.engine = new (await import("./logic.js")).Engine(game);
  await game.startSession();
  game.engine.start();
}

async function handleCloudLoadClick() {
  try {
    const cloudSaveData = await window.googleDriveSave.load();
    if (!cloudSaveData) {
      logger.log("warn", "splash", "Could not find a save file in Google Drive.");
      return;
    }
    if (await shouldAbortDueToConflict(cloudSaveData)) return;
    const { dataJSON } = await fetchResolvedSaves();
    backupLocalSaveToSession(dataJSON);
    if (window.splashManager) window.splashManager.hide();
    await new Promise((resolve) => setTimeout(resolve, 600));
    await applyCloudSaveAndLaunch(cloudSaveData);
  } catch (error) {
    logger.log("error", "splash", "Failed to load from Google Drive:", error);
    logger.log("warn", "splash", `Error loading from Google Drive: ${error.message}`);
  }
}

function applyOfflineStateToButton(btn) {
  if (btn && !navigator.onLine) {
    btn.disabled = true;
    btn.title = "Requires an internet connection";
  }
}

async function renderSignedInCloudUI(cloudButtonArea) {
  try {
    await window.googleDriveSave.findSaveFile();
    const fileId = window.googleDriveSave.saveFileId;
    if (fileId) {
      render(LoadFromCloudButton(handleCloudLoadClick), cloudButtonArea);
      const btn = cloudButtonArea.firstElementChild;
      if (btn) applyOfflineStateToButton(btn);
    } else {
      render(html`<div>No cloud save found.</div>`, cloudButtonArea);
    }
  } catch (_) {
    render(html`<div>Cloud check failed.</div>`, cloudButtonArea);
  }
}

async function handleSignInClick(manager, cloudButtonArea) {
  try {
    await window.googleDriveSave.signIn();
    await updateSplashGoogleDriveUI(manager, true, cloudButtonArea);
  } catch (_) {
    const signInBtn = cloudButtonArea.querySelector("button");
    if (signInBtn) {
      const span = signInBtn.querySelector("span");
      if (span) span.textContent = "Sign in Failed";
      setTimeout(() => {
        if (span) span.textContent = "Google Sign In";
        signInBtn.disabled = false;
      }, 2000);
    }
  }
}

function renderSignedOutSignInUI(manager, cloudButtonArea) {
  const onClick = async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    const span = btn.querySelector("span");
    if (span) span.textContent = "Signing in...";
    await handleSignInClick(manager, cloudButtonArea);
  };
  render(GoogleSignInButton(onClick), cloudButtonArea);
  const btn = cloudButtonArea.firstElementChild;
  if (btn) applyOfflineStateToButton(btn);
}

async function updateSplashGoogleDriveUI(manager, isSignedIn, cloudButtonArea) {
  render(html``, cloudButtonArea);
  if (isSignedIn) {
    await renderSignedInCloudUI(cloudButtonArea);
  } else {
    renderSignedOutSignInUI(manager, cloudButtonArea);
  }
}

class SplashStartOptionsBuilder {
  constructor(splashManager, ctx = null) {
    this.splashManager = splashManager;
    this.ctx = ctx ?? (splashManager._appContext || { game: window.game, ui: window.ui, pageRouter: window.pageRouter });
  }

  async buildSaveSlotList(canLoadGame) {
    if (!canLoadGame) {
      return { hasSave: false, saveSlots: [], cloudSaveOnly: false, cloudSaveData: null, mostRecentSave: null };
    }
    return fetchResolvedSaves();
  }

  renderTo(container, state) {
    const { hasSave, saveSlots, cloudSaveOnly, cloudSaveData, mostRecentSave } = state;

    const onResume = async () => {
      try {
        if (window.splashManager) window.splashManager.hide();
        await new Promise((resolve) => setTimeout(resolve, 600));

        const game = this.ctx?.game ?? window.game;
        if (game) {
          const loadSuccess = await game.saveManager.loadGame(mostRecentSave.slot);

          const pageRouter = this.ctx?.pageRouter ?? window.pageRouter;
          const ui = this.ctx?.ui ?? window.ui;

          if (loadSuccess && pageRouter && ui) {
            if (typeof window.startGame === "function") {
              await window.startGame({ pageRouter, ui, game });
            } else {
              await pageRouter.loadGameLayout();
              ui.initMainLayout();
              await pageRouter.loadPage("reactor_section");

              game.tooltip_manager = new (await import("./components/ui_tooltips_tutorial.js")).TooltipManager(
                "#main",
                "#tooltip",
                game
              );
              game.engine = new (await import("./logic.js")).Engine(game);

              await game.startSession();
              game.engine.start();
            }
          }
        }
      } catch (error) {
        logger.log("error", "splash", "Error loading game:", error);
      }
    };

    const onCloudResume = () => {
      this.splashManager.hide();
      const btn = document.getElementById("splash-load-cloud-btn");
      if (btn) btn.click();
    };

    const onNewRun = async () => {
      if (hasSave && !confirm("Are you sure you want to start a new game? Your saved progress will be overwritten."))
        return;
      const game = this.ctx?.game ?? window.game;
      const pageRouter = this.ctx?.pageRouter ?? window.pageRouter;
      const ui = this.ctx?.ui ?? window.ui;
      try {
        if (game && typeof window.showTechTreeSelection === "function") await window.showTechTreeSelection(game, pageRouter, ui, this.splashManager);
      } catch (error) {
        logger.log("error", "game", "Error showing tech tree selection:", error);
      }
    };

    const template = html`
      ${mostRecentSave
        ? html`
            <button
              class="splash-btn splash-btn-load splash-btn-full-width splash-btn-resume-primary splash-btn-continue"
              @click=${onResume}
            >
              <div class="load-game-header"><span>RESUME</span></div>
            </button>
          `
        : ""}

      ${cloudSaveOnly && cloudSaveData && !hasSave
        ? html`
            <button
              class="splash-btn splash-btn-load splash-btn-full-width splash-btn-resume-primary splash-btn-continue"
              @click=${onCloudResume}
            >
              <div class="load-game-header"><span>RESUME</span></div>
              <div class="continue-label"></div>
            </button>
          `
        : ""}

      <div class="splash-btn-actions-grid">
        <div class="splash-btn-row-secondary">
          <button
            id="splash-new-game-btn"
            class="splash-btn splash-btn-start ${!mostRecentSave ? "splash-btn-resume-primary" : ""}"
            @click=${onNewRun}
          >
            NEW RUN
          </button>
          <button class="splash-btn splash-btn-load" @click=${() => this.splashManager.showSaveSlotSelection(saveSlots)}>
            <div class="load-game-header"><span>LOAD</span></div>
          </button>
        </div>
        <div class="splash-btn-row-tertiary">
          <button id="splash-sandbox-btn" class="splash-btn splash-btn-sandbox" title="Sandbox">SANDBOX</button>
          <button
            class="splash-btn splash-btn-config"
            title="System configuration"
            @click=${() => this.ctx?.ui?.modalOrchestrator?.showModal(MODAL_IDS.SETTINGS)}
          >
            SYS
          </button>
        </div>
      </div>

      <div id="splash-auth-in-footer" style="margin-top: 1rem;"></div>
    `;

    render(template, container);

    const authArea = container.querySelector("#splash-auth-in-footer");
    if (authArea) {
      this.splashManager.setupSupabaseAuth(authArea);
    }
  }
}

const formatSlotNumber = (n) => Format.number(n, { places: 1 });

class SplashSaveSlotUI {
  constructor(splashManager) {
    this.splashManager = splashManager;
    this.container = null;
    this.state = {
      localSaveSlots: [],
      cloudSaveSlots: [],
      isCloudAvailable: false,
      selectedSlot: null,
      selectedIsCloud: false,
      swipedSlots: new Set(),
    };
  }

  _slotTemplate(slotData, i, isCloud) {
    const isEmpty = !slotData || !slotData.exists;
    const prefix = isCloud ? "CLD" : "LOG";
    const logId = `${prefix} ${String(i).padStart(2, "0")}`;
    const swipeKey = `${isCloud ? "c" : "l"}_${i}`;
    const isSwiped = this.state.swipedSlots.has(swipeKey);
    const isSelected = this.state.selectedSlot === i && this.state.selectedIsCloud === isCloud;

    const rowClasses = classMap({
      "save-slot-row": true,
      "save-slot-row-deletable": !isCloud && !isEmpty,
      swiped: isSwiped,
    });

    const btnClasses = classMap({
      "save-slot-button": true,
      "save-slot-button-empty": isEmpty,
      "save-slot-button-filled": !isEmpty,
      selected: isSelected,
    });

    const onSlotClick = (e) => {
      e.preventDefault();
      if (isSwiped) return;

      const now = Date.now();
      const isDoubleTap = isSelected && this._lastTap && now - this._lastTap < 400;
      this._lastTap = now;

      if (isDoubleTap) {
        this._handleRestore();
      } else {
        this.state.selectedSlot = isSelected ? null : i;
        this.state.selectedIsCloud = isCloud;
        this.render();
      }
    };

    const onSwipeStart = (e) => {
      if (isCloud || isEmpty) return;
      this._swipeStartX = e.touches[0].clientX;
    };

    const onSwipeEnd = (e) => {
      if (isCloud || isEmpty) return;
      const endX = e.changedTouches[0].clientX;
      if (this._swipeStartX - endX > 80) {
        this.state.swipedSlots.add(swipeKey);
        this.render();
      } else if (endX - this._swipeStartX > 40) {
        this.state.swipedSlots.delete(swipeKey);
        this.render();
      }
    };

    const onDeleteClick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!confirm(`Delete ${logId}? This cannot be undone.`)) return;
      try {
        await StorageAdapter.remove(`reactorGameSave_${i}`);
        this.state.swipedSlots.delete(swipeKey);
        const targetSlot = this.state.localSaveSlots.find((s) => s.slot === i);
        if (targetSlot) targetSlot.exists = false;

        if (this.state.selectedSlot === i && !this.state.selectedIsCloud) {
          this.state.selectedSlot = null;
        }
        this.render();
      } catch (err) {
        logger.log("error", "splash", "Failed to delete save slot", err);
      }
    };

    return html`
      <div class=${rowClasses}>
        <div class="save-slot-swipe-wrapper" @touchstart=${onSwipeStart} @touchend=${onSwipeEnd}>
          <button
            class=${btnClasses}
            type="button"
            data-slot=${i}
            data-is-cloud=${isCloud}
            data-is-empty=${isEmpty}
            @click=${onSlotClick}
          >
            ${isEmpty
              ? html`
                  <div class="save-slot-row-top">
                    <span class="save-slot-log-id save-slot-log-id-empty">${logId}</span>
                    <span class="save-slot-right">EMPTY</span>
                  </div>
                  <div class="save-slot-row-bottom">
                    <span class="save-slot-ttime">--:--:--</span>
                  </div>
                `
              : html`
                  <span class="save-slot-tape-icon" aria-hidden="true"></span>
                  <span class="save-slot-select-arrow ${isSelected ? "visible" : ""}" aria-hidden="true">&#x25B6;</span>
                  <div class="save-slot-row-top">
                    <span class="save-slot-log-id">${logId}</span>
                  </div>
                  <div class="save-slot-row-meta">
                    <span class="save-slot-ttime">T+ ${formatPlaytimeLog(Number(slotData.totalPlayedTime))}</span>
                  </div>
                  <div class="save-slot-row-bottom">
                    <span class="save-slot-money">$${formatSlotNumber(Number(slotData.currentMoney))}</span>
                    <span class="save-slot-sep">|</span>
                    <span class="save-slot-ep">${formatSlotNumber(Number(slotData.exoticParticles))} EP</span>
                  </div>
                `}
          </button>
          ${!isCloud && !isEmpty
            ? html`<button class="save-slot-delete" type="button" aria-label="Delete" @click=${onDeleteClick}>DEL</button>`
            : ""}
        </div>
      </div>
    `;
  }

  _mainTemplate() {
    const cloudSlots = [1, 2, 3].map((i) => this.state.cloudSaveSlots.find((s) => s.slot === i));
    const localSlots = [1, 2, 3].map((i) => this.state.localSaveSlots.find((s) => s.slot === i));

    const onFileChange = async (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const saveData = event.target.result;
          const parsed = typeof saveData === "string" ? deserializeSave(saveData) : saveData;
          const result = SaveDataSchema.safeParse(parsed);
          if (!result.success) throw new Error("Save corrupted: validation failed");
          const validated = result.data;
          await rotateSlot1ToBackupAsync(serializeSave(validated));
          await this.splashManager.loadFromSaveSlot(1);
        } catch (err) {
          logger.log("error", "splash", "Failed to load save from file:", err);
          logger.log("warn", "splash", "Failed to load save file. Ensure it is a valid Reactor save.");
        }
      };
      reader.readAsText(file);
    };

    const triggerFileInput = () => {
      this.container.querySelector("#load-from-file-input")?.click();
    };

    return html`
      <header
        class="save-slot-screen-header"
        @touchstart=${(e) => {
          this._headerStartY = e.touches[0].clientY;
        }}
        @touchend=${(e) => {
          if (e.changedTouches[0].clientY - this._headerStartY > 60) this._close();
        }}
      >
        <div class="modal-swipe-handle" aria-hidden="true"></div>
        <div class="save-slot-header-row">
          <h1 class="save-slot-title">SYSTEM LOGS</h1>
          <button class="save-slot-back-btn" title="Cancel" aria-label="Cancel" @click=${() => this._close()}>&#x2715;</button>
        </div>
      </header>
      <div class="save-slot-panel">
        <div class="save-slot-options">
          ${this.state.isCloudAvailable
            ? html`
                <h2 class="save-slot-section-header">CLOUD BACKUPS</h2>
                ${cloudSlots.map((s, idx) => this._slotTemplate(s, idx + 1, true))}
                <h2 class="save-slot-section-header save-slot-section-secondary">CORE BACKUPS</h2>
              `
            : html` <h2 class="save-slot-section-header">CORE BACKUPS</h2> `}
          ${localSlots.map((s, idx) => this._slotTemplate(s, idx + 1, false))}
          <div class="save-slot-actions">
            <input
              type="file"
              id="load-from-file-input"
              accept=".json,.reactor,application/json"
              style="display:none;"
              @change=${onFileChange}
            />
            <button
              class="splash-btn splash-btn-resume-primary save-slot-restore-btn"
              ?disabled=${this.state.selectedSlot == null}
              style="opacity: ${this.state.selectedSlot != null ? 1 : 0.5}"
              @click=${() => this._handleRestore()}
            >
              RESTORE
            </button>
            <button class="save-slot-import-btn" @click=${triggerFileInput}>IMPORT BACKUP</button>
            <button class="save-slot-back-action" @click=${() => this._close()}>BACK</button>
          </div>
        </div>
      </div>
    `;
  }

  async _handleRestore() {
    if (this.state.selectedSlot == null) return;
    const prefix = this.state.selectedIsCloud ? "CLD" : "LOG";
    const logId = `${prefix} ${String(this.state.selectedSlot).padStart(2, "0")}`;
    if (!confirm(`Restore ${logId}? Current unsaved progress will be lost.`)) return;

    if (this.state.selectedIsCloud) {
      const save = this.state.cloudSaveSlots.find((s) => s.slot === this.state.selectedSlot);
      if (save) await this.splashManager.loadFromData(save.data);
    } else {
      await this.splashManager.loadFromSaveSlot(this.state.selectedSlot);
    }
  }

  _close() {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
    if (this.splashManager.splashScreen) this.splashManager.splashScreen.style.display = "";
  }

  render() {
    if (this.container) {
      render(this._mainTemplate(), this.container);
    }
  }

  async showSaveSlotSelection(localSaveSlots) {
    const sm = this.splashManager;
    if (sm.splashScreen) sm.splashScreen.style.display = "none";

    this.state = {
      localSaveSlots,
      cloudSaveSlots: [],
      isCloudAvailable: false,
      selectedSlot: null,
      selectedIsCloud: false,
      swipedSlots: new Set(),
    };

    if (window.supabaseAuth?.isSignedIn?.()) {
      try {
        this.state.cloudSaveSlots = await fetchCloudSaveSlots();
        this.state.isCloudAvailable = true;
      } catch (e) {
        logger.log("error", "splash", "Failed to load cloud saves", e);
      }
    }

    this.container = document.createElement("main");
    this.container.id = "save-slot-screen";
    this.container.className = "splash-screen";
    this.container.style.cssText = "position:fixed;inset:0;width:100%;height:100%;z-index:999;";
    document.body.appendChild(this.container);

    const allSlots = [
      ...(this.state.isCloudAvailable ? this.state.cloudSaveSlots : []),
      ...this.state.localSaveSlots,
    ];
    const firstFilled = allSlots.find((s) => s && s.exists);
    if (firstFilled) {
      this.state.selectedSlot = firstFilled.slot;
      this.state.selectedIsCloud = !!firstFilled.isCloud;
    }

    this.render();
  }
}

const LOADING_STEPS = [
  { id: "init", message: "Initializing reactor systems..." },
  { id: "ui", message: "Calibrating control panels..." },
  { id: "game", message: "Spinning up nuclear protocols..." },
  { id: "parts", message: "Installing reactor components..." },
  { id: "upgrades", message: "Analyzing technological blueprints..." },
  { id: "objectives", message: "Briefing mission parameters..." },
  { id: "engine", message: "Achieving critical mass..." },
  { id: "ready", message: "Reactor online - All systems nominal!" },
];

class SplashFlowController {
  constructor() {
    this.loadingSteps = LOADING_STEPS;
    this.currentStep = 0;
  }
  nextStep(onUpdateStatus) {
    if (this.currentStep < this.loadingSteps.length - 1) {
      this.currentStep++;
      const step = this.loadingSteps[this.currentStep];
      onUpdateStatus?.(step.message);
    }
  }
}

let flavorMessages = [];
dataService.loadFlavorText().then((messages) => {
  flavorMessages = messages;
}).catch((error) => {
  logger.log("warn", "splash", "Failed to load flavor text:", error);
  flavorMessages = ["Loading..."];
});

class SplashScreenManager extends BaseComponent {
  constructor() {
    super();
    this.splashScreen = null;
    this.statusElement = null;
    this._appContext = null;

    this.flowController = new SplashFlowController();
    this.loadingSteps = this.flowController.loadingSteps;
    this.currentStep = 0;
    this.isReady = false;
    this.errorTimeout = null;
    this.installPrompt = null;
    this.uiManager = new SplashUIManager({ statusElement: null, splashScreen: null });
    this.versionChecker = new VersionChecker(this);
    this.saveSlotUI = new SplashSaveSlotUI(this);

    if (!StorageUtils.get("reactor_user_id")) {
      StorageUtils.set("reactor_user_id", crypto.randomUUID());
    }

    this.readyPromise = isTestEnv() ? Promise.resolve(false) : this.waitForDOMAndLoad();
    this.socket = null;
    this.userCount = 0;

    if (!isTestEnv()) {
      this.initSocketConnection();
    }

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data && event.data.type === "HIDE_SPLASH") {
          this.hide();
        }
      });
    }
  }

  async initSocketConnection() {
    if (typeof navigator !== "undefined" && !navigator.onLine) return null;
    if (typeof io === "undefined") return null;
    const isLocalhost =
      typeof window !== "undefined" &&
      (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
    if (isLocalhost) return null;
    try {
      const apiUrl = LEADERBOARD_CONFIG.API_URL;
      const socket = io(apiUrl, {
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionDelay: 3000,
        reconnectionAttempts: 3,
      });
      this.socket = socket;
      socket.on("connect", () => {});
      socket.on("userCount", (count) => {
        this.userCount = count;
        this.updateUserCountDisplay();
      });
      socket.on("disconnect", () => {});
      socket.on("connect_error", (error) => {
        logger.log("debug", "splash", "Socket.IO connection error:", error);
      });
      return socket;
    } catch (error) {
      logger.log("debug", "splash", "Failed to initialize Socket.IO:", error);
      return null;
    }
  }

  updateUserCountDisplay() {
    const ui = this._appContext?.ui;
    if (ui?.uiState) ui.uiState.user_count = this.userCount;
  }

  async waitForDOMAndLoad() {
    if (document.readyState === "loading") {
      await new Promise((resolve) => {
        document.addEventListener("DOMContentLoaded", resolve, { once: true });
      });
    }
    return this.loadSplashScreen();
  }

  async loadSplashScreen() {
    return runLoadSplashScreen(this);
  }

  async initializeSplashStats() {
    if (!this.splashScreen) return;
    const version = await fetchVersionForSplash(this.versionChecker);
    const ui = this._appContext?.ui;
    if (ui?.uiState) {
      ui.uiState.version = version;
      ui.uiState.user_count = this.userCount;
    }
    addSplashStats(this.splashScreen, version, this.versionChecker, ui);
    mountSplashUserCountReactive(this.splashScreen, ui);
    this.versionChecker.startVersionChecking();
  }

  async showSaveSlotSelection(localSaveSlots) {
    await this.saveSlotUI.showSaveSlotSelection(localSaveSlots);
  }

  async loadFromData(saveData) {
    await loadFromDataImpl(this, saveData, this._appContext);
  }

  setAppContext(ctx) {
    this._appContext = ctx;
  }

  async loadFromSaveSlot(slot) {
    await loadFromSaveSlotImpl(this, slot, this._appContext);
  }

  async ensureReady() {
    if (this.readyPromise) {
      await this.readyPromise;
    }
  }

  updateStatus(message) {
    this.uiManager.setRefs({ statusElement: this.statusElement, splashScreen: this.splashScreen });
    this.uiManager.updateStatus(message);
  }

  stopFlavorText() {
    this.uiManager.stopFlavorText();
  }

  nextStep() {
    this.flowController.nextStep((msg) => this.updateStatus(msg));
    this.currentStep = this.flowController.currentStep;
  }

  async setStep(stepId) {
    await this.ensureReady();
    runSetStep(this, stepId);
  }

  async setSubStep(message) {
    await this.ensureReady();
    runSetSubStep(this, message);
  }

  async showStartOptions(canLoadGame = true) {
    await this.ensureReady();
    if (!this.splashScreen || this.isReady) return;

    this.stopFlavorText();
    const spinner = this.splashScreen?.querySelector(".splash-spinner");
    if (spinner) spinner.classList.add("splash-element-hidden");
    if (this.statusElement) this.statusElement.classList.add("splash-element-hidden");

    let startOptionsSection = this.splashScreen?.querySelector(".splash-start-options");
    if (!startOptionsSection) {
      startOptionsSection = document.createElement("div");
      startOptionsSection.id = "splash-start-options";
      startOptionsSection.className = "splash-start-options";
      const inner = this.splashScreen.querySelector(".splash-menu-inner");
      (inner ?? this.splashScreen.querySelector(".splash-menu-panel"))?.appendChild(startOptionsSection);
    }

    const builder = new SplashStartOptionsBuilder(this, this._appContext);
    const state = await builder.buildSaveSlotList(canLoadGame);
    builder.renderTo(startOptionsSection, state);

    startOptionsSection.classList.add("visible");
    setTimeout(() => startOptionsSection.classList.add("show"), 100);

    this.teardownIdleFade?.();
    const panel = this.splashScreen?.querySelector(".splash-menu-panel");
    if (panel) this.teardownIdleFade = initSplashMenuIdleFade(panel);
  }

  async setupSupabaseAuth(container) {
    return setupSplashAuth(container, this);
  }

  async setupGoogleDriveButtons(cloudButtonArea) {
    if (!window.googleDriveSave) {
      logger.warn("GoogleDriveSave not initialized.");
      return;
    }
    if (!window.googleDriveSave.isConfigured()) {
      render(html``, cloudButtonArea);
      return;
    }
    if (!navigator.onLine) {
      render(GoogleSignInButton(() => {}), cloudButtonArea);
      const btn = cloudButtonArea.firstElementChild;
      if (btn) {
        btn.disabled = true;
        btn.title = "Requires an internet connection";
      }
      return;
    }
    render(
      html`
        <button class="splash-btn splash-btn-google" disabled>
          <div class="loading-container">
            <div class="loading-spinner"></div>
            <span class="loading-text">Checking ...</span>
          </div>
        </button>
      `,
      cloudButtonArea
    );
    try {
      const initialized = await window.googleDriveSave.init();
      if (!initialized) {
        render(html``, cloudButtonArea);
        return;
      }
      const isSignedIn = await window.googleDriveSave.checkAuth(true);
      await this.updateGoogleDriveUI(isSignedIn, cloudButtonArea);
    } catch (error) {
      logger.log("error", "splash", "Failed to setup Google Drive buttons:", error);
      render(html`<div>Google Drive Error</div>`, cloudButtonArea);
    }
  }

  async updateGoogleDriveUI(isSignedIn, cloudButtonArea) {
    await updateSplashGoogleDriveUI(this, isSignedIn, cloudButtonArea);
  }

  hide() {
    if (!this.splashScreen || this.isReady) return;
    this.isReady = true;
    this.teardownIdleFade?.();
    this.teardownIdleFade = null;
    this.stopFlavorText();
    if (this.versionCheckInterval) {
      clearInterval(this.versionCheckInterval);
      this.versionCheckInterval = null;
    }
    if (this.errorTimeout) {
      clearTimeout(this.errorTimeout);
      this.errorTimeout = null;
    }
    this.uiManager.setRefs({ statusElement: this.statusElement, splashScreen: this.splashScreen });
    this.uiManager.hide(() => {
      if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: "SPLASH_HIDDEN" });
      }
    });
  }

  show() {
    if (this.splashScreen) {
      this.uiManager.setRefs({ statusElement: this.statusElement, splashScreen: this.splashScreen });
      this.uiManager.show();
      this.isReady = false;
    }
  }

  showError(message, autoHide = true) {
    this.updateStatus(`Error: ${message}`);
    if (autoHide) {
      this.errorTimeout = setTimeout(() => {
        this.hide();
      }, 3000);
    }
  }

  forceHide() {
    if (this.splashScreen) {
      this.isReady = true;
      this.uiManager.forceHide();
      if (this.errorTimeout) {
        clearTimeout(this.errorTimeout);
        this.errorTimeout = null;
      }
    }
  }

  showCloudSaveLoading(loadFromCloudButton) {
    if (!loadFromCloudButton) return;
    loadFromCloudButton.classList.add("visible", "cloud-loading");
    const loadingButton = createLoadingButton("Checking...");
    loadFromCloudButton.innerHTML = loadingButton.innerHTML;
    loadFromCloudButton.disabled = true;
  }

  hideCloudSaveLoading(loadFromCloudButton) {
    if (!loadFromCloudButton) return;
    loadFromCloudButton.classList.remove("cloud-loading");
    loadFromCloudButton.disabled = false;
  }

  showGoogleDriveInitializing(signInButton, loadFromCloudButton) {
    if (signInButton) {
      signInButton.classList.add("visible", "google-loading");
      const loadingButton = createLoadingButton("Initializing...");
      signInButton.innerHTML = loadingButton.innerHTML;
      signInButton.disabled = true;
    }
    if (loadFromCloudButton) {
      loadFromCloudButton.classList.remove("visible");
    }
  }

  hideGoogleDriveInitializing(signInButton, loadFromCloudButton) {
    if (signInButton) {
      signInButton.classList.remove("google-loading");
      signInButton.disabled = false;
      const newButton = createGoogleSignInButtonWithIcon();
      signInButton.innerHTML = newButton.innerHTML;
    }
  }

  async refreshSaveOptions() {
    await this.showStartOptions(!!(await StorageAdapter.getRaw("reactorGameSave")));
  }
}

export function getFlavorMessages() {
  return flavorMessages;
}

export function createSplashManager() {
  return new SplashScreenManager();
}

export { SplashScreenManager };