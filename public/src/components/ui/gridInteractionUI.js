import { logger } from "../../utils/logger.js";

export class GridInteractionUI {
  constructor(ui) {
    this.ui = ui;
    this.ui.registry.register('GridInteraction', this);
    this._activeVentRotors = new Map();
    this._activeTileIcons = new Map();
    this.highlightedSegment = null;
  }

  clearSegmentHighlight() {
    if (this.highlightedSegment) {
      for (const component of this.highlightedSegment.components) {
        component.unhighlight();
      }
    }
    this.highlightedSegment = null;
  }

  getHighlightedTiles() {
    return this.highlightedSegment?.components ?? [];
  }

  getSellingTile() {
    return this.ui.inputHandler?.getSellingTile() ?? null;
  }

  getHoveredTile() {
    return this.ui.inputHandler?.getHoveredTile() ?? null;
  }

  getInteractionState() {
    return this.ui?.uiState?.interaction ?? null;
  }

  handleGridInteraction(tile, event) {
    return this.ui.gridController?.handleGridInteraction?.(tile, event);
  }

  spawnTileIcon(kind, fromTile, toTile = null) {
    const ui = this.ui;
    try {
      const container = ui.registry?.get?.("PageInit")?.getReactorBackground?.() ?? ui.DOMElements?.reactor_background ?? document.getElementById("reactor_background");
      if (typeof document === "undefined" || !fromTile || !container) return;
      if (!container || !ui.gridCanvasRenderer) return;
      let animationKey = `${fromTile.row}-${fromTile.col}-${kind}`;
      if (toTile) animationKey += `-to-${toTile.row}-${toTile.col}`;
      if (this._activeTileIcons.has(animationKey)) return;
      const iconSrcMap = { power: "img/ui/icons/icon_power.png", heat: "img/ui/icons/icon_heat.png", vent: "img/ui/icons/icon_vent.png" };
      const src = iconSrcMap[kind];
      if (!src) return;
      const containerRect = container.getBoundingClientRect();
      const fromRect = ui.gridCanvasRenderer.getTileRectInContainer(fromTile.row, fromTile.col, containerRect);
      const tileSizePx = ui.gridCanvasRenderer.getTileSize();
      const iconSize = Math.max(12, Math.min(18, (tileSizePx / 3) | 0));
      const startOffset = (kind === 'power') ? { x: 6, y: -6 } : (kind === 'heat') ? { x: -6, y: 6 } : { x: 0, y: 0 };
      const img = document.createElement("img");
      img.src = src;
      img.alt = kind;
      img.className = `tile-fx fx-${kind}`;
      img.style.width = `${iconSize}px`;
      img.style.height = `${iconSize}px`;
      img.style.left = `${fromRect.centerX - iconSize / 2 + startOffset.x}px`;
      img.style.top = `${fromRect.centerY - iconSize / 2 + startOffset.y}px`;
      this._activeTileIcons.set(animationKey, img);
      container.appendChild(img);
      requestAnimationFrame(() => {
        if (toTile && ui.gridCanvasRenderer) {
          const endRect = ui.gridCanvasRenderer.getTileRectInContainer(toTile.row, toTile.col, containerRect);
          img.style.left = `${endRect.centerX - iconSize / 2}px`;
          img.style.top = `${endRect.centerY - iconSize / 2}px`;
          if (kind === "heat") img.style.opacity = "0.75";
        } else {
          img.classList.add("fx-fade-out");
        }
        setTimeout(() => {
          if (img?.parentNode) img.parentNode.removeChild(img);
          this._activeTileIcons.delete(animationKey);
        }, 300);
      });
    } catch (_) {}
  }

  blinkVent(tile) {
    const ui = this.ui;
    try {
      if (typeof document === "undefined" || !tile || !ui.gridCanvasRenderer) return;
      if (this._activeVentRotors.has(tile)) return;
      const container = ui.registry?.get?.("PageInit")?.getReactorBackground?.() ?? ui.DOMElements?.reactor_background ?? document.getElementById("reactor_background");
      if (!container) return;
      const containerRect = container.getBoundingClientRect();
      const rect = ui.gridCanvasRenderer.getTileRectInContainer(tile.row, tile.col, containerRect);
      const inset = 0.2;
      const size = 0.6;
      const rotorW = rect.width * size;
      const rotorH = rect.height * size;
      const rotorLeft = rect.left + rect.width * inset;
      const rotorTop = rect.top + rect.height * inset;
      const rotor = document.createElement("span");
      rotor.className = "vent-rotor";
      rotor.style.position = "absolute";
      rotor.style.left = `${rotorLeft}px`;
      rotor.style.top = `${rotorTop}px`;
      rotor.style.width = `${rotorW}px`;
      rotor.style.height = `${rotorH}px`;
      rotor.style.pointerEvents = "none";
      if (tile?.part && typeof tile.part.getImagePath === 'function') {
        const sprite = tile.part.getImagePath();
        if (sprite) rotor.style.backgroundImage = `url('${sprite}')`;
      }
      rotor.style.backgroundSize = "166.66% 166.66%";
      rotor.style.backgroundPosition = "center";
      rotor.style.backgroundRepeat = "no-repeat";
      rotor.style.imageRendering = "pixelated";
      this._activeVentRotors.set(tile, rotor);
      container.appendChild(rotor);
      rotor.classList.remove("spin");
      void rotor.offsetWidth;
      rotor.classList.add("spin");
      setTimeout(() => {
        if (rotor?.parentNode) {
          rotor.classList.remove("spin");
          rotor.parentNode.removeChild(rotor);
        }
        this._activeVentRotors.delete(tile);
      }, 300);
    } catch (_) {}
  }

