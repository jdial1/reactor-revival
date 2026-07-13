import { fromError } from "zod-validation-error";
import { z } from "zod";
import {
  PartDefinitionSchema,
  UpgradeDefinitionSchema,
  TechTreeSchema,
  ObjectiveListSchema,
  AchievementListSchema,
  DifficultyPresetSchema,
  HelpTextSchema,
} from "./schema/index.js";
import { getVolumePreferences, preferences } from "./state/preferences.js";
import { logger } from "./core/logger.js";
import { isTestEnv } from "./simUtils.js";
import { runWithConcurrencyLimit } from "./layout/reactor-codec.js";
import { getResourceUrl } from "./dom/lit.js";
import { bundledGameData } from "./bundledStaticData.js";
import {
  ensureAudioNodes,
  getAmbienceBuffers,
  getAudioContext,
  getIndustrialBuffers,
  getServiceAudioContext,
  getUiBuffers,
  registerAudioService,
  resolveAudioService,
  setAmbienceBuffers,
  setServiceAudioContext,
  setUiBuffers,
} from "./audio-runtime.js";
import { AudioWarningManager } from "./audio-warning-manager.js";
import { AudioIndustrialManager } from "./audio-industrial-manager.js";

export { AudioWarningManager } from "./audio-warning-manager.js";
export { AudioIndustrialManager } from "./audio-industrial-manager.js";
export { resolveAudioService } from "./audio-runtime.js";

let _validatedGameData;
export function getValidatedGameData() {
  if (!_validatedGameData) {
    try {
      _validatedGameData = {
        parts: z.array(PartDefinitionSchema).parse(bundledGameData.parts),
        upgrades: z.array(UpgradeDefinitionSchema).parse(bundledGameData.upgrades),
        techTree: TechTreeSchema.parse(bundledGameData.techTree),
        objectives: ObjectiveListSchema.parse(bundledGameData.objectives),
        achievements: AchievementListSchema.parse(bundledGameData.achievements),
        difficulty: z.record(z.string(), DifficultyPresetSchema).parse(bundledGameData.difficulty),
        helpText: HelpTextSchema.parse(bundledGameData.helpText),
        flavorText: z.array(z.string()).parse(bundledGameData.flavorText),
      };
    } catch (err) {
      const msg = `Bundled game data invalid: ${fromError(err)}`;
      logger.log("error", "data", msg);
      throw new Error(msg);
    }
  }
  return _validatedGameData;
}

const dataService = {
  async ensureAllGameDataLoaded() {
    console.log("[ReactorBoot] game data (bundled) validated");
    return getValidatedGameData();
  },
  async loadFlavorText() {
    return getValidatedGameData().flavorText;
  },
  async loadHelpText() {
    return getValidatedGameData().helpText;
  },
  async loadObjectiveList() {
    return getValidatedGameData().objectives;
  },
  async loadPartList() {
    return getValidatedGameData().parts;
  },
  async loadUpgradeList() {
    return getValidatedGameData().upgrades;
  },
  async loadTechTree() {
    return getValidatedGameData().techTree;
  },
  async loadDifficultyCurves() {
    return getValidatedGameData().difficulty;
  },
  clearCache() {},
  getCachedData() {
    return getValidatedGameData();
  },
};

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


const EVENT_TO_EFFECTS = {
  click: { sampleKey: "click", duckAmbience: true },
  error: { sampleKey: "error" },
  tab_switch: { sampleKey: "tab_switch", sampleFallback: "click" },
  tab_relay_thud: { sampleKey: "tab_switch" },
  ui_hover: { sampleKey: "click" },
  crt_whine: { sampleKey: "click", duckAmbience: true },
  sell: { sampleKey: "sell", sampleFallback: "click", duckAmbience: true },
  placement: {
    sampleMap: { cell: "placement_cell", plating: "placement_plating", vent: "placement", default: "placement" },
  },
  purge: { sampleKey: "click" },
  upgrade: { sampleKey: "upgrade" },
  reboot: { sampleKey: "reboot" },
  objective: { sampleKey: "click" },
  save: { sampleKey: "click" },
  explosion: {
    sampleKey: "explosion",
    meltdownSampleKey: "meltdown",
    throttle: true,
  },
  flux: { sampleKey: "click" },
  component_overheat: { sampleKey: "error" },
  depletion: { sampleKey: "depletion" },
  metal_clank: { industrialMetalClank: true },
};

