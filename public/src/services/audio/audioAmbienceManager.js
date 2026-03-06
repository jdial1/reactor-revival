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
