import { html } from "lit-html";
import { ReactiveLitComponent } from "../ReactiveLitComponent.js";

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
    this._unmount = null;
  }

  startPerformanceTracking() {
    if (this._performanceUpdateInterval) return;
    this._performanceUpdateInterval = setInterval(() => {
      this._updatePerformanceStats();
    }, 1000);
    this._mountPerformanceDisplay();
  }

  stopPerformanceTracking() {
    if (this._performanceUpdateInterval) {
      clearInterval(this._performanceUpdateInterval);
      this._performanceUpdateInterval = null;
    }
    if (this._unmount) {
      this._unmount();
      this._unmount = null;
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

  _updatePerformanceStats() {
    const ui = this.ui;
    if (!ui.uiState) return;
    const avgFPS =
      this._fpsHistory.length > 0
        ? Math.round(this._fpsHistory.reduce((a, b) => a + b, 0) / this._fpsHistory.length)
        : 0;
    const avgTPS =
      this._tpsHistory.length > 0
        ? Math.round(this._tpsHistory.reduce((a, b) => a + b, 0) / this._tpsHistory.length)
        : 0;
    ui.uiState.performance_stats = {
      fps: avgFPS,
      tps: avgTPS,
      fps_color: avgFPS >= 55 ? "#4CAF50" : avgFPS >= 45 ? "#FF9800" : "#F44336",
      tps_color: avgTPS >= 30 ? "#4CAF50" : avgTPS >= 20 ? "#FF9800" : "#F44336",
    };
  }

  _performanceDisplayTemplate() {
    const stats = this.ui.uiState?.performance_stats ?? { fps: 0, tps: 0, fps_color: "#4CAF50", tps_color: "#4CAF50" };
    return html`
      <strong title="Tick Rate">
        <img src="img/ui/icons/icon_time.png" alt="TPS" class="icon-inline" />
        <span id="tps_display" style="color: ${stats.tps_color}">${stats.tps}</span>
      </strong>
    `;
  }

  _mountPerformanceDisplay() {
    const ui = this.ui;
    const engineStatus = document.getElementById("engine_status");
    if (!engineStatus || !ui.uiState) return;
    const firstLi = engineStatus.querySelector("li:first-child");
    if (!firstLi) return;
    this._unmount = ReactiveLitComponent.mountMulti(
      [{ state: ui.uiState, keys: ["performance_stats"] }],
      () => this._performanceDisplayTemplate(),
      firstLi
    );
  }
}
