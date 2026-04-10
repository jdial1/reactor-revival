import { fromError } from "zod-validation-error";
import { z } from "zod";
import { QueryClient } from "@tanstack/query-core";
import { html, render } from "lit-html";
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
  showLoadBackupModal,
} from "./state.js";
import { LeaderboardEntrySchema, LeaderboardResponseSchema } from "../schema/index.js";
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
  runCathodeScramble,
  rotateSlot1ToBackupAsync,
  BaseComponent,
  LEADERBOARD_CONFIG,
} from "./utils.js";
import {
  splashStartOptionsTemplate,
  saveSlotRowTemplate,
  saveSlotMainTemplate,
  updateNotificationModalTemplate,
  updateToastTemplate as updateToastTemplateView,
  versionCheckToastTemplate,
} from "./templates/servicesTemplates.js";
import { MODAL_IDS } from "./components/ui-modals.js";
import { ReactiveLitComponent } from "./components/reactive-lit-component.js";

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
};

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

function handleTabRelayThud(svc, opts) {
  const config = EVENT_TO_EFFECTS.tab_relay_thud;
  trySample(svc, config.sampleKey, opts.category, opts.pan);
}

function handleUiHover(svc, opts) {
  const config = EVENT_TO_EFFECTS.ui_hover;
  trySample(svc, config.sampleKey, opts.category, opts.pan);
}

function handleCrtWhine(svc, opts) {
  const config = EVENT_TO_EFFECTS.crt_whine;
  if (config.duckAmbience) svc._duckAmbience();
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
  trySample(svc, config.sampleKey, opts.category, opts.pan);
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
  trySample(svc, config.sampleKey, opts.category, opts.pan);
}

function handleSave(svc, opts) {
  const config = EVENT_TO_EFFECTS.save;
  trySample(svc, config.sampleKey, opts.category, opts.pan);
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
  trySample(svc, config.sampleKey, opts.category, opts.pan);
}

function handleComponentOverheat(svc, opts) {
  const config = EVENT_TO_EFFECTS.component_overheat;
  trySample(svc, config.sampleKey, opts.category, opts.pan);
}

function handleDepletion(svc, opts) {
  const config = EVENT_TO_EFFECTS.depletion;
  trySample(svc, config.sampleKey, opts.category, opts.pan);
}

function handleWarning(svc, opts) {
  const intensity = opts.intensity ?? 0.5;
  svc.warningManager.startWarningLoop(intensity);
}

function handleMetalClank(svc, opts) {
  const g = typeof opts.param === "number" ? opts.param : 0.8;
  svc._playIndustrialSample("metal_clank", opts.category, opts.pan, g);
}

