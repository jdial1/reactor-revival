import { safeGetItem, safeSetItem, getResourceUrl, isTestEnv } from "../utils/util.js";

export class AudioService {
  constructor() {
  this.context = null;
  this.enabled = true;
  this.masterGain = null;
  this._isInitialized = false;
  this._noiseBuffer = null;
  this._distortionCurve = null;
  this._ambienceNodes = [];
  this._lastWarningTime = 0;
  this._lastExplosionTime = 0;
  this._config = {
  warningInterval: 1000,
  explosionInterval: 100
  };
  this.effectsGain = null;
  this.alertsGain = null;
  this.systemGain = null;
  this.ambienceGain = null;
  this._testLoopInterval = null;
  this._testSoundType = null;
  this._warningLoopActive = false;
  this._warningIntensity = 0.5;
  this._warningRefillTimeout = null;
  this._geigerActive = false;
  this._geigerRefillTimeout = null;
  this._geigerNextTime = 0;
  this._hasUnlocked = false;
  this._pendingAmbience = false;
  this._soundLimiter = {
  windowMs: 60,
  lastWindowStart: 0,
  counts: new Map(),
  globalCap: 24,
  perSoundCap: 3
  };
  this._activeLimiter = null;
  this._uiBuffers = { click: null, placement: null, placement_cell: null, placement_plating: null, upgrade: null, error: null, sell: null, tab_switch: null };
  this._industrialBuffers = { metal_clank: null, steam_hiss: null };
  this._industrialAmbienceTimeout = null;
  this._industrialAmbienceVentCount = 0;
  this._industrialAmbienceExchangerCount = 0;
  this._ambienceBuffers = [];
  this._ambienceLayerGains = [];
  this._ambienceFilter = null;
  this._ambienceHeatRatio = 0;
  this._ambienceDuckGain = null;
  }
  _duckAmbience() {
  if (!this._ambienceDuckGain || !this.context || this.context.state !== 'running') return;
  const t = this.context.currentTime;
  this._ambienceDuckGain.gain.setValueAtTime(this._ambienceDuckGain.gain.value, t);
  this._ambienceDuckGain.gain.linearRampToValueAtTime(0.55, t + 0.03);
  this._ambienceDuckGain.gain.linearRampToValueAtTime(1, t + 0.12);
  }
  async _loadSampleBuffers() {
  if (!this.context || isTestEnv()) return;
  const base = getResourceUrl('audio/');
  const uiUrls = {
    click: base + 'ui_click.mp3',
    placement: base + 'placement.mp3',
    placement_cell: base + 'placement_cell.mp3',
    placement_plating: base + 'placement_plating.mp3',
    upgrade: base + 'upgrade.mp3',
    error: base + 'error.mp3',
    sell: base + 'sell.mp3',
    tab_switch: base + 'tab_switch.mp3'
  };
  for (const [key, url] of Object.entries(uiUrls)) {
  try {
  const r = await fetch(url);
  const ab = await r.arrayBuffer();
  this._uiBuffers[key] = await this.context.decodeAudioData(ab);
  } catch (e) {
  console.warn('Audio load failed', url, e);
  }
  }
  const industrialUrls = { metal_clank: base + 'metal_clank.mp3', steam_hiss: base + 'steam_hiss.mp3' };
  for (const [key, url] of Object.entries(industrialUrls)) {
  try {
  const r = await fetch(url);
  const ab = await r.arrayBuffer();
  this._industrialBuffers[key] = await this.context.decodeAudioData(ab);
  } catch (e) {
  console.warn('Industrial audio load failed', url, e);
  }
  }
  const layerUrls = [base + 'ambience_low.mp3', base + 'ambience_medium.mp3', base + 'ambience_high.mp3'];
  for (const url of layerUrls) {
  try {
  const r = await fetch(url);
  const ab = await r.arrayBuffer();
  this._ambienceBuffers.push(await this.context.decodeAudioData(ab));
  } catch (e) {
  console.warn('Ambience load failed', url, e);
  this._ambienceBuffers.push(null);
  }
  }
  if (this._ambienceBuffers.length >= 3 && this._ambienceBuffers.every(Boolean) &&
  this.enabled && this.ambienceGain?.gain.value > 0 && this._ambienceNodes.length > 0) {
  this.stopAmbience();
  this.startAmbience();
  }
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
  console.warn('Web Audio API not supported');
  return;
  }
  this.context = new AudioContext();
  this.masterGain = this.context.createGain();
  const savedMasterVol = parseFloat(safeGetItem("reactor_volume_master", "0.25"));
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
  if (safeGetItem("reactor_mute") === "true") {
  this.toggleMute(true);
  } else if (!isContextSuspended) {
  this.startAmbience();
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
  const savedMasterVol = parseFloat(safeGetItem("reactor_volume_master", "0.25"));
  const t = this.context.currentTime;
  const currentVol = this.masterGain.gain.value;
  if (wasSuspended || currentVol < 0.001) {
  this.masterGain.gain.setValueAtTime(0, t);
  this.masterGain.gain.linearRampToValueAtTime(savedMasterVol, t + 1.5);
  }
  if (this._pendingAmbience) {
  this._pendingAmbience = false;
  this.startAmbience();
  }
  if (this._warningLoopActive) {
  this._startGeigerTicks(this._warningIntensity);
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
  const savedMasterVol = parseFloat(safeGetItem("reactor_volume_master", "0.25"));
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
  console.warn('Audio init failed', e);
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
  const masterVol = parseFloat(safeGetItem("reactor_volume_master", "0.25"));
  const effectsVol = parseFloat(safeGetItem("reactor_volume_effects", "0.50"));
  const alertsVol = parseFloat(safeGetItem("reactor_volume_alerts", "0.50"));
  const systemVol = parseFloat(safeGetItem("reactor_volume_system", "0.50"));
  const ambienceVol = parseFloat(safeGetItem("reactor_volume_ambience", "0.12") || "0.12");
  if (this.masterGain) this.masterGain.gain.value = masterVol;
  if (this.effectsGain) this.effectsGain.gain.value = effectsVol;
  if (this.alertsGain) this.alertsGain.gain.value = alertsVol;
  if (this.systemGain) this.systemGain.gain.value = systemVol;
  if (this.ambienceGain) this.ambienceGain.gain.value = ambienceVol;
  }
  setVolume(category, value) {
  if (!this._isInitialized) return;
  const clampedValue = Math.max(0, Math.min(1, value));
  safeSetItem(`reactor_volume_${category}`, clampedValue.toString());
  switch (category) {
  case 'master':
  if (this.masterGain) this.masterGain.gain.value = clampedValue;
  if (clampedValue === 0) {
  this.stopTestSound();
  this.stopWarningLoop();
  this.stopAmbience();
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
  this.stopWarningLoop();
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
  this.stopAmbience();
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
  _scheduleWarningBatch() {
  if (!this._warningLoopActive || !this.context || this.context.state !== 'running') return;
  const ctx = this.context;
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
  this._warningNextScheduleTime = this.context ? this.context.currentTime : 0;
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
  if (!this.enabled || !this.context || this.context.state !== 'running') return;
  const ctx = this.context;
  const t = startTime;
  const category = 'alerts';
  const categoryGain = this._getCategoryGain(category);
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
  if (!this._geigerActive || !this.context || this.context.state !== 'running') return;
  const ctx = this.context;
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
  if (this._geigerActive || !this.enabled || !this.context) return;
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
  if (!this.enabled || !this.context || this.context.state !== 'running') return;
  const ctx = this.context;
  const t = startTime;
  const category = 'alerts';
  const categoryGain = this._getCategoryGain(category);
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
  shaper.curve = this._distortionCurve || this._makeDistortionCurve(800);
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
  _playWarningSound(intensity = 0.5) {
  if (!this.context) return;
  this._playWarningSoundAt(intensity, this.context.currentTime);
  }
  toggleMute(muted) {
  if (!this._isInitialized) return;
  this.enabled = !muted;
  safeSetItem("reactor_mute", muted ? "true" : "false");
  if (this.masterGain) {
  const targetVol = this.enabled ? (parseFloat(safeGetItem("reactor_volume_master", "0.12"))) : 0;
  this.masterGain.gain.setTargetAtTime(targetVol, this.context.currentTime, 0.1);
  }
  if (this.enabled) {
  this.startAmbience();
  if (this._warningLoopActive) {
  this._startGeigerTicks(this._warningIntensity);
  }
  } else {
  this.stopAmbience();
  this.stopWarningLoop();
  }
  }
  _ambienceLayerWeights(heatRatio) {
  const r = Math.max(0, Math.min(1, heatRatio));
  const l1 = r <= 0.3 ? 1 : Math.max(0, (0.5 - r) / 0.2);
  const l2 = r < 0.3 ? 0 : (r > 0.7 ? Math.max(0, (1 - r) / 0.3) : 1);
  const l3 = r < 0.7 ? 0 : Math.min(1, (r - 0.7) / 0.3);
  return [l1, l2, l3];
  }
  updateAmbienceHeat(currentHeat, maxHeat) {
  if (!this._ambienceLayerGains.length || !this.context) return;
  const heatRatio = maxHeat > 0 ? Math.max(0, Math.min(1, currentHeat / maxHeat)) : 0;
  this._ambienceHeatRatio = heatRatio;
  const [l1, l2, l3] = this._ambienceLayerWeights(heatRatio);
  const t = this.context.currentTime;
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
  if (!this.enabled || !this.context || this._ambienceNodes.length > 0) return;
  const t = this.context.currentTime;
  const dest = this.ambienceGain || this.masterGain;
  const useLayers = this._ambienceBuffers.length >= 3 &&
  this._ambienceBuffers[0] && this._ambienceBuffers[1] && this._ambienceBuffers[2];
  if (useLayers) {
  this._ambienceFilter = this.context.createBiquadFilter();
  this._ambienceFilter.type = 'lowpass';
  this._ambienceFilter.frequency.value = 100;
  this._ambienceFilter.Q.value = 1;
  this._ambienceFilter.connect(dest);
  const [l1, l2, l3] = this._ambienceLayerWeights(this._ambienceHeatRatio);
  for (let i = 0; i < 3; i++) {
  const src = this.context.createBufferSource();
  src.buffer = this._ambienceBuffers[i];
  src.loop = true;
  const gain = this.context.createGain();
  gain.gain.value = [l1, l2, l3][i];
  src.connect(gain);
  gain.connect(this._ambienceFilter);
  src.start(t);
  this._ambienceLayerGains.push(gain);
  this._ambienceNodes.push(src, gain);
  }
  this._ambienceNodes.push(this._ambienceFilter);
  return;
  }
  const globalLFO = this.context.createOscillator();
  globalLFO.frequency.value = 0.15;
  const globalLFOGain = this.context.createGain();
  globalLFOGain.gain.value = 0.1;
  globalLFO.connect(globalLFOGain);
  const humOsc1 = this.context.createOscillator();
  const humOsc2 = this.context.createOscillator();
  humOsc1.type = 'sawtooth';
  humOsc2.type = 'square';
  humOsc1.frequency.value = 50;
  humOsc2.frequency.value = 50.35;
  const humShaper = this.context.createWaveShaper();
  humShaper.curve = this._distortionCurve || this._makeDistortionCurve(400);
  const humFilter = this.context.createBiquadFilter();
  humFilter.type = 'lowpass';
  humFilter.frequency.value = 280;
  humFilter.Q.value = 4;
  const humGain = this.context.createGain();
  humGain.gain.value = 0.25;
  humOsc1.connect(humShaper);
  humOsc2.connect(humShaper);
  humShaper.connect(humFilter);
  humFilter.connect(humGain);
  humGain.connect(dest);
  globalLFOGain.connect(humGain.gain);
  const subOsc = this.context.createOscillator();
  subOsc.type = 'sine';
  subOsc.frequency.value = 32;
  const subGain = this.context.createGain();
  subGain.gain.value = 0.3;
  subOsc.connect(subGain);
  subGain.connect(dest);
  if (this._noiseBuffer) {
  const pumpSrc = this.context.createBufferSource();
  pumpSrc.buffer = this._noiseBuffer;
  pumpSrc.loop = true;
  const pumpFilter = this.context.createBiquadFilter();
  pumpFilter.type = 'lowpass';
  pumpFilter.frequency.value = 120;
  pumpFilter.Q.value = 2;
  const pumpGain = this.context.createGain();
  pumpGain.gain.value = 0;
  const pumpLFO1 = this.context.createOscillator();
  pumpLFO1.frequency.value = 0.8;
  const pumpLFO2 = this.context.createOscillator();
  pumpLFO2.frequency.value = 0.67;
  const lfoMixGain = this.context.createGain();
  lfoMixGain.gain.value = 0.3;
  pumpLFO1.connect(lfoMixGain);
  pumpLFO2.connect(lfoMixGain);
  lfoMixGain.connect(pumpGain.gain);
  pumpSrc.connect(pumpFilter);
  pumpFilter.connect(pumpGain);
  pumpGain.connect(dest);
  pumpSrc.start(t);
  pumpLFO1.start(t);
  pumpLFO2.start(t);
  this._ambienceNodes.push(pumpSrc, pumpFilter, pumpGain, pumpLFO1, pumpLFO2, lfoMixGain);
  }
  if (this._noiseBuffer) {
  const rattleSrc = this.context.createBufferSource();
  rattleSrc.buffer = this._noiseBuffer;
  rattleSrc.loop = true;
  const rattleFilter = this.context.createBiquadFilter();
  rattleFilter.type = 'bandpass';
  rattleFilter.frequency.value = 220;
  rattleFilter.Q.value = 15;
  const rattleGain = this.context.createGain();
  rattleGain.gain.value = 0;
  const vibrationLFO = this.context.createOscillator();
  vibrationLFO.type = 'triangle';
  vibrationLFO.frequency.value = 25;
  const driftLFO = this.context.createOscillator();
  driftLFO.frequency.value = 0.1;
  const driftGain = this.context.createGain();
  driftGain.gain.value = 0.04;
  vibrationLFO.connect(rattleGain.gain);
  driftLFO.connect(driftGain);
  driftGain.connect(rattleGain.gain);
  rattleSrc.connect(rattleFilter);
  rattleFilter.connect(rattleGain);
  rattleGain.connect(dest);
  rattleSrc.start(t);
  vibrationLFO.start(t);
  driftLFO.start(t);
  this._ambienceNodes.push(rattleSrc, rattleFilter, rattleGain, vibrationLFO, driftLFO, driftGain);
  }
  humOsc1.start(t);
  humOsc2.start(t);
  subOsc.start(t);
  globalLFO.start(t);
  this._ambienceNodes.push(
  globalLFO, globalLFOGain,
  humOsc1, humOsc2, humShaper, humFilter, humGain,
  subOsc, subGain
  );
  }
  stopAmbience() {
  this._ambienceNodes.forEach(node => {
  try {
  if (typeof node.stop === 'function') {
  node.stop();
  }
  } catch (e) { }
  try {
  node.disconnect?.();
  } catch (e) { }
  });
  this._ambienceNodes = [];
  this._ambienceLayerGains = [];
  this._ambienceFilter = null;
  this.stopIndustrialAmbience();
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
  const buffer = this._industrialBuffers[key];
  if (!buffer || !this.context || this.context.state !== 'running' || !this.enabled || !this.ambienceGain) return;
  const ctx = this.context;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = 0.85 + Math.random() * 0.3;
  const gain = ctx.createGain();
  const ambienceLevel = this.ambienceGain.gain.value;
  gain.gain.value = ambienceLevel * 0.3;
  src.connect(gain);
  let dest = this.ambienceGain;
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
  _osc(startTime, type, freq, volume, duration, options = {}) {
  if (!this.context) return null;
  const osc = this.context.createOscillator();
  const gain = this.context.createGain();
  let source = osc;
  if (options.randomPitch) {
  const variation = typeof options.randomPitch === 'number' ? options.randomPitch : 0.05;
  freq *= (1 - variation) + Math.random() * (variation * 2);
  }
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);
  if (options.freqEnd) {
  osc.frequency.exponentialRampToValueAtTime(options.freqEnd, startTime + duration);
  }
  if (options.dist) {
  const shaper = this.context.createWaveShaper();
  shaper.curve = this._distortionCurve || this._makeDistortionCurve(400);
  osc.connect(shaper);
  source = shaper;
  }
  source.connect(gain);
  let dest = this._getCategoryGain(options.category);
  if (options.pan !== undefined && options.pan !== null && this.context.createStereoPanner) {
  const panner = this.context.createStereoPanner();
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
  _noise(startTime, volume, duration, options = {}) {
  if (!this._noiseBuffer || !this.context) return null;
  const src = this.context.createBufferSource();
  src.buffer = this._noiseBuffer;
  const gain = this.context.createGain();
  let node = src;
  let filter = null;
  if (options.type || options.freq || options.freqEnd || options.Q) {
  filter = this.context.createBiquadFilter();
  filter.type = options.type || 'highpass';
  const freq = options.freq ?? 1000;
  filter.frequency.setValueAtTime(freq, startTime);
  if (options.freqEnd) {
  const rampFn = options.linearFreq ? 'linearRampToValueAtTime' : 'exponentialRampToValueAtTime';
  filter.frequency[rampFn](options.freqEnd, startTime + duration);
  }
  if (options.Q) {
  filter.Q.value = options.Q;
  }
  node.connect(filter);
  node = filter;
  }
  node.connect(gain);
  let dest = this._getCategoryGain(options.category);
  if (options.pan !== undefined && options.pan !== null && this.context.createStereoPanner) {
  const panner = this.context.createStereoPanner();
  panner.pan.value = Math.max(-1, Math.min(1, options.pan));
  panner.connect(dest);
  dest = panner;
  }
  gain.connect(dest);
  const available = Math.max(this._noiseBuffer.duration - duration, 0);
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
  _lfo(startTime, frequency, depth, target, duration) {
  if (!this.context || !target) return null;
  const lfo = this.context.createOscillator();
  const gain = this.context.createGain();
  lfo.frequency.value = frequency;
  gain.gain.value = depth;
  lfo.connect(gain);
  gain.connect(target);
  lfo.start(startTime);
  lfo.stop(startTime + duration);
  return { osc: lfo, gain };
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
  play(type, param = null, pan = null) {
  if (!this.enabled || !this.context || this.context.state !== 'running') {
    return;
  }
  const ctx = this.context;
  const now = Date.now();
  const t = ctx.currentTime;
  const subtype = typeof param === 'string' ? param : 'generic';
  const intensity = typeof param === 'number' ? Math.min(Math.max(param, 0), 1) : 0.5;
  const category = this._getSoundCategory(type);
  let categoryGain = this._getCategoryGain(category);
  const limiterScale = this._getLimiterScale(type, subtype, now);
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
  try {
  switch (type) {
  case 'placement': {
  const placementType = subtype === 'cell' ? 'placement_cell' : subtype === 'plating' ? 'placement_plating' : 'placement';
  if (this._uiBuffers[placementType]) {
  this._playSample(placementType, category, pan);
  break;
  }
  const basePitch = 140;
  const thud = this._osc(t, 'triangle', basePitch, 0, 0.25, { freqEnd: 40, volEnd: 0.01, ...spatialOpts });
  thud?.gain.gain.linearRampToValueAtTime(0.5, t + 0.02);
  this._osc(t, 'square', 800, 0.15, 0.05, { ...spatialOpts });
  if (subtype === 'cell') {
  this._osc(t, 'sawtooth', 55, 0.15, 0.3, { freqEnd: 45, volEnd: 0, ...spatialOpts });
  } else if (subtype === 'plating') {
  thud?.gain.gain.setValueAtTime(0.7, t + 0.02);
  this._osc(t, 'sine', 1200, 0.1, 0.4, { ...spatialOpts });
  } else if (subtype === 'vent') {
  thud?.gain.gain.linearRampToValueAtTime(0.3, t + 0.02);
  this._noise(t, 0.25, 0.3, { ...spatialOpts });
  }
  break;
  }
  case 'sell': {
  this._duckAmbience();
  if (this._uiBuffers.sell) {
  this._playSample('sell', category, pan);
  break;
  }
  if (this._uiBuffers.click) {
  this._playSample('click', category, pan);
  break;
  }
  this._osc(t, 'sine', 400, 0.15, 0.08, { freqEnd: 200, volEnd: 0, ...spatialOpts });
  break;
  }
  case 'purge': {
  this._osc(t, 'sawtooth', 1200, 0.1, 0.15, { freqEnd: 600, volEnd: 0, category });
  this._noise(t, 0.25, 0.6, { type: 'highpass', freq: 1000, category });
  const boil = this._noise(t, 0.15, 0.5, { type: 'bandpass', freq: 400, Q: 8, volEnd: 0, category });
  if (boil?.filter) {
  this._lfo(t, 12, 300, boil.filter.frequency, 0.5);
  }
  break;
  }
  case 'upgrade': {
  if (this._uiBuffers.upgrade) {
  this._playSample('upgrade', category, null);
  break;
  }
  const wrench = this._noise(t, 0, 0.3, { type: 'bandpass', freq: 1200, Q: 2, volEnd: 0, category });
  if (wrench?.gain) {
  wrench.gain.gain.linearRampToValueAtTime(0.2, t + 0.05);
  }
  if (wrench?.gain) {
  const impact = this.context.createOscillator();
  const impactGain = this.context.createGain();
  impact.type = 'square';
  impact.frequency.value = 18;
  impactGain.gain.value = 1;
  impact.connect(impactGain);
  impactGain.connect(wrench.gain.gain);
  impact.start(t);
  impact.stop(t + 0.3);
  }
  this._osc(t, 'sine', 200, 0.05, 0.4, { freqEnd: 600, volEnd: 0, category });
  this._osc(t + 0.2, 'square', 880, 0, 0.3, { dist: true, volEnd: 0.001, category })
  ?.gain.gain.linearRampToValueAtTime(0.05, t + 0.25);
  break;
  }
  case 'error':
  if (this._uiBuffers.error) {
  this._playSample('error', category, pan);
  break;
  }
  this._osc(t, 'sawtooth', 150, 0.15, 0.2, { freqEnd: 100, volEnd: 0, ...spatialOpts });
  break;
  case 'explosion':
  const isMeltdown = subtype === 'meltdown' || param === 'meltdown';
  if (!isMeltdown && now - this._lastExplosionTime < this._config.explosionInterval) return;
  this._lastExplosionTime = now;
  const masterVol = isMeltdown ? 0.8 : 0.5;
  if (this._noiseBuffer) {
  const snapSrc = ctx.createBufferSource();
  snapSrc.buffer = this._noiseBuffer;
  const snapFilter = ctx.createBiquadFilter();
  const snapGain = ctx.createGain();
  snapFilter.type = 'highpass';
  snapFilter.frequency.value = 1500;
  snapSrc.connect(snapFilter);
  snapFilter.connect(snapGain);
  let dest = categoryGain;
  if (pan !== null && !isMeltdown && this.context.createStereoPanner) {
  const p = this.context.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  p.connect(dest);
  dest = p;
  }
  snapGain.connect(dest);
  snapGain.gain.setValueAtTime(masterVol, t);
  snapGain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
  snapSrc.start(t);
  snapSrc.stop(t + 0.1);
  }
  const boom = ctx.createOscillator();
  const boomGain = ctx.createGain();
  boom.type = 'triangle';
  boom.frequency.setValueAtTime(150, t);
  boom.frequency.exponentialRampToValueAtTime(40, t + 0.3);
  boom.connect(boomGain);
  let boomDest = categoryGain;
  if (pan !== null && !isMeltdown && this.context.createStereoPanner) {
  const p = this.context.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  p.connect(boomDest);
  boomDest = p;
  }
  boomGain.connect(boomDest);
  boomGain.gain.setValueAtTime(masterVol, t);
  boomGain.gain.exponentialRampToValueAtTime(0.01, t + 0.4);
  boom.start(t);
  boom.stop(t + 0.4);
  const hissDuration = isMeltdown ? 4 : 2;
  if (this._noiseBuffer) {
  const hissSrc = ctx.createBufferSource();
  hissSrc.buffer = this._noiseBuffer;
  const hissGain = ctx.createGain();
  const hissFilter = ctx.createBiquadFilter();
  hissFilter.type = 'lowpass';
  hissFilter.frequency.setValueAtTime(3000, t);
  hissFilter.frequency.linearRampToValueAtTime(1000, t + hissDuration);
  hissSrc.connect(hissFilter);
  hissFilter.connect(hissGain);
  hissGain.connect(categoryGain);
  hissGain.gain.setValueAtTime(masterVol * 0.4, t);
  hissGain.gain.exponentialRampToValueAtTime(0.001, t + hissDuration);
  hissSrc.start(t, Math.random() * 5, hissDuration);
  }
  const debrisCount = isMeltdown ? 12 : 5;
  for (let i = 0; i < debrisCount; i++) {
  const debrisTime = t + 0.1 + Math.random() * 1.5;
  const debrisOsc = ctx.createOscillator();
  const debrisGain = ctx.createGain();
  debrisOsc.type = Math.random() > 0.5 ? 'sine' : 'triangle';
  debrisOsc.frequency.setValueAtTime(2000 + Math.random() * 3000, debrisTime);
  debrisOsc.connect(debrisGain);
  debrisGain.connect(categoryGain);
  debrisGain.gain.setValueAtTime(0.05, debrisTime);
  debrisGain.gain.exponentialRampToValueAtTime(0.001, debrisTime + 0.05);
  debrisOsc.start(debrisTime);
  debrisOsc.stop(debrisTime + 0.05);
  }
  if (isMeltdown) {
  const pdOsc = ctx.createOscillator();
  const pdGain = ctx.createGain();
  pdOsc.type = 'sawtooth';
  pdOsc.frequency.setValueAtTime(300, t);
  pdOsc.frequency.exponentialRampToValueAtTime(10, t + 3);
  pdOsc.connect(pdGain);
  pdGain.connect(categoryGain);
  pdGain.gain.setValueAtTime(0.3, t);
  pdGain.gain.linearRampToValueAtTime(0, t + 3);
  pdOsc.start(t);
  pdOsc.stop(t + 3);
  }
  break;
  case 'warning':
  if (this._warningLoopActive) {
  this._warningIntensity = intensity;
  return;
  }
  this.startWarningLoop(intensity);
  break;
  case 'flux':
  const suckDuration = 0.12;
  if (this._noiseBuffer) {
  const src = ctx.createBufferSource();
  src.buffer = this._noiseBuffer;
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.setValueAtTime(8000, t);
  filter.frequency.exponentialRampToValueAtTime(500, t + suckDuration);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(categoryGain);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.25, t + suckDuration);
  src.start(t);
  src.stop(t + suckDuration);
  }
  const impactT = t + suckDuration;
  const arcOsc = ctx.createOscillator();
  const arcGain = ctx.createGain();
  const arcFilter = ctx.createBiquadFilter();
  arcOsc.type = 'sawtooth';
  arcOsc.frequency.setValueAtTime(400, impactT);
  const fmOsc = ctx.createOscillator();
  fmOsc.type = 'square';
  fmOsc.frequency.value = 60;
  const fmGain = ctx.createGain();
  fmGain.gain.value = 800;
  fmOsc.connect(fmGain);
  fmGain.connect(arcOsc.frequency);
  arcFilter.type = 'highpass';
  arcFilter.frequency.value = 2500;
  arcOsc.connect(arcFilter);
  arcFilter.connect(arcGain);
  arcGain.connect(categoryGain);
  arcGain.gain.setValueAtTime(0.2, impactT);
  arcGain.gain.exponentialRampToValueAtTime(0.01, impactT + 0.15);
  arcOsc.start(impactT);
  arcOsc.stop(impactT + 0.15);
  fmOsc.start(impactT);
  fmOsc.stop(impactT + 0.15);
  [2200, 3150, 4800, 6200].forEach(freq => {
  const shim = ctx.createOscillator();
  const shimGain = ctx.createGain();
  shim.type = 'sine';
  shim.frequency.setValueAtTime(freq, impactT);
  const drift = freq + (Math.random() * 40 - 20);
  shim.frequency.linearRampToValueAtTime(drift, impactT + 1.2);
  shim.connect(shimGain);
  shimGain.connect(categoryGain);
  shimGain.gain.setValueAtTime(0.04, impactT);
  shimGain.gain.exponentialRampToValueAtTime(0.001, impactT + 1.5);
  shim.start(impactT);
  shim.stop(impactT + 1.5);
  });
  break;
  case 'click':
  this._duckAmbience();
  if (this._uiBuffers.click) {
  this._playSample('click', category, pan);
  break;
  }
  const buttonOsc = ctx.createOscillator();
  const buttonGain = ctx.createGain();
  const buttonFilter = ctx.createBiquadFilter();
  buttonOsc.type = 'square';
  const clickFreq = 300 * (0.95 + Math.random() * 0.1);
  buttonOsc.frequency.setValueAtTime(clickFreq, t);
  buttonOsc.frequency.exponentialRampToValueAtTime(50, t + 0.08);
  buttonFilter.type = 'lowpass';
  buttonFilter.frequency.value = 800;
  buttonOsc.connect(buttonFilter);
  buttonFilter.connect(buttonGain);
  let clickDest = categoryGain;
  if (pan !== null && this.context.createStereoPanner) {
  const p = this.context.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  p.connect(clickDest);
  clickDest = p;
  }
  buttonGain.connect(clickDest);
  buttonGain.gain.setValueAtTime(0.2, t);
  buttonGain.gain.exponentialRampToValueAtTime(0.01, t + 0.08);
  buttonOsc.start(t);
  buttonOsc.stop(t + 0.08);
  if (this._noiseBuffer) {
  const springSrc = ctx.createBufferSource();
  springSrc.buffer = this._noiseBuffer;
  const springFilter = ctx.createBiquadFilter();
  const springGain = ctx.createGain();
  springFilter.type = 'bandpass';
  springFilter.frequency.value = 2500;
  springSrc.connect(springFilter);
  springFilter.connect(springGain);
  springGain.connect(categoryGain);
  springGain.gain.setValueAtTime(0.1, t);
  springGain.gain.exponentialRampToValueAtTime(0.01, t + 0.04);
  springSrc.start(t, Math.random(), 0.04);
  }
  break;
  case 'tab_switch':
  if (this._uiBuffers.tab_switch) {
  this._playSample('tab_switch', category, pan);
  break;
  }
  if (this._uiBuffers.click) {
  this._playSample('click', category, pan);
  break;
  }
  {
  const switchOsc = ctx.createOscillator();
  const switchGain = ctx.createGain();
  switchOsc.type = 'square';
  switchOsc.frequency.setValueAtTime(200, t);
  switchOsc.frequency.exponentialRampToValueAtTime(50, t + 0.1);
  switchOsc.connect(switchGain);
  switchGain.connect(categoryGain);
  switchGain.gain.setValueAtTime(0.15, t);
  switchGain.gain.linearRampToValueAtTime(0, t + 0.1);
  switchOsc.start(t);
  switchOsc.stop(t + 0.1);
  }
  break;
  case 'ui_hover':
  if (this._uiBuffers.click) {
  this._playSample('click', category, pan);
  break;
  }
  {
  const flyback = ctx.createOscillator();
  const flybackGain = ctx.createGain();
  flyback.type = 'sine';
  flyback.frequency.setValueAtTime(8000, t);
  flyback.frequency.linearRampToValueAtTime(10000, t + 0.05);
  flyback.connect(flybackGain);
  flybackGain.connect(categoryGain);
  flybackGain.gain.setValueAtTime(0.015, t);
  flybackGain.gain.linearRampToValueAtTime(0, t + 0.05);
  flyback.start(t);
  flyback.stop(t + 0.05);
  if (this._noiseBuffer) {
  const staticSrc = ctx.createBufferSource();
  staticSrc.buffer = this._noiseBuffer;
  const staticFilter = ctx.createBiquadFilter();
  const staticGain = ctx.createGain();
  staticFilter.type = 'highpass';
  staticFilter.frequency.value = 5000;
  staticSrc.connect(staticFilter);
  staticFilter.connect(staticGain);
  staticGain.connect(categoryGain);
  staticGain.gain.setValueAtTime(0.03, t);
  staticGain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
  staticSrc.start(t, Math.random(), 0.03);
  }
  }
  break;
  case 'reboot':
  const spin = ctx.createOscillator();
  const spinGain = ctx.createGain();
  spin.type = 'sawtooth';
  spin.frequency.setValueAtTime(200, t);
  spin.frequency.exponentialRampToValueAtTime(10, t + 2.5);
  spin.connect(spinGain);
  spinGain.connect(categoryGain);
  spinGain.gain.setValueAtTime(0.3, t);
  spinGain.gain.linearRampToValueAtTime(0, t + 2.5);
  spin.start(t);
  spin.stop(t + 2.5);
  [0.5, 1.2, 1.9].forEach(offset => {
  const relayTime = t + offset;
  const relayOsc = ctx.createOscillator();
  const relayGain = ctx.createGain();
  relayOsc.type = 'square';
  relayOsc.frequency.setValueAtTime(150, relayTime);
  relayOsc.frequency.exponentialRampToValueAtTime(10, relayTime + 0.1);
  relayOsc.connect(relayGain);
  relayGain.connect(categoryGain);
  relayGain.gain.setValueAtTime(0.4, relayTime);
  relayGain.gain.exponentialRampToValueAtTime(0.01, relayTime + 0.1);
  relayOsc.start(relayTime);
  relayOsc.stop(relayTime + 0.1);
  });
  if (this._noiseBuffer) {
  const vacSrc = ctx.createBufferSource();
  vacSrc.buffer = this._noiseBuffer;
  const vacFilter = ctx.createBiquadFilter();
  const vacGain = ctx.createGain();
  vacFilter.type = 'bandpass';
  vacFilter.frequency.value = 400;
  vacFilter.Q.value = 1;
  vacSrc.connect(vacFilter);
  vacFilter.connect(vacGain);
  vacGain.connect(categoryGain);
  vacGain.gain.setValueAtTime(0, t + 2);
  vacGain.gain.linearRampToValueAtTime(0.1, t + 2.5);
  vacGain.gain.setValueAtTime(0.1, t + 3.4);
  vacGain.gain.linearRampToValueAtTime(0, t + 3.5);
  vacSrc.start(t + 2, 0, 1.5);
  }
  const ignitionTime = t + 3.5;
  const kick = ctx.createOscillator();
  const kickGain = ctx.createGain();
  kick.type = 'sine';
  kick.frequency.setValueAtTime(120, ignitionTime);
  kick.frequency.exponentialRampToValueAtTime(30, ignitionTime + 0.2);
  kick.connect(kickGain);
  kickGain.connect(categoryGain);
  kickGain.gain.setValueAtTime(0.8, ignitionTime);
  kickGain.gain.exponentialRampToValueAtTime(0.01, ignitionTime + 0.5);
  kick.start(ignitionTime);
  kick.stop(ignitionTime + 0.5);
  [220, 277.18, 329.63].forEach(freq => {
  const pad = ctx.createOscillator();
  const padGain = ctx.createGain();
  pad.type = 'sine';
  pad.frequency.setValueAtTime(freq, ignitionTime);
  pad.frequency.linearRampToValueAtTime(freq * 1.02, ignitionTime + 4);
  pad.connect(padGain);
  padGain.connect(categoryGain);
  padGain.gain.setValueAtTime(0, ignitionTime);
  padGain.gain.linearRampToValueAtTime(0.1, ignitionTime + 1);
  padGain.gain.linearRampToValueAtTime(0, ignitionTime + 4);
  pad.start(ignitionTime);
  pad.stop(ignitionTime + 4);
  });
  break;
  case 'depletion':
  if (this._noiseBuffer) {
  const fizzSrc = ctx.createBufferSource();
  fizzSrc.buffer = this._noiseBuffer;
  const fizzFilter = ctx.createBiquadFilter();
  const fizzGain = ctx.createGain();
  fizzFilter.type = 'lowpass';
  fizzFilter.frequency.setValueAtTime(4000, t);
  fizzFilter.frequency.exponentialRampToValueAtTime(100, t + 0.4);
  fizzSrc.connect(fizzFilter);
  fizzFilter.connect(fizzGain);
  fizzGain.connect(categoryGain);
  fizzGain.gain.setValueAtTime(0.2, t);
  fizzGain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
  fizzSrc.start(t, Math.random() * 2, 0.4);
  }
  for (let i = 0; i < 4; i++) {
  const rattleTime = t + 0.15 + i * 0.07 + Math.random() * 0.02;
  const rattleOsc = ctx.createOscillator();
  const rattleGain = ctx.createGain();
  const rattleFilter = ctx.createBiquadFilter();
  rattleOsc.type = 'square';
  rattleOsc.frequency.setValueAtTime(600 + Math.random() * 200, rattleTime);
  rattleFilter.type = 'bandpass';
  rattleFilter.frequency.value = 800;
  rattleFilter.Q.value = 8;
  rattleOsc.connect(rattleFilter);
  rattleFilter.connect(rattleGain);
  rattleGain.connect(categoryGain);
  rattleGain.gain.setValueAtTime(0.05, rattleTime);
  rattleGain.gain.exponentialRampToValueAtTime(0.001, rattleTime + 0.05);
  rattleOsc.start(rattleTime);
  rattleOsc.stop(rattleTime + 0.05);
  }
  break;
  case 'objective':
  if (this._noiseBuffer) {
  const airSrc = ctx.createBufferSource();
  airSrc.buffer = this._noiseBuffer;
  const airGain = ctx.createGain();
  const airFilter = ctx.createBiquadFilter();
  airFilter.type = 'lowpass';
  airFilter.frequency.value = 800;
  airSrc.connect(airFilter);
  airFilter.connect(airGain);
  airGain.connect(categoryGain);
  airGain.gain.setValueAtTime(0.2, t);
  airGain.gain.linearRampToValueAtTime(0, t + 0.1);
  airSrc.start(t);
  airSrc.stop(t + 0.1);
  }
  const stampTime = t + 0.12;
  const thudOsc = ctx.createOscillator();
  const thudGain = ctx.createGain();
  thudOsc.type = 'triangle';
  thudOsc.frequency.setValueAtTime(120, stampTime);
  thudOsc.frequency.exponentialRampToValueAtTime(30, stampTime + 0.15);
  thudOsc.connect(thudGain);
  thudGain.connect(categoryGain);
  thudGain.gain.setValueAtTime(0, stampTime);
  thudGain.gain.linearRampToValueAtTime(0.6, stampTime + 0.01);
  thudGain.gain.exponentialRampToValueAtTime(0.01, stampTime + 0.2);
  thudOsc.start(stampTime);
  thudOsc.stop(stampTime + 0.2);
  const clankOsc = ctx.createOscillator();
  const clankGain = ctx.createGain();
  clankOsc.type = 'square';
  clankOsc.frequency.setValueAtTime(400, stampTime);
  clankOsc.connect(clankGain);
  clankGain.connect(categoryGain);
  clankGain.gain.setValueAtTime(0.15, stampTime);
  clankGain.gain.exponentialRampToValueAtTime(0.001, stampTime + 0.05);
  clankOsc.start(stampTime);
  clankOsc.stop(stampTime + 0.05);
  const printStart = t + 0.35;
  for (let i = 0; i < 8; i++) {
  const charTime = printStart + i * 0.06;
  const headOsc = ctx.createOscillator();
  const headGain = ctx.createGain();
  headOsc.type = 'square';
  headOsc.frequency.setValueAtTime(1800 + Math.random() * 200, charTime);
  headOsc.connect(headGain);
  headGain.connect(categoryGain);
  headGain.gain.setValueAtTime(0.08, charTime);
  headGain.gain.exponentialRampToValueAtTime(0.001, charTime + 0.03);
  headOsc.start(charTime);
  headOsc.stop(charTime + 0.03);
  }
  break;
  case 'component_overheat':
  if (this._noiseBuffer) {
  const groanSrc = ctx.createBufferSource();
  groanSrc.buffer = this._noiseBuffer;
  const groanFilter = ctx.createBiquadFilter();
  const groanGain = ctx.createGain();
  groanFilter.type = 'bandpass';
  groanFilter.Q.value = 15;
  groanFilter.frequency.setValueAtTime(450, t);
  groanFilter.frequency.exponentialRampToValueAtTime(300, t + 1.5);
  groanSrc.connect(groanFilter);
  groanFilter.connect(groanGain);
  groanGain.connect(categoryGain);
  groanGain.gain.setValueAtTime(0, t);
  groanGain.gain.linearRampToValueAtTime(0.25, t + 0.2);
  groanGain.gain.linearRampToValueAtTime(0, t + 1.5);
  groanSrc.start(t, Math.random() * 5, 1.5);
  }
  const pingCount = 1 + Math.floor(Math.random() * 2);
  for (let i = 0; i < pingCount; i++) {
  const pingTime = t + 0.2 + Math.random() * 0.8;
  const pingOsc = ctx.createOscillator();
  const pingGain = ctx.createGain();
  pingOsc.type = 'sine';
  pingOsc.frequency.setValueAtTime(2500 + Math.random() * 1000, pingTime);
  pingOsc.connect(pingGain);
  pingGain.connect(categoryGain);
  pingGain.gain.setValueAtTime(0, pingTime);
  pingGain.gain.setValueAtTime(0.1, pingTime + 0.001);
  pingGain.gain.exponentialRampToValueAtTime(0.001, pingTime + 0.3);
  pingOsc.start(pingTime);
  pingOsc.stop(pingTime + 0.3);
  }
  break;
  case 'save':
  const motor = ctx.createOscillator();
  const motorGain = ctx.createGain();
  motor.type = 'triangle';
  motor.frequency.setValueAtTime(100, t);
  motor.frequency.exponentialRampToValueAtTime(800, t + 1);
  motor.connect(motorGain);
  motorGain.connect(categoryGain);
  motorGain.gain.setValueAtTime(0, t);
  motorGain.gain.linearRampToValueAtTime(0.1, t + 0.5);
  motorGain.gain.linearRampToValueAtTime(0, t + 1.2);
  motor.start(t);
  motor.stop(t + 1.2);
  if (this._noiseBuffer) {
  for (let i = 0; i < 12; i++) {
  const seekTime = t + 0.3 + Math.random() * 0.8;
  const seekSrc = ctx.createBufferSource();
  seekSrc.buffer = this._noiseBuffer;
  const seekFilter = ctx.createBiquadFilter();
  const seekGain = ctx.createGain();
  seekFilter.type = 'bandpass';
  seekFilter.frequency.value = 2500;
  seekFilter.Q.value = 2;
  seekSrc.connect(seekFilter);
  seekFilter.connect(seekGain);
  seekGain.connect(categoryGain);
  seekGain.gain.setValueAtTime(0.12, seekTime);
  seekGain.gain.exponentialRampToValueAtTime(0.001, seekTime + 0.05);
  seekSrc.start(seekTime, Math.random(), 0.05);
  }
  }
  const parkTime = t + 1.3;
  const saveLatch = ctx.createOscillator();
  const saveLatchGain = ctx.createGain();
  saveLatch.type = 'square';
  saveLatch.frequency.setValueAtTime(150, parkTime);
  saveLatch.frequency.exponentialRampToValueAtTime(40, parkTime + 0.1);
  saveLatch.connect(saveLatchGain);
  saveLatchGain.connect(categoryGain);
  saveLatchGain.gain.setValueAtTime(0.15, parkTime);
  saveLatchGain.gain.exponentialRampToValueAtTime(0.001, parkTime + 0.1);
  saveLatch.start(parkTime);
  saveLatch.stop(parkTime + 0.1);
  break;
  default:
  break;
  }
  } finally {
  if (limiterNode) {
  this._activeLimiter = null;
  }
  }
  }
}
