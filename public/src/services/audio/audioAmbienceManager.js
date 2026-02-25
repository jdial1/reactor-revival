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
    if (useLayers) {
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
      return;
    }
    const globalLFO = this.svc.context.createOscillator();
    globalLFO.frequency.value = 0.15;
    const globalLFOGain = this.svc.context.createGain();
    globalLFOGain.gain.value = 0.1;
    globalLFO.connect(globalLFOGain);
    const humOsc1 = this.svc.context.createOscillator();
    const humOsc2 = this.svc.context.createOscillator();
    humOsc1.type = 'sawtooth';
    humOsc2.type = 'square';
    humOsc1.frequency.value = 50;
    humOsc2.frequency.value = 50.35;
    const humShaper = this.svc.context.createWaveShaper();
    humShaper.curve = this.svc._distortionCurve || this.svc._makeDistortionCurve(400);
    const humFilter = this.svc.context.createBiquadFilter();
    humFilter.type = 'lowpass';
    humFilter.frequency.value = 280;
    humFilter.Q.value = 4;
    const humGain = this.svc.context.createGain();
    humGain.gain.value = 0.25;
    humOsc1.connect(humShaper);
    humOsc2.connect(humShaper);
    humShaper.connect(humFilter);
    humFilter.connect(humGain);
    humGain.connect(dest);
    globalLFOGain.connect(humGain.gain);
    const subOsc = this.svc.context.createOscillator();
    subOsc.type = 'sine';
    subOsc.frequency.value = 32;
    const subGain = this.svc.context.createGain();
    subGain.gain.value = 0.3;
    subOsc.connect(subGain);
    subGain.connect(dest);
    if (this.svc._noiseBuffer) {
      const pumpSrc = this.svc.context.createBufferSource();
      pumpSrc.buffer = this.svc._noiseBuffer;
      pumpSrc.loop = true;
      const pumpFilter = this.svc.context.createBiquadFilter();
      pumpFilter.type = 'lowpass';
      pumpFilter.frequency.value = 120;
      pumpFilter.Q.value = 2;
      const pumpGain = this.svc.context.createGain();
      pumpGain.gain.value = 0;
      const pumpLFO1 = this.svc.context.createOscillator();
      pumpLFO1.frequency.value = 0.8;
      const pumpLFO2 = this.svc.context.createOscillator();
      pumpLFO2.frequency.value = 0.67;
      const lfoMixGain = this.svc.context.createGain();
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
    if (this.svc._noiseBuffer) {
      const rattleSrc = this.svc.context.createBufferSource();
      rattleSrc.buffer = this.svc._noiseBuffer;
      rattleSrc.loop = true;
      const rattleFilter = this.svc.context.createBiquadFilter();
      rattleFilter.type = 'bandpass';
      rattleFilter.frequency.value = 220;
      rattleFilter.Q.value = 15;
      const rattleGain = this.svc.context.createGain();
      rattleGain.gain.value = 0;
      const vibrationLFO = this.svc.context.createOscillator();
      vibrationLFO.type = 'triangle';
      vibrationLFO.frequency.value = 25;
      const driftLFO = this.svc.context.createOscillator();
      driftLFO.frequency.value = 0.1;
      const driftGain = this.svc.context.createGain();
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
