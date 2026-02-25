import { numFormat as fmt } from "../../utils/util.js";
import { ParticleSystem } from "../particleSystem.js";

export class ParticleEffectsUI {
  constructor(ui) {
    this.ui = ui;
  }

  initParticleCanvas() {
    if (typeof document === "undefined" || !document.body || this.ui._particleCanvas?.parentNode) return;
    this.ui._particleCanvas = document.createElement("canvas");
    this.ui._particleCanvas.style.cssText = "position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:100;";
    this.ui._particleCanvas.width = window.innerWidth || 1;
    this.ui._particleCanvas.height = window.innerHeight || 1;
    document.body.appendChild(this.ui._particleCanvas);
    this.ui._particleCtx = this.ui._particleCanvas.getContext("2d");
    this.ui.particleSystem = new ParticleSystem();
    this.ui.particleSystem.setSize(this.ui._particleCanvas.width, this.ui._particleCanvas.height);
  }

  resizeParticleCanvas() {
    if (!this.ui._particleCanvas || !this.ui.particleSystem) return;
    const w = window.innerWidth || 1;
    const h = window.innerHeight || 1;
    this.ui._particleCanvas.width = w;
    this.ui._particleCanvas.height = h;
    this.ui.particleSystem.setSize(w, h);
  }

  showFloatingText(container, amount) {
    if (!container || amount <= 0) return;
    const parent = container.querySelector(".floating-text-container");
    if (!parent) return;
    const pool = this.ui._visualPool;
    const textEl = pool.floatingText.pop() || Object.assign(document.createElement("div"), { className: "floating-text" });
    textEl.textContent = `+$${fmt(amount)}`;
    parent.appendChild(textEl);
    setTimeout(() => {
      textEl.remove();
      pool.floatingText.push(textEl);
    }, 1000);
  }

  showFloatingTextAtTile(tile, amount) {
    if (!tile || amount <= 0) return;
    const overlay = this.ui.heatVisualsUI._ensureOverlay();
    if (!overlay) return;
    const pos = this.ui.heatVisualsUI._tileCenterToOverlayPosition(tile.row, tile.col);
    const pool = this.ui._visualPool;
    const textEl = pool.floatingText.pop() || Object.assign(document.createElement("div"), { className: "floating-text" });
    textEl.textContent = `+$${fmt(amount)}`;
    textEl.style.left = `${pos.x}px`;
    textEl.style.top = `${pos.y}px`;
    overlay.appendChild(textEl);
    setTimeout(() => {
      textEl.remove();
      pool.floatingText.push(textEl);
    }, 1000);
  }

  createSteamParticles(container, heatAmount) {
    if (!container || !this.ui.particleSystem) return;
    const rect = container.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    this.ui.particleSystem.createSteamParticles(cx, cy, heatAmount);
  }

  createBoltParticle(fromEl, toEl) {
    if (!fromEl || !toEl || !this.ui.particleSystem) return;
    const fromRect = fromEl.getBoundingClientRect();
    const toRect = toEl.getBoundingClientRect();
    const startX = fromRect.left + fromRect.width / 2;
    const startY = fromRect.top + fromRect.height / 2;
    const endX = toRect.left + toRect.width / 2;
    const endY = toRect.top + toRect.height / 2;
    this.ui.particleSystem.createBoltParticle(startX, startY, endX, endY);
  }

  createSellSparks(fromEl, toEl) {
    if (!fromEl || !toEl || !this.ui.particleSystem) return;
    const fromRect = fromEl.getBoundingClientRect();
    const toRect = toEl.getBoundingClientRect();
    const fromX = fromRect.left + fromRect.width / 2;
    const fromY = fromRect.top + fromRect.height / 2;
    const toX = toRect.left + toRect.width / 2;
    const toY = toRect.top + toRect.height / 2;
    this.ui.particleSystem.createSellSparks(fromX, fromY, toX, toY);
  }
}
