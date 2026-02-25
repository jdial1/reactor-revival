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
