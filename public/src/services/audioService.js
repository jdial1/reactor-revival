import { StorageUtils, getResourceUrl, isTestEnv } from "../utils/util.js";
import { logger } from "../utils/logger.js";
import { loadSampleBuffers } from "./audio/audioBufferLoader.js";
import { AudioAmbienceManager } from "./audio/audioAmbienceManager.js";
import { AudioWarningManager } from "./audio/audioWarningManager.js";
import { AudioIndustrialManager } from "./audio/audioIndustrialManager.js";
import { AudioSynthesizer } from "./audio/audioSynthesizer.js";
import { handleAudioEvent } from "./audio/eventAudioRouter.js";
import { AUDIO_RUNTIME_DEFAULTS } from "./audio/audioConfig.js";

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
  const savedMasterVol = Number(StorageUtils.get("reactor_volume_master", AUDIO_RUNTIME_DEFAULTS.defaultMasterVolume));
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
  if (StorageUtils.get("reactor_mute") === true) {
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
  const savedMasterVol = Number(StorageUtils.get("reactor_volume_master", AUDIO_RUNTIME_DEFAULTS.defaultMasterVolume));
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
  const savedMasterVol = Number(StorageUtils.get("reactor_volume_master", AUDIO_RUNTIME_DEFAULTS.defaultMasterVolume));
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
  const masterVol = Number(StorageUtils.get("reactor_volume_master", AUDIO_RUNTIME_DEFAULTS.defaultMasterVolume));
  const effectsVol = Number(StorageUtils.get("reactor_volume_effects", AUDIO_RUNTIME_DEFAULTS.defaultEffectsVolume));
  const alertsVol = Number(StorageUtils.get("reactor_volume_alerts", AUDIO_RUNTIME_DEFAULTS.defaultAlertsVolume));
  const systemVol = Number(StorageUtils.get("reactor_volume_system", AUDIO_RUNTIME_DEFAULTS.defaultSystemVolume));
  const ambienceVol = Number(StorageUtils.get("reactor_volume_ambience", AUDIO_RUNTIME_DEFAULTS.defaultAmbienceVolume) ?? AUDIO_RUNTIME_DEFAULTS.defaultAmbienceVolume);
  if (this.masterGain) this.masterGain.gain.value = masterVol;
  if (this.effectsGain) this.effectsGain.gain.value = effectsVol;
  if (this.alertsGain) this.alertsGain.gain.value = alertsVol;
  if (this.systemGain) this.systemGain.gain.value = systemVol;
  if (this.ambienceGain) this.ambienceGain.gain.value = ambienceVol;
  }
  setVolume(category, value) {
  if (!this._isInitialized) return;
  const clampedValue = Math.max(0, Math.min(1, value));
  StorageUtils.set(`reactor_volume_${category}`, clampedValue);
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
    StorageUtils.set("reactor_mute", muted);
    if (this.masterGain) {
      const targetVol = this.enabled ? Number(StorageUtils.get("reactor_volume_master", AUDIO_RUNTIME_DEFAULTS.defaultMutedMasterVolume)) : 0;
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
