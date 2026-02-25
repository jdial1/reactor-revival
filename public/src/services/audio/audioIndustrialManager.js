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