const SENSORY_MAP = {
  1: { sampleKey: "explosion", category: "alerts" }, // SENSORY_BITMASK.EXPLOSION
  2: { sampleKey: "meltdown", category: "alerts" },  // SENSORY_BITMASK.MELTDOWN
  4: { sampleKey: "depletion", category: "effects" },// SENSORY_BITMASK.DEPLETION
  8: { sampleKey: "sell", category: "effects", duckAmbience: true },
};

export function handleAudioEvent(svc, eventType, context, options = {}) {
  const config = EVENT_TO_EFFECTS[eventType];
  if (!config) return;
  const merged = { ...context, ...options };
  if (config.duckAmbience) svc._duckAmbience();
  if (config.industrialMetalClank) {
    const g = typeof merged.param === "number" ? merged.param : 0.8;
    svc._playIndustrialSample("metal_clank", merged.category, merged.pan, g);
    return;
  }
  if (config.throttle) {
    const isMeltdown = merged.subtype === "meltdown" || merged.param === "meltdown";
    if (!isMeltdown && merged.now - svc._lastExplosionTime < svc._config.explosionInterval) return;
    svc._lastExplosionTime = merged.now;
    if (isMeltdown && config.meltdownSampleKey) {
      const fallbackBuf = getUiBuffers(svc)?.[config.meltdownSampleKey];
      if (fallbackBuf) svc._playSample(config.meltdownSampleKey, merged.category, merged.pan);
    }
  }
  const sampleKey = config.sampleMap?.[merged.subtype] ?? config.sampleMap?.default ?? config.sampleKey;
  if (!sampleKey) return;
  const buf = getUiBuffers(svc)?.[sampleKey];
  if (buf) {
    svc._playSample(sampleKey, merged.category, merged.pan);
  } else if (config.sampleFallback) {
    const fallbackBuf = getUiBuffers(svc)?.[config.sampleFallback];
    if (fallbackBuf) svc._playSample(config.sampleFallback, merged.category, merged.pan);
  }
}

export function processSensoryMask(svc, mask, ambience = null) {
  if (!mask || !svc.enabled) return;
  for (const bit in SENSORY_MAP) {
    if (mask & Number(bit)) {
      const config = SENSORY_MAP[bit];
      if (config.duckAmbience) svc._duckAmbience();
      if (config.sampleKey) {
        const buf = getUiBuffers(svc)?.[config.sampleKey];
        if (buf) svc._playSample(config.sampleKey, config.category, 0);
      }
    }
  }
  if (ambience && svc.ambienceManager) {
    const heat =
      typeof ambience.currentHeat?.toNumber === "function"
        ? ambience.currentHeat.toNumber()
        : Number(ambience.currentHeat) || 0;
    const maxHeat =
      typeof ambience.maxHeat?.toNumber === "function"
        ? ambience.maxHeat.toNumber()
        : Number(ambience.maxHeat) || 0;
    svc.ambienceManager.updateAmbienceHeat(heat, maxHeat);
  }
}

const AUDIO_LOAD_CONCURRENCY = 6;

async function loadUrlMapInto(svc, urlMap, target) {
  const tasks = Object.entries(urlMap).map(([key, url]) => async () => {
    try {
      const r = await fetch(url);
      const ab = await r.arrayBuffer();
      target[key] = await getAudioContext(svc)?.decodeAudioData(ab);
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
        return await getAudioContext(svc)?.decodeAudioData(ab);
      } catch (e) {
        logger.log('warn', 'audio', 'Ambience load failed', url, e);
        return null;
      }
    })
  );
  return results.map((p) => (p.status === 'fulfilled' ? p.value : null));
}

function shouldRestartAmbience(svc) {
  const ambienceBuffers = getAmbienceBuffers(svc) ?? [];
  return ambienceBuffers.length >= 3 && ambienceBuffers.every(Boolean) &&
    svc.enabled && svc.ambienceGain?.gain.value > 0 && svc.ambienceManager.hasActiveAmbience();
}

