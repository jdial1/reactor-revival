import { logger } from "../core/logger.js";
import { getUiElement, getPageReactorWrapper } from "./page-dom.js";
import { applyBodyClassesFromUiState } from "../state/ui-state.js";
import { subscribeKey } from "valtio/vanilla/utils";

const MELTDOWN_BUILDUP_MS = 2500;

export class MeltdownUI {
  constructor(ui) {
    this.ui = ui;
    this._meltdownUnsubs = [];
    this._meltdownDom = null;
    this._buildupTimer = null;
  }

  _resolveMeltdownDom() {
    const ui = this.ui;
    const cached = this._meltdownDom;
    if (cached) {
      const sectionOk = !cached.section || cached.section.isConnected;
      if (sectionOk) return cached;
    }
    const dom = {
      wrapper: getPageReactorWrapper(ui),
      section: getUiElement(ui, "reactor_section"),
    };
    this._meltdownDom = dom;
    return dom;
  }

  subscribeToMeltdownEvents(game) {
    if (!game?.state) return;
    this.cleanup();
    this._resolveMeltdownDom();
    this._meltdownUnsubs.push(subscribeKey(game.state, "melting_down", () => this.updateMeltdownState()));
    let lastMeltdownSeq = game.state.meltdown_seq | 0;
    this._meltdownUnsubs.push(subscribeKey(game.state, "meltdown_seq", (seq) => {
      const n = seq | 0;
      if (n > lastMeltdownSeq && game.state.melting_down) {
        lastMeltdownSeq = n;
        this.startMeltdownBuildup(() => this.explodeAllPartsSequentially?.());
      }
    }));
    this.updateMeltdownState();
  }

  flashExplosionBurst() {
    this._flashExplosionBurst();
  }

  _flashExplosionBurst() {
    const doc = typeof document !== "undefined" ? document : null;
    if (!doc?.body) return;
    const mq = typeof globalThis.matchMedia === "function" ? globalThis.matchMedia("(prefers-reduced-motion: reduce)") : null;
    if (mq?.matches) return;
    const el = doc.createElement("div");
    el.className = "explosion-emf-overlay";
    doc.body.appendChild(el);
    requestAnimationFrame(() => {
      el.classList.add("explosion-emf-overlay--on");
    });
    setTimeout(() => {
      el.remove();
    }, 110);
  }

  cleanup() {
    if (this._meltdownUnsubs?.length) {
      this._meltdownUnsubs.forEach((fn) => { try { fn(); } catch (_) {} });
      this._meltdownUnsubs = [];
    }
    if (this._buildupTimer != null) {
      clearTimeout(this._buildupTimer);
      this._buildupTimer = null;
    }
    if (this.ui?.uiState) this.ui.uiState.meltdown_buildup = false;
  }

  updateMeltdownState() {
    const ui = this.ui;
    if (!ui.game || !ui.game.reactor) return;
    const hasMeltedDown = ui.game.reactor.has_melted_down;
    if (ui.uiState) {
      ui.uiState.is_melting_down = hasMeltedDown;
      applyBodyClassesFromUiState(ui.uiState);
    }
    if (!hasMeltedDown && ui.uiState) {
      ui.uiState.meltdown_buildup = false;
    }

    this.updateProgressBarMeltdownState(hasMeltedDown);
  }

  startMeltdownBuildup(onComplete) {
    const ui = this.ui;
    if (!ui?.uiState) {
      if (typeof onComplete === "function") onComplete();
      return;
    }
    if (this._buildupTimer != null) clearTimeout(this._buildupTimer);
    ui.uiState.meltdown_buildup = true;
    this._buildupTimer = setTimeout(() => {
      this._buildupTimer = null;
      ui.uiState.meltdown_buildup = false;
      if (typeof onComplete === "function") onComplete();
    }, MELTDOWN_BUILDUP_MS);
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
      logger.log("debug", "ui", "All parts exploded!");
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
      logger.log("debug", "ui", "All parts exploded!");
    }, totalExplosionTime);
  }

  updateProgressBarMeltdownState(_isMeltdown) {
  }
}
