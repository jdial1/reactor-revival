export class PerformanceUI {
  constructor(ui) {
    this.ui = ui;
    this._fpsHistory = [];
    this._tpsHistory = [];
    this._lastFrameTime = performance.now();
    this._lastTickTime = performance.now();
    this._frameCount = 0;
    this._tickCount = 0;
    this._performanceUpdateInterval = null;
  }

  startPerformanceTracking() {
    if (this._performanceUpdateInterval) return;
    this._performanceUpdateInterval = setInterval(() => {
      this.updatePerformanceDisplay();
    }, 1000);
  }

  stopPerformanceTracking() {
    if (this._performanceUpdateInterval) {
      clearInterval(this._performanceUpdateInterval);
      this._performanceUpdateInterval = null;
    }
  }

  recordFrame() {
    const now = performance.now();
    this._frameCount++;
    if (now - this._lastFrameTime >= 1000) {
      const fps = this._frameCount;
      this._fpsHistory.push(fps);
      if (this._fpsHistory.length > 10) this._fpsHistory.shift();
      this._frameCount = 0;
      this._lastFrameTime = now;
    }
  }

  recordTick() {
    const now = performance.now();
    this._tickCount++;
    if (now - this._lastTickTime >= 1000) {
      const tps = this._tickCount;
      this._tpsHistory.push(tps);
      if (this._tpsHistory.length > 10) this._tpsHistory.shift();
      this._tickCount = 0;
      this._lastTickTime = now;
    }
  }

  updatePerformanceDisplay() {
    const ui = this.ui;
    if (!ui.DOMElements.fps_display || !ui.DOMElements.tps_display) return;
    const avgFPS =
      this._fpsHistory.length > 0
        ? Math.round(this._fpsHistory.reduce((a, b) => a + b, 0) / this._fpsHistory.length)
        : 0;
    const avgTPS =
      this._tpsHistory.length > 0
        ? Math.round(this._tpsHistory.reduce((a, b) => a + b, 0) / this._tpsHistory.length)
        : 0;
    ui.DOMElements.fps_display.textContent = avgFPS;
    ui.DOMElements.tps_display.textContent = avgTPS;
    if (avgFPS >= 55) ui.DOMElements.fps_display.style.color = "#4CAF50";
    else if (avgFPS >= 45) ui.DOMElements.fps_display.style.color = "#FF9800";
    else ui.DOMElements.fps_display.style.color = "#F44336";
    if (avgTPS >= 30) ui.DOMElements.tps_display.style.color = "#4CAF50";
    else if (avgTPS >= 20) ui.DOMElements.tps_display.style.color = "#FF9800";
    else ui.DOMElements.tps_display.style.color = "#F44336";
  }
}
