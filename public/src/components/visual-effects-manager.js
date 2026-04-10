import { numFormat as fmt } from "../utils.js";

export class ParticleEffectsUI {
  constructor(ui) {
    this.ui = ui;
  }

  initParticleCanvas() {}

  resizeParticleCanvas() {}

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

  createSteamParticles() {}

  createBoltParticle() {}

  createSellSparks() {}
}

export class VisualEventRendererUI {
  constructor(ui) {
    this.ui = ui;
  }

  render(eventBufferDescriptor) {
    if (!eventBufferDescriptor || eventBufferDescriptor.head === eventBufferDescriptor.tail) return;
    const { buffer, head, tail, max } = eventBufferDescriptor;
    const tileset = this.ui.game?.tileset;
    if (!tileset || !buffer) return;
    let pos = tail;
    while (pos !== head) {
      const idx = pos * 4;
      const typeId = buffer[idx];
      const row = buffer[idx + 1];
      const col = buffer[idx + 2];
      const t = tileset.getTile(row, col);
      if (t) {
        if (typeId === 1) {
          this.ui.gridController.spawnTileIcon('power', t, null);
        } else if (typeId === 2 && t.part?.category === 'vent') {
          this.ui.gridController.blinkVent(t);
        }
      }
      pos = (pos + 1) % max;
    }
    if (this.ui.game?.engine && typeof this.ui.game.engine.ackEvents === 'function') {
      this.ui.game.engine.ackEvents(head);
    }
  }
}
