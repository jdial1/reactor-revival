
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
  this._warningLoopInterval = null;
  this._warningLoopActive = false;
  this._warningIntensity = 0.5;
  this._geigerInterval = null;
  this._geigerActive = false;
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
  const savedMasterVol = parseFloat(localStorage.getItem("reactor_volume_master") || "0.25");
  this.masterGain.gain.value = savedMasterVol;
  this.masterGain.connect(this.context.destination);
  this.effectsGain = this.context.createGain();
  this.alertsGain = this.context.createGain();
  this.systemGain = this.context.createGain();
  this.ambienceGain = this.context.createGain();
  this.effectsGain.connect(this.masterGain);
  this.alertsGain.connect(this.masterGain);
  this.systemGain.connect(this.masterGain);
  this.ambienceGain.connect(this.masterGain);
  this._loadVolumeSettings();
  const bufferSize = this.context.sampleRate * 4;
  this._noiseBuffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
  const data = this._noiseBuffer.getChannelData(0);
  let lastOut = 0;
  for (let i = 0; i < bufferSize; i++) {
  const white = Math.random() * 2 - 1;
  data[i] = (lastOut + (0.02 * white)) / 1.02;
  lastOut = data[i];
  data[i] *= 3.5;
  }
  this._distortionCurve = this._makeDistortionCurve(400);
  this._isInitialized = true;
  if (localStorage.getItem("reactor_mute") === "true") {
  this.toggleMute(true);
  } else {
  this.startAmbience();
  }
  const unlockAudio = () => {
  if (this.context.state === 'suspended') {
  this.context.resume();
  }
  document.removeEventListener('touchstart', unlockAudio);
  document.removeEventListener('click', unlockAudio);
  };
  document.addEventListener('touchstart', unlockAudio);
  document.addEventListener('click', unlockAudio);
  document.addEventListener("visibilitychange", () => {
  if (!this._isInitialized || !this.context) return;
  if (document.hidden) {
  this.context.suspend();
  } else {
  this.context.resume();
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
  const masterVol = parseFloat(localStorage.getItem("reactor_volume_master") || "0.25");
  const effectsVol = parseFloat(localStorage.getItem("reactor_volume_effects") || "0.50");
  const alertsVol = parseFloat(localStorage.getItem("reactor_volume_alerts") || "0.50");
  const systemVol = parseFloat(localStorage.getItem("reactor_volume_system") || "0.50");
  const ambienceVol = parseFloat(localStorage.getItem("reactor_volume_ambience") || "0.12");
  if (this.masterGain) this.masterGain.gain.value = masterVol;
  if (this.effectsGain) this.effectsGain.gain.value = effectsVol;
  if (this.alertsGain) this.alertsGain.gain.value = alertsVol;
  if (this.systemGain) this.systemGain.gain.value = systemVol;
  if (this.ambienceGain) this.ambienceGain.gain.value = ambienceVol;
  }
  setVolume(category, value) {
  if (!this._isInitialized) return;
  const clampedValue = Math.max(0, Math.min(1, value));
  localStorage.setItem(`reactor_volume_${category}`, clampedValue.toString());
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
  startWarningLoop(intensity = 0.5) {
  if (this._warningLoopActive) {
  this._warningIntensity = intensity;
  return;
  }
  this._warningLoopActive = true;
  this._warningIntensity = intensity;
  this._playWarningSound(intensity);
  this._warningLoopInterval = setInterval(() => {
  if (this._warningLoopActive) {
  this._playWarningSound(this._warningIntensity);
  }
  }, 5000);
  this._startGeigerTicks(intensity);
  }
  stopWarningLoop() {
  this._warningLoopActive = false;
  if (this._warningLoopInterval) {
  clearInterval(this._warningLoopInterval);
  this._warningLoopInterval = null;
  }
  this._stopGeigerTicks();
  }
  _startGeigerTicks(intensity = 0.5) {
  if (this._geigerActive || !this.enabled || !this.context) return;
  this._geigerActive = true;
  const baseInterval = 200 + (1 - intensity) * 300;
  const playTick = () => {
  if (!this._geigerActive || !this.enabled || !this.context || this.context.state !== 'running') return;
  const ctx = this.context;
  const t = ctx.currentTime;
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
  const nextInterval = baseInterval + (Math.random() * 100 - 50);
  this._geigerInterval = setTimeout(playTick, nextInterval);
  };
  playTick();
  }
  _stopGeigerTicks() {
  this._geigerActive = false;
  if (this._geigerInterval) {
  clearTimeout(this._geigerInterval);
  this._geigerInterval = null;
  }
  }
  _playWarningSound(intensity = 0.5) {
  if (!this.enabled || !this.context || this.context.state !== 'running') return;
  const ctx = this.context;
  const t = ctx.currentTime;
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
  toggleMute(muted) {
  if (!this._isInitialized) return;
  this.enabled = !muted;
  localStorage.setItem("reactor_mute", muted ? "true" : "false");
  if (this.masterGain) {
  const targetVol = this.enabled ? (parseFloat(localStorage.getItem("reactor_volume_master") || "0.12")) : 0;
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
  startAmbience() {
  if (!this.enabled || !this.context || this._ambienceNodes.length > 0) return;
  const t = this.context.currentTime;
  const dest = this.ambienceGain || this.masterGain;
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
  }
  _osc(startTime, type, freq, volume, duration, options = {}) {
  if (!this.context) return null;
  const osc = this.context.createOscillator();
  const gain = this.context.createGain();
  let source = osc;
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
  const categoryGain = this._getCategoryGain(options.category);
  gain.connect(categoryGain);
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
  const categoryGain = this._getCategoryGain(options.category);
  gain.connect(categoryGain);
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
  _getCategoryGain(category) {
  if (!this._isInitialized) return this.masterGain;
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
  play(type, param = null) {
  const isMuted = this._muted;
  console.log(`[AUDIO DEBUG] play() called: type=${type}, param=${param}, enabled=${this.enabled}, muted=${isMuted}, context=${!!this.context}, contextState=${this.context?.state}`);
  if (!this.enabled || !this.context || this.context.state !== 'running') {
    console.log(`[AUDIO DEBUG] play() aborted: enabled=${this.enabled}, muted=${isMuted}, context=${!!this.context}, contextState=${this.context?.state}`);
    return;
  }
  if (isMuted) {
    console.log(`[AUDIO DEBUG] play() skipped due to mute: type=${type}, param=${param}`);
    return;
  }
  const ctx = this.context;
  const now = Date.now();
  const t = ctx.currentTime;
  const subtype = typeof param === 'string' ? param : 'generic';
  const intensity = typeof param === 'number' ? Math.min(Math.max(param, 0), 1) : 0.5;
  const category = this._getSoundCategory(type);
  const categoryGain = this._getCategoryGain(category);
  switch (type) {
  case 'placement': {
  const basePitch = 140 * (0.9 + Math.random() * 0.2);
  const thud = this._osc(t, 'triangle', basePitch, 0, 0.25, { freqEnd: 40, volEnd: 0.01, category });
  thud?.gain.gain.linearRampToValueAtTime(0.5, t + 0.02);
  this._osc(t, 'square', 800, 0.15, 0.05, { category });
  if (subtype === 'cell') {
  this._osc(t, 'sawtooth', 55, 0.15, 0.3, { freqEnd: 45, volEnd: 0, category });
  } else if (subtype === 'plating') {
  thud?.gain.gain.setValueAtTime(0.7, t + 0.02);
  this._osc(t, 'sine', 1200, 0.1, 0.4, { category });
  } else if (subtype === 'vent') {
  thud?.gain.gain.linearRampToValueAtTime(0.3, t + 0.02);
  this._noise(t, 0.25, 0.3, { category });
  }
  break;
  }
  case 'sell': {
  this._osc(t, 'square', 80, 0.4, 0.1, { freqEnd: 20, category });
  this._noise(t, 0.15, 0.15, { type: 'highpass', freq: 2000, category });
  const hum = this._osc(t, 'sawtooth', 60, 0, 0.4, { dist: true, volEnd: 0, category });
  hum?.gain.gain.linearRampToValueAtTime(0.3, t + 0.05);
  hum?.gain.gain.setValueAtTime(0.3, t + 0.35);
  this._osc(t + 0.3, 'sine', 400, 0, 0.5, { freqEnd: 50, category })
  ?.gain.gain.linearRampToValueAtTime(0.1, t + 0.35);
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
  this._osc(t, 'sawtooth', 150, 0.15, 0.2, { freqEnd: 100, volEnd: 0, category });
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
  snapGain.connect(categoryGain);
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
  boomGain.connect(categoryGain);
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
  const buttonOsc = ctx.createOscillator();
  const buttonGain = ctx.createGain();
  const buttonFilter = ctx.createBiquadFilter();
  buttonOsc.type = 'square';
  buttonOsc.frequency.setValueAtTime(300, t);
  buttonOsc.frequency.exponentialRampToValueAtTime(50, t + 0.08);
  buttonFilter.type = 'lowpass';
  buttonFilter.frequency.value = 800;
  buttonOsc.connect(buttonFilter);
  buttonFilter.connect(buttonGain);
  buttonGain.connect(categoryGain);
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
  case 'ui_hover':
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
  break;
  case 'tab_switch':
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
  }
  }
  }
  