import { logger } from "../../utils/logger.js";

export class MeltdownUI {
  constructor(ui) {
    this.ui = ui;
    this._meltdownBuildupRafId = null;
    this._meltdownHandler = null;
    this._meltdownResolvedHandler = null;
  }

  subscribeToMeltdownEvents(game) {
    if (!game?.on || !game?.off) return;
    this._meltdownHandler = () => this.updateMeltdownState();
    this._meltdownResolvedHandler = () => this.updateMeltdownState();
    game.on("meltdown", this._meltdownHandler);
    game.on("meltdownResolved", this._meltdownResolvedHandler);
  }

  cleanup() {
    if (this.ui?.game?.off && this._meltdownHandler) {
      this.ui.game.off("meltdown", this._meltdownHandler);
      this.ui.game.off("meltdownResolved", this._meltdownResolvedHandler);
    }
    this._meltdownHandler = null;
    this._meltdownResolvedHandler = null;
    if (this._meltdownBuildupRafId != null) {
      cancelAnimationFrame(this._meltdownBuildupRafId);
      this._meltdownBuildupRafId = null;
    }
  }

  updateMeltdownState() {
    const ui = this.ui;
    if (typeof document === "undefined" || !document.body) return;
    if (!ui.game || !ui.game.reactor) return;
    const hasMeltedDown = ui.game.reactor.has_melted_down;
    const cl = document.body.classList;
    const isMeltdownClassPresent = cl && typeof cl.contains === "function" && cl.contains("reactor-meltdown");
    const meltdownBanner = document.getElementById("meltdown_banner");

    if (meltdownBanner) {
      meltdownBanner.classList.toggle("hidden", !hasMeltedDown);
    }

    if (hasMeltedDown && !isMeltdownClassPresent) {
      document.body.classList.add("reactor-meltdown");
    } else if (!hasMeltedDown && isMeltdownClassPresent) {
      document.body.classList.remove("reactor-meltdown");
    }
    if (!hasMeltedDown) {
      if (this._meltdownBuildupRafId != null) {
        cancelAnimationFrame(this._meltdownBuildupRafId);
        this._meltdownBuildupRafId = null;
      }
      const wrapper = ui.DOMElements.reactor_wrapper || document.getElementById("reactor_wrapper");
      if (wrapper) wrapper.style.transform = "";
      const vignetteEl = document.getElementById("meltdown_vignette");
      if (vignetteEl) {
        vignetteEl.style.opacity = "0";
        vignetteEl.style.display = "none";
      }
      const strobeEl = document.getElementById("meltdown_strobe");
      if (strobeEl) {
        strobeEl.style.opacity = "0";
        strobeEl.style.display = "none";
      }
    }

    this.updateProgressBarMeltdownState(hasMeltedDown);

    if (hasMeltedDown) {
      const resetReactorBtn = document.getElementById("reset_reactor_btn");
      const clearHeatSandboxBtn = document.getElementById("clear_heat_sandbox_btn");
      const isSandbox = ui.game.isSandbox;

      if (isSandbox && clearHeatSandboxBtn) {
        if (!clearHeatSandboxBtn.hasAttribute("data-listener-added")) {
          clearHeatSandboxBtn.addEventListener("click", () => this.clearHeatAndMeltdownSandbox());
          clearHeatSandboxBtn.setAttribute("data-listener-added", "true");
        }
      } else if (resetReactorBtn && !resetReactorBtn.hasAttribute("data-listener-added")) {
        resetReactorBtn.addEventListener("click", async () => await ui.resetReactor());
        resetReactorBtn.setAttribute("data-listener-added", "true");
      }
    }
  }

  clearHeatAndMeltdownSandbox() {
    const ui = this.ui;
    if (!ui.game?.isSandbox || !ui.game.reactor) return;
    ui.game.reactor.current_heat = 0;
    ui.game.reactor.current_power = 0;
    ui.stateManager.setVar("current_heat", 0);
    ui.stateManager.setVar("current_power", 0);
    ui.game.reactor.clearMeltdownState();
    if (ui.game.engine) ui.game.engine.start();
  }

  startMeltdownBuildup(onComplete) {
    const ui = this.ui;
    const BUILDUP_MS = 2500;
    const wrapper = ui.DOMElements.reactor_wrapper || document.getElementById("reactor_wrapper");
    const section = document.getElementById("reactor_section");
    if (ui.particleSystem && wrapper) {
      const rect = wrapper.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      ui.particleSystem.createCriticalBuildupEmbers(cx, cy);
    }
    let vignetteEl = document.getElementById("meltdown_vignette");
    if (!vignetteEl && section) {
      vignetteEl = document.createElement("div");
      vignetteEl.id = "meltdown_vignette";
      vignetteEl.setAttribute("aria-hidden", "true");
      section.appendChild(vignetteEl);
    }
    if (vignetteEl) vignetteEl.style.display = "block";
    let strobeEl = document.getElementById("meltdown_strobe");
    if (!strobeEl && section) {
      strobeEl = document.createElement("div");
      strobeEl.id = "meltdown_strobe";
      strobeEl.setAttribute("aria-hidden", "true");
      strobeEl.style.cssText =
        "position:absolute;inset:0;z-index:26;pointer-events:none;border-radius:8px;background:rgba(255,0,0,0.4);mix-blend-mode:overlay;opacity:0;";
      section.appendChild(strobeEl);
    }
    if (strobeEl) strobeEl.style.display = "block";
    const start = typeof performance !== "undefined" ? performance.now() : Date.now();
    const tick = () => {
      const elapsed = (typeof performance !== "undefined" ? performance.now() : Date.now()) - start;
      const t = Math.min(1, elapsed / BUILDUP_MS);
      const intensity = t * 8;
      const shakeX = (Math.random() - 0.5) * 2 * intensity;
      const shakeY = (Math.random() - 0.5) * 2 * intensity;
      if (wrapper) wrapper.style.transform = `translate(${shakeX}px, ${shakeY}px)`;
      if (vignetteEl) vignetteEl.style.opacity = String(t * 0.9);
      if (strobeEl) {
        const pulseIntervalMs = Math.max(40, 220 - 180 * t);
        const strobePhase = (elapsed / pulseIntervalMs) % 1;
        strobeEl.style.opacity = strobePhase < 0.5 ? "0.38" : "0";
      }
      if (t < 1) {
        this._meltdownBuildupRafId = requestAnimationFrame(tick);
      } else {
        if (wrapper) wrapper.style.transform = "";
        if (vignetteEl) {
          vignetteEl.style.opacity = "0";
          vignetteEl.style.display = "none";
        }
        if (strobeEl) {
          strobeEl.style.opacity = "0";
          strobeEl.style.display = "none";
        }
        this._meltdownBuildupRafId = null;
        if (typeof onComplete === "function") onComplete();
      }
    };
    this._meltdownBuildupRafId = requestAnimationFrame(tick);
  }

  explodeAllPartsSequentially(forceAnimate = false) {
    const ui = this.ui;
    const tilesWithParts = ui.game.tileset.active_tiles_list.filter((tile) => tile.part);
    if (tilesWithParts.length === 0) return;

    if (
      !forceAnimate &&
      typeof process !== "undefined" &&
      (process.env.NODE_ENV === "test" || process.env.VITEST === "true")
    ) {
      tilesWithParts.forEach((tile) => {
        if (tile.part) tile.clearPart();
      });
      logger.log('debug', 'ui', 'All parts exploded!');
      return;
    }

    const shuffledTiles = [...tilesWithParts].sort(() => Math.random() - 0.5);
    shuffledTiles.forEach((tile, index) => {
      setTimeout(() => {
        if (tile.part && ui.game.engine) ui.game.engine.handleComponentExplosion(tile);
      }, index * 150);
    });

    const totalExplosionTime = (shuffledTiles.length - 1) * 150 + 600;
    setTimeout(() => {
      logger.log('debug', 'ui', 'All parts exploded!');
      const r = ui.game.reactor;
      if (r.decompression_enabled && r.current_heat <= 2 * r.max_heat && r.has_melted_down) {
        r.clearMeltdownState();
        ui.stateManager.setVar("current_heat", r.current_heat);
        if (ui.heatVisualsUI) ui.heatVisualsUI.updateHeatVisuals();
        if (ui.game.engine) ui.game.engine.start();
        this._showDecompressionSavedToast();
      }
    }, totalExplosionTime);
  }

  _showDecompressionSavedToast() {
    const existing = document.querySelector(".decompression-saved-toast");
    if (existing) existing.remove();
    const toast = document.createElement("div");
    toast.className = "decompression-saved-toast";
    toast.setAttribute("role", "status");
    toast.textContent = "Explosive decompression saved the reactor!";
    toast.style.cssText =
      "position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#1b5e20;border:2px solid #4caf50;border-radius:8px;padding:12px 20px;z-index:10000;font-family:'Minecraft',monospace;color:#fff;font-weight:bold;box-shadow:0 4px 12px rgba(0,0,0,0.4);opacity:0;transition:opacity 0.2s ease-out;";
    requestAnimationFrame(() => {
      toast.style.opacity = "1";
    });
    document.body.appendChild(toast);
    setTimeout(() => {
      if (toast.parentNode) {
        toast.style.opacity = "0";
        setTimeout(() => toast.remove(), 220);
      }
    }, 3500);
  }

  updateProgressBarMeltdownState(isMeltdown) {
    const ui = this.ui;
    const desktopPowerElement = document.querySelector(".info-bar-desktop .info-item.power");
    const desktopHeatElement = document.querySelector(".info-bar-desktop .info-item.heat");
    if (desktopPowerElement) desktopPowerElement.classList.toggle("meltdown", isMeltdown);
    if (desktopHeatElement) desktopHeatElement.classList.toggle("meltdown", isMeltdown);
    const mobilePowerElement = document.querySelector("#info_bar .info-row.info-main .info-item.power");
    const mobileHeatElement = document.querySelector("#info_bar .info-row.info-main .info-item.heat");
    if (mobilePowerElement) mobilePowerElement.classList.toggle("meltdown", isMeltdown);
    if (mobileHeatElement) mobileHeatElement.classList.toggle("meltdown", isMeltdown);
    const mobileEl = document.getElementById("info_money");
    const desktopEl = document.getElementById("info_money_desktop");
    if (isMeltdown) {
      if (mobileEl) mobileEl.textContent = "☢️";
      if (desktopEl) desktopEl.textContent = "☢️";
    } else {
    }
  }
}