const EVENT_HANDLERS = {
  click: handleClick,
  error: handleError,
  tab_switch: handleTabSwitch,
  tab_relay_thud: handleTabRelayThud,
  ui_hover: handleUiHover,
  crt_whine: handleCrtWhine,
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
  metal_clank: handleMetalClank,
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
    reboot: base + 'reboot.mp3',
    ep_spark: base + 'ep_spark.mp3',
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
    shaper.curve = this.svc._makeDistortionCurve(800);
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

export class AudioService {
  constructor() {
  this.context = null;
  this.enabled = true;
  this.masterGain = null;
  this._isInitialized = false;
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
  this._soundLimiter = {
  windowMs: AUDIO_RUNTIME_DEFAULTS.limiterWindowMs,
  lastWindowStart: 0,
  counts: new Map(),
  globalCap: AUDIO_RUNTIME_DEFAULTS.limiterGlobalCap,
  perSoundCap: AUDIO_RUNTIME_DEFAULTS.limiterPerSoundCap
  };
  this._activeLimiter = null;
  this._uiBuffers = { click: null, placement: null, placement_cell: null, placement_plating: null, upgrade: null, error: null, sell: null, tab_switch: null, ep_spark: null };
  this._industrialBuffers = { metal_clank: null, steam_hiss: null };
  this._ambienceBuffers = [];
  this._ambienceDuckGain = null;
  this._researchEpHum = null;
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
  _playIndustrialSample(key, category, pan, gain) {
  const buffer = this._industrialBuffers[key];
  if (!buffer || !this.context || this.context.state !== "running") return;
  const ctx = this.context;
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

  syncResearchEpHum(game) {
    if (!this.enabled || !this.context || this.context.state !== "running") return;
    const ep = game?.state?.current_exotic_particles;
    const n = typeof ep?.toNumber === "function" ? ep.toNumber() : Number(ep) || 0;
    const buf = this._uiBuffers?.ep_spark;
    if (n <= 0 || !buf) {
      this.stopResearchEpHum();
      return;
    }
    const targetGain = Math.min(0.055, 0.0015 + Math.log1p(Math.max(0, n)) * 0.0035);
    const ctx = this.context;
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
    if (!this._researchEpHum || !this.context) {
      this._researchEpHum = null;
      return;
    }
    const { source, gain } = this._researchEpHum;
    const t = this.context.currentTime;
    try {
      gain.gain.linearRampToValueAtTime(0.0001, t + 0.08);
      source.stop(t + 0.1);
    } catch (_) {}
    this._researchEpHum = null;
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
    render(
      updateNotificationModalTemplate(
        escapeHtml(currentVersion),
        escapeHtml(newVersion),
        () => window.location.reload(),
        onDismiss
      ),
      modal
    );

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
    render(updateToastTemplateView(onRefresh, onClose), toast);

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
    render(versionCheckToastTemplate(borderColor, icon, message, onClose), toast);

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
    'img/parts/vents/vent_1.png',
    'img/parts/valves/valve_1_1.png',
    'img/parts/valves/valve_2_1.png',
    'img/parts/valves/valve_3_1.png',
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
  ctx.game.tooltip_manager = new (await import("./components/ui-tooltips-tutorial.js")).TooltipManager(
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
    const { hasSave, saveSlots, mostRecentSave } = state;

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

              game.tooltip_manager = new (await import("./components/ui-tooltips-tutorial.js")).TooltipManager(
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

    const template = splashStartOptionsTemplate({
      mostRecentSave,
      hasSave,
      onResume,
      onNewRun,
      onShowLoad: () => this.splashManager.showSaveSlotSelection(saveSlots),
      onShowSettings: () => this.ctx?.ui?.modalOrchestrator?.showModal(MODAL_IDS.SETTINGS),
    });

    render(template, container);
  }
}

const formatSlotNumber = (n) => Format.number(n, { places: 1 });

class SplashSaveSlotUI {
  constructor(splashManager) {
    this.splashManager = splashManager;
    this.container = null;
    this.state = {
      localSaveSlots: [],
      selectedSlot: null,
      swipedSlots: new Set(),
    };
  }

  _slotTemplate(slotData, i) {
    const isEmpty = !slotData || !slotData.exists;
    const logId = `LOG ${String(i).padStart(2, "0")}`;
    const swipeKey = `l_${i}`;
    const isSwiped = this.state.swipedSlots.has(swipeKey);
    const isSelected = this.state.selectedSlot === i;

    const rowClasses = classMap({
      "save-slot-row": true,
      "save-slot-row-deletable": !isEmpty,
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
        this.render();
      }
    };

    const onSwipeStart = (e) => {
      if (isEmpty) return;
      this._swipeStartX = e.touches[0].clientX;
    };

    const onSwipeEnd = (e) => {
      if (isEmpty) return;
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

        if (this.state.selectedSlot === i) {
          this.state.selectedSlot = null;
        }
        this.render();
      } catch (err) {
        logger.log("error", "splash", "Failed to delete save slot", err);
      }
    };

    return saveSlotRowTemplate({
      rowClasses,
      btnClasses,
      i,
      isCloud: false,
      isEmpty,
      logId,
      isSelected,
      slotData,
      onSwipeStart,
      onSwipeEnd,
      onSlotClick,
      onDeleteClick,
      formatPlaytimeLog,
      formatSlotNumber,
    });
  }

  _mainTemplate() {
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

    return saveSlotMainTemplate({
      isCloudAvailable: false,
      cloudSlots: [],
      localSlots,
      selectedSlot: this.state.selectedSlot,
      onHeaderTouchStart: (e) => {
        this._headerStartY = e.touches[0].clientY;
      },
      onHeaderTouchEnd: (e) => {
        if (e.changedTouches[0].clientY - this._headerStartY > 60) this._close();
      },
      onClose: () => this._close(),
      onFileChange,
      onRestore: () => this._handleRestore(),
      onImportBackup: triggerFileInput,
      renderSlot: (slot, idx) => this._slotTemplate(slot, idx),
    });
  }

  async _handleRestore() {
    if (this.state.selectedSlot == null) return;
    const logId = `LOG ${String(this.state.selectedSlot).padStart(2, "0")}`;
    if (!confirm(`Restore ${logId}? Current unsaved progress will be lost.`)) return;
    await this.splashManager.loadFromSaveSlot(this.state.selectedSlot);
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
      selectedSlot: null,
      swipedSlots: new Set(),
    };

    this.container = document.createElement("main");
    this.container.id = "save-slot-screen";
    this.container.className = "splash-screen";
    this.container.style.cssText = "position:fixed;inset:0;width:100%;height:100%;z-index:999;";
    document.body.appendChild(this.container);

    const firstFilled = this.state.localSaveSlots.find((s) => s && s.exists);
    if (firstFilled) {
      this.state.selectedSlot = firstFilled.slot;
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
      StorageUtils.set("reactor_user_id", "local_architect");
    }

    this.readyPromise = isTestEnv() ? Promise.resolve(false) : this.waitForDOMAndLoad();
    this.socket = null;
    this.userCount = 0;
    this._signalJumpEnabled = false;
    this._signalJumpLoopTimeout = null;
    this._signalJumpResetTimeout = null;
    this._vholdBootTimeout = null;
    this._resumeGlowHandlers = [];

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

    const splashScreen = this.splashScreen;
    splashScreen.classList.remove("splash-vhold-booting");
    void splashScreen.offsetHeight;
    splashScreen.classList.add("splash-vhold-booting");
    if (this._vholdBootTimeout) clearTimeout(this._vholdBootTimeout);
    this._vholdBootTimeout = setTimeout(() => splashScreen.classList.remove("splash-vhold-booting"), 900);
    const audio = this._appContext?.game?.audio ?? window.game?.audio;
    audio?.play?.("crt_whine");

    const versionEl = splashScreen.querySelector("#splash-version-text");
    const userCountEl = splashScreen.querySelector("#user-count-text");
    runCathodeScramble(versionEl, versionEl?.textContent ?? "", { durationMs: 200 });
    runCathodeScramble(userCountEl, userCountEl?.textContent ?? "", { durationMs: 220 });

    this._signalJumpEnabled = false;
    if (this._signalJumpLoopTimeout) clearTimeout(this._signalJumpLoopTimeout);
    if (this._signalJumpResetTimeout) clearTimeout(this._signalJumpResetTimeout);
    this._signalJumpLoopTimeout = null;
    this._signalJumpResetTimeout = null;
    const panelEl = splashScreen.querySelector(".splash-menu-panel");
    panelEl?.classList.remove("splash-signal-jump");

    this._signalJumpEnabled = true;
    const jumpOnce = () => {
      if (!this._signalJumpEnabled) return;
      const panel = splashScreen.querySelector(".splash-menu-panel");
      if (panel) {
        const amp = 2 + Math.random();
        const dir = Math.random() < 0.5 ? -1 : 1;
        panel.style.setProperty("--splash-jump-y", `${dir * amp}px`);
        panel.classList.remove("splash-signal-jump");
        void panel.offsetHeight;
        panel.classList.add("splash-signal-jump");
        if (this._signalJumpResetTimeout) clearTimeout(this._signalJumpResetTimeout);
        this._signalJumpResetTimeout = setTimeout(() => panel.classList.remove("splash-signal-jump"), 230);
      }
      const nextDelayMs = 1200 + Math.random() * 2600;
      this._signalJumpLoopTimeout = setTimeout(jumpOnce, nextDelayMs);
    };
    const initialDelayMs = 1100 + Math.random() * 1500;
    this._signalJumpLoopTimeout = setTimeout(jumpOnce, initialDelayMs);

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

    this._resumeGlowHandlers.forEach(({ el, onEnter, onLeave }) => {
      el.removeEventListener("pointerenter", onEnter);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("focus", onEnter);
      el.removeEventListener("blur", onLeave);
    });
    this._resumeGlowHandlers.length = 0;
    const splashRoot = splashScreen;
    const active = new Set();
    const updateGlow = () => {
      if (active.size > 0) splashRoot.classList.add("splash-bezel-glow-hot");
      else splashRoot.classList.remove("splash-bezel-glow-hot");
    };
    const resumeButtons = splashRoot?.querySelectorAll(".splash-btn-resume-primary") ?? [];
    const onEnter = (e) => {
      active.add(e.currentTarget);
      updateGlow();
    };
    const onLeave = (e) => {
      active.delete(e.currentTarget);
      updateGlow();
    };
    resumeButtons.forEach((btn) => {
      btn.addEventListener("pointerenter", onEnter);
      btn.addEventListener("pointerleave", onLeave);
      btn.addEventListener("focus", onEnter);
      btn.addEventListener("blur", onLeave);
      if (btn.matches(":hover")) active.add(btn);
      this._resumeGlowHandlers.push({ el: btn, onEnter, onLeave });
    });
    updateGlow();

    startOptionsSection.classList.add("visible");
    setTimeout(() => startOptionsSection.classList.add("show"), 100);

    this.teardownIdleFade?.();
    const panel = this.splashScreen?.querySelector(".splash-menu-panel");
    if (panel) this.teardownIdleFade = initSplashMenuIdleFade(panel);
  }

  hide() {
    if (!this.splashScreen || this.isReady) return;
    this.isReady = true;

    this._signalJumpEnabled = false;
    if (this._signalJumpLoopTimeout) clearTimeout(this._signalJumpLoopTimeout);
    if (this._signalJumpResetTimeout) clearTimeout(this._signalJumpResetTimeout);
    this._signalJumpLoopTimeout = null;
    this._signalJumpResetTimeout = null;
    if (this._vholdBootTimeout) clearTimeout(this._vholdBootTimeout);
    this._vholdBootTimeout = null;
    this.splashScreen.classList.remove("splash-vhold-booting");
    this.splashScreen?.querySelector(".splash-menu-panel")?.classList.remove("splash-signal-jump");
    this.splashScreen.classList.remove("splash-bezel-glow-hot");
    this._resumeGlowHandlers.forEach(({ el, onEnter, onLeave }) => {
      el.removeEventListener("pointerenter", onEnter);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("focus", onEnter);
      el.removeEventListener("blur", onLeave);
    });
    this._resumeGlowHandlers.length = 0;

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