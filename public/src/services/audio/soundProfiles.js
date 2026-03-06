import { AUDIO_SPECS } from "./audioConfig.js";

const PU = AUDIO_SPECS.purge;
const O = AUDIO_SPECS.objective;
const SV = AUDIO_SPECS.save;
const F = AUDIO_SPECS.flux;
const OH = AUDIO_SPECS.overheat;

export const EFFECT_PROFILES = {
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

export const EVENT_TO_EFFECTS = {
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