  _cleanupVentRotor(tile) {
    try {
      const rotor = this._activeVentRotors.get(tile);
      if (rotor?.parentNode) rotor.parentNode.removeChild(rotor);
      this._activeVentRotors.delete(tile);
    } catch (_) {}
  }

  clearAllActiveAnimations() {
    this._activeVentRotors.forEach((rotor) => {
      if (rotor?.parentNode) rotor.parentNode.removeChild(rotor);
    });
    this._activeVentRotors.clear();
    this._activeTileIcons.forEach((icon) => {
      if (icon?.parentElement) icon.parentElement.removeChild(icon);
    });
    this._activeTileIcons.clear();
  }

  getAnimationStatus() {
    return {
      activeVentRotors: this._activeVentRotors.size,
      activeTileIcons: this._activeTileIcons.size,
      totalActiveAnimations: this._activeVentRotors.size + this._activeTileIcons.size
    };
  }

  logAnimationStatus() {
  }

  clearReactorHeat() {
    const ui = this.ui;
    if (!ui.game || !ui.game.reactor) return;

    try {
      ui.game.reactor.current_heat = 0;

      if (ui.game.tileset && ui.game.tileset.active_tiles_list) {
        ui.game.tileset.active_tiles_list.forEach(tile => {
          if (tile.heat_contained !== undefined) {
            tile.heat_contained = 0;
          }
          if (tile.heat !== undefined) {
            tile.heat = 0;
          }
          if (tile.display_heat !== undefined) {
            tile.display_heat = 0;
          }
        });
      }

      if (ui.stateManager) {
        ui.stateManager.setVar("current_heat", 0);
        ui.stateManager.setVar("total_heat", 0);
      }

      this.clearAllActiveAnimations();

      logger.log('debug', 'ui', 'Reactor heat cleared!');
    } catch (error) {
      logger.log('error', 'ui', 'Error clearing reactor heat:', error);
    }
  }

  pulseReflector(fromTile, toTile) {
    const ui = this.ui;
    try {
      if (!fromTile || !toTile || !ui.gridCanvasRenderer) return;
      const container = ui.registry?.get?.("PageInit")?.getReactorBackground?.() ?? ui.DOMElements?.reactor_background ?? document.getElementById('reactor_background');
      if (!container) return;
      const cRect = container.getBoundingClientRect();
      const fromRect = ui.gridCanvasRenderer.getTileRectInContainer(fromTile.row, fromTile.col, cRect);
      const toRect = ui.gridCanvasRenderer.getTileRectInContainer(toTile.row, toTile.col, cRect);
      const x1 = fromRect.centerX;
      const y1 = fromRect.centerY;
      const x2 = toRect.centerX;
      const y2 = toRect.centerY;
      const size = 12;
      const aura = document.createElement('div');
      aura.className = 'reflector-aura';
      const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
      aura.style.left = `${x1 - size / 2}px`;
      aura.style.top = `${y1 - size / 2}px`;
      aura.style.width = `${size}px`;
      aura.style.height = `${size}px`;
      aura.style.transform = `rotate(${angle}deg)`;
      container.appendChild(aura);
      requestAnimationFrame(() => aura.classList.add('active'));
      setTimeout(() => aura.remove(), 450);
    } catch (_) {}
  }

  emitEP(fromTile) {
    const ui = this.ui;
    try {
      if (!fromTile || !ui.gridCanvasRenderer) return;
      const container = ui.registry?.get?.("PageInit")?.getReactorBackground?.() ?? ui.DOMElements?.reactor_background ?? document.getElementById('reactor_background');
      if (!container) return;
      const cRect = container.getBoundingClientRect();
      const startRect = ui.gridCanvasRenderer.getTileRectInContainer(fromTile.row, fromTile.col, cRect);
      const src = 'img/ui/icons/icon_power.png';
      const img = document.createElement('img');
      img.src = src;
      img.alt = 'ep';
      img.className = 'tile-fx fx-ep';
      const size = 14;
      img.style.width = `${size}px`;
      img.style.height = `${size}px`;
      const startLeft = startRect.centerX - size / 2;
      const startTop = startRect.centerY - size / 2;
      img.style.left = `${startLeft}px`;
      img.style.top = `${startTop}px`;
      container.appendChild(img);
      const epEl = document.getElementById('info_ep_desktop') || document.getElementById('info_ep');
      const valueEl = document.getElementById('info_ep_value_desktop') || document.getElementById('info_ep_value');
      const targetEl = valueEl || epEl;
      requestAnimationFrame(() => {
        if (targetEl) {
          const tRect = targetEl.getBoundingClientRect();
          const endLeft = tRect.left - cRect.left + tRect.width / 2 - size / 2;
          const endTop = tRect.top - cRect.top + tRect.height / 2 - size / 2;
          img.style.left = `${endLeft}px`;
          img.style.top = `${endTop}px`;
          img.style.opacity = '0.2';
        } else {
          img.classList.add('fx-fade-out');
        }
        setTimeout(() => img.remove(), 550);
      });
    } catch (_) {}
  }
}