export async function loadSampleBuffers(svc) {
  if (!getAudioContext(svc) || isTestEnv()) return;
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
    reboot: base + 'reboot.mp3',
    ep_spark: base + 'ep_spark.mp3',
  };
  const industrialUrls = { metal_clank: base + 'metal_clank.mp3', steam_hiss: base + 'steam_hiss.mp3' };
  const uiBuffers = getUiBuffers(svc);
  const industrialBuffers = getIndustrialBuffers(svc);
  const ambienceBuffers = getAmbienceBuffers(svc);
  const [, , ambienceResults] = await Promise.all([
    uiBuffers ? loadUrlMapInto(svc, uiUrls, uiBuffers) : Promise.resolve(),
    industrialBuffers ? loadUrlMapInto(svc, industrialUrls, industrialBuffers) : Promise.resolve(),
    loadAmbienceLayers(svc, base),
  ]);
  if (ambienceBuffers) ambienceBuffers.push(...ambienceResults);
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
    const ctx = getAudioContext(this.svc);
    if (!this._ambienceLayerGains.length || !ctx) return;
    const heatRatio = maxHeat > 0 ? Math.max(0, Math.min(1, currentHeat / maxHeat)) : 0;
    this._ambienceHeatRatio = heatRatio;
    const [l1, l2, l3] = this._ambienceLayerWeights(heatRatio);
    const t = ctx.currentTime;
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
    const ctx = getAudioContext(this.svc);
    if (!this.svc.enabled || !ctx || this._ambienceNodes.length > 0) return;
    const t = ctx.currentTime;
    const dest = this.svc.ambienceGain || this.svc.masterGain;
    const ambienceBuffers = getAmbienceBuffers(this.svc) ?? [];
    const useLayers = ambienceBuffers.length >= 3 &&
      ambienceBuffers[0] && ambienceBuffers[1] && ambienceBuffers[2];
    if (!useLayers) return;
    this._ambienceFilter = ctx.createBiquadFilter();
    this._ambienceFilter.type = 'lowpass';
    this._ambienceFilter.frequency.value = 100;
    this._ambienceFilter.Q.value = 1;
    this._ambienceFilter.connect(dest);
    const [l1, l2, l3] = this._ambienceLayerWeights(this._ambienceHeatRatio);
    for (let i = 0; i < 3; i++) {
      const src = ctx.createBufferSource();
      src.buffer = ambienceBuffers[i];
      src.loop = true;
      const gain = ctx.createGain();
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

export class AudioService {
  constructor() {
  registerAudioService(this);
  this._contextStore = null;
  this.enabled = true;
  this._isInitialized = false;
  this._lastWarningTime = 0;
  this._lastExplosionTime = 0;
  this._config = {
  warningInterval: AUDIO_RUNTIME_DEFAULTS.warningIntervalMs,
  explosionInterval: AUDIO_RUNTIME_DEFAULTS.explosionIntervalMs
  };
  this._testLoopInterval = null;
  this._testSoundType = null;
  this._hasUnlocked = false;
  this._pendingAmbience = false;
  this.ambienceManager = new AudioAmbienceManager(this);
  this.warningManager = new AudioWarningManager(this);
  this.industrialManager = new AudioIndustrialManager(this);
  this._soundLimiter = {
  windowMs: AUDIO_RUNTIME_DEFAULTS.limiterWindowMs,
  lastWindowStart: 0,
  counts: new Map(),
  globalCap: AUDIO_RUNTIME_DEFAULTS.limiterGlobalCap,
  perSoundCap: AUDIO_RUNTIME_DEFAULTS.limiterPerSoundCap
  };
  this._activeLimiter = null;
  ensureAudioNodes(this);
  }

  get masterGain() {
    return ensureAudioNodes(this).masterGain ?? null;
  }
  set masterGain(value) {
    ensureAudioNodes(this).masterGain = value;
  }
  get effectsGain() {
    return ensureAudioNodes(this).effectsGain ?? null;
  }
  set effectsGain(value) {
    ensureAudioNodes(this).effectsGain = value;
  }
  get alertsGain() {
    return ensureAudioNodes(this).alertsGain ?? null;
  }
  set alertsGain(value) {
    ensureAudioNodes(this).alertsGain = value;
  }
  get systemGain() {
    return ensureAudioNodes(this).systemGain ?? null;
  }
  set systemGain(value) {
    ensureAudioNodes(this).systemGain = value;
  }
  get ambienceGain() {
    return ensureAudioNodes(this).ambienceGain ?? null;
  }
  set ambienceGain(value) {
    ensureAudioNodes(this).ambienceGain = value;
  }
  get _ambienceDuckGain() {
    return ensureAudioNodes(this).ambienceDuckGain ?? null;
  }
  set _ambienceDuckGain(value) {
    ensureAudioNodes(this).ambienceDuckGain = value;
  }
  get _researchEpHum() {
    return ensureAudioNodes(this).researchEpHum ?? null;
  }
  set _researchEpHum(value) {
    ensureAudioNodes(this).researchEpHum = value;
  }

  get context() {
    return getServiceAudioContext(this);
  }

  get _uiBuffers() {
    return getUiBuffers(this);
  }

  set _uiBuffers(value) {
    setUiBuffers(this, value);
  }

  get _ambienceBuffers() {
    return getAmbienceBuffers(this) ?? [];
  }

  set _ambienceBuffers(value) {
    setAmbienceBuffers(this, value);
  }

  set context(value) {
    setServiceAudioContext(this, value);
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
  const ctx = getAudioContext(this);
  if (!this._ambienceDuckGain || !ctx) return;
  try {
    if (ctx.state !== "running") return;
  } catch {
    return;
  }
  const t = ctx.currentTime;
  this._ambienceDuckGain.gain.setValueAtTime(this._ambienceDuckGain.gain.value, t);
  this._ambienceDuckGain.gain.linearRampToValueAtTime(0.55, t + 0.03);
  this._ambienceDuckGain.gain.linearRampToValueAtTime(1, t + 0.12);
  }
  async _loadSampleBuffers() {
    await loadSampleBuffers(this);
  }
  _playSample(type, category, pan) {
  const buffer = getUiBuffers(this)?.[type];
  const ctx = getAudioContext(this);
  if (!buffer || !ctx) return;
  try {
    if (ctx.state !== "running") return;
  } catch {
    return;
  }
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
  _playIndustrialSample(key, category, pan, gain) {
  const buffer = getIndustrialBuffers(this)?.[key];
  const ctx = getAudioContext(this);
  if (!buffer || !ctx) return;
  try {
    if (ctx.state !== "running") return;
  } catch {
    return;
  }
  const t = ctx.currentTime;
  const categoryGain = this._getCategoryGain(category);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const cents = (Math.random() * 10 - 5) / 1200;
  src.playbackRate.value = Math.pow(2, cents);
  const gainNode = ctx.createGain();
  gainNode.gain.value = typeof gain === "number" ? Math.min(1, Math.max(0, gain)) : 0.8;
  src.connect(gainNode);
  let dest = categoryGain;
  if (pan !== null && pan !== undefined && ctx.createStereoPanner) {
  const panner = ctx.createStereoPanner();
  panner.pan.value = Math.max(-1, Math.min(1, pan));
  panner.connect(dest);
  dest = panner;
  }
  gainNode.connect(dest);
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
  const ctx = getAudioContext(this);
  if (!ctx) return;
  this.masterGain = ctx.createGain();
  const volPrefs = getVolumePreferences();
  const savedMasterVol = volPrefs.master ?? AUDIO_RUNTIME_DEFAULTS.defaultMasterVolume;
  const isContextSuspended = ctx.state === 'suspended';
  if (isContextSuspended) {
  this.masterGain.gain.value = 0;
  } else {
  this.masterGain.gain.value = savedMasterVol;
  this._hasUnlocked = true;
  }
  this.masterGain.connect(ctx.destination);
  this.effectsGain = ctx.createGain();
  this.alertsGain = ctx.createGain();
  this.systemGain = ctx.createGain();
  this.ambienceGain = ctx.createGain();
  this._ambienceDuckGain = ctx.createGain();
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
  const unlockCtx = getAudioContext(this);
  if (!this._hasUnlocked && unlockCtx) {
  const wasSuspended = unlockCtx.state === 'suspended';
  if (wasSuspended) {
  await unlockCtx.resume();
  }
  this._hasUnlocked = true;
  const volPrefs = getVolumePreferences();
  const savedMasterVol = volPrefs.master ?? AUDIO_RUNTIME_DEFAULTS.defaultMasterVolume;
  const t = unlockCtx.currentTime;
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
  const visCtx = getAudioContext(this);
  if (!this._isInitialized || !visCtx) return;
  if (document.hidden) {
  visCtx.suspend();
  } else {
  visCtx.resume().then(() => {
  if (this._hasUnlocked && !document.hidden) {
  const volPrefs = getVolumePreferences();
  const savedMasterVol = volPrefs.master ?? AUDIO_RUNTIME_DEFAULTS.defaultMasterVolume;
  const currentVol = this.masterGain.gain.value;
  if (currentVol < savedMasterVol * 0.1) {
  const t = visCtx.currentTime;
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
  const ctx = getAudioContext(this);
  if (!this.enabled || !ctx) return;
  try {
    if (ctx.state !== "running") return;
  } catch {
    return;
  }
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
      const ctx = getAudioContext(this);
      if (ctx) {
        const targetVol = this.enabled ? (getVolumePreferences().master ?? AUDIO_RUNTIME_DEFAULTS.defaultMutedMasterVolume) : 0;
        this.masterGain.gain.setTargetAtTime(targetVol, ctx.currentTime, 0.1);
      }
    }
    if (this.enabled) {
      this.ambienceManager.startAmbience();
      if (this.warningManager.isWarningLoopActive()) {
        this.warningManager._startGeigerTicks(this.warningManager.getWarningIntensity());
      }
    } else {
      this.ambienceManager.stopAmbience();
      this.warningManager.stopWarningLoop();
      this.stopResearchEpHum();
    }
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
    const ctx = getAudioContext(this);
    if (!this.enabled || !ctx) return;
    try {
      if (ctx.state !== "running") return;
    } catch {
      return;
    }
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
      if (eventId === "warning") {
        this.warningManager._playWarningSoundAt(intensity, t);
        return;
      }
      handleAudioEvent(this, eventId, context, mergedOptions);
    } finally {
      if (limiterNode) this._activeLimiter = null;
    }
  }

  play(type, param = null, pan = null) {
    this.trigger(type, { param, pan });
  }

  syncResearchEpHum(game) {
    const ctx = getAudioContext(this);
    if (!this.enabled || !ctx) return;
    try {
      if (ctx.state !== "running") return;
    } catch {
      return;
    }
    const ep = game?.state?.current_exotic_particles;
    const n = typeof ep?.toNumber === "function" ? ep.toNumber() : Number(ep) || 0;
    const buf = getUiBuffers(this)?.ep_spark;
    if (n <= 0 || !buf) {
      this.stopResearchEpHum();
      return;
    }
    const targetGain = Math.min(0.055, 0.0015 + Math.log1p(Math.max(0, n)) * 0.0035);
    const t = ctx.currentTime;
    const dest = this._getCategoryGain("effects");
    if (!this._researchEpHum) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(g);
      g.connect(dest);
      src.start(t);
      this._researchEpHum = { source: src, gain: g };
    }
    this._researchEpHum.gain.gain.linearRampToValueAtTime(targetGain, t + 0.05);
  }

  stopResearchEpHum() {
    if (!this._researchEpHum) {
      this._researchEpHum = null;
      return;
    }
    const ctx = getAudioContext(this);
    if (!ctx) {
      this._researchEpHum = null;
      return;
    }
    const { source, gain } = this._researchEpHum;
    const t = ctx.currentTime;
    try {
      gain.gain.linearRampToValueAtTime(0.0001, t + 0.08);
      source.stop(t + 0.1);
    } catch (_) {}
    this._researchEpHum = null;
  }
}
