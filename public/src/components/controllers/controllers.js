import { html, render } from "lit-html";

import { classMap, styleMap, MOBILE_BREAKPOINT_PX } from "../../utils.js";

import { ReactiveLitComponent } from "../reactive-lit-component.js";

import { subscribeKey, preferences, actions } from "../../store.js";



export class GridController {

  constructor(api) {

    this.api = api;

  }



  getHighlightedTiles() {

    return this.api.getHighlightedSegment?.()?.components ?? [];

  }



  getSellingTile() {

    return this.api.getInputManager?.()?.getSellingTile?.() ?? null;

  }



  getHoveredTile() {

    return this.api.getInputManager?.()?.getHoveredTile?.() ?? null;

  }



  async handleGridInteraction(tile, event) {

    const game = this.api.getGame?.();

    const ui = this.api.getUI?.();

    if (!tile || !game || !ui || game.reactor?.has_melted_down) return;



    const isSellAction = event.type === "longpress";

    const clicked_part = ui.stateManager.getClickedPart();

    const inputManager = this.api.getInputManager?.();

    if (inputManager && !inputManager.hotkeys) inputManager.setup();



    const tilesToModify =

      inputManager?.hotkeys && typeof inputManager.hotkeys.getTiles === "function"

        ? [...inputManager.hotkeys.getTiles(tile, event)]

        : [tile];



    const isMobile = window.innerWidth <= MOBILE_BREAKPOINT_PX;

    if (isMobile && !isSellAction && tile.part && !clicked_part) {

      game.emit("showContextModal", { tile });

      return;

    }



    if (!isSellAction && ui.help_mode_active) {

      const t0 = tilesToModify[0];

      const helpTargetPart = t0?.part ?? clicked_part;

      if (helpTargetPart && game.tooltip_manager) game.tooltip_manager.show(helpTargetPart, t0, true);

      return;

    }



    const soundPlayedRef = { v: false };

    const eng = game.engine;

    const placementTiles = [];



    for (const t of tilesToModify) {

      if (game.blueprintPlanner?.active) {

        if (isSellAction) {

          game.setBlueprintPlannerSlot(t.row, t.col, null);

          ui.gridCanvasRenderer?.markTileDirty(t.row, t.col);

        } else {

          const partId = clicked_part?.id ?? null;

          if (partId) {

            const part = game.partset?.getPartById?.(partId);

            if (!part) continue;

            const cur = game.getBlueprintPlannerPartId(t.row, t.col);

            const id = part.id;

            if (cur === id) game.setBlueprintPlannerSlot(t.row, t.col, null);

            else game.setBlueprintPlannerSlot(t.row, t.col, id);

            ui.gridCanvasRenderer?.markTileDirty(t.row, t.col);

            if (!soundPlayedRef.v) {

              actions.enqueueEffect(game, { kind: "sfx", id: "placement", subtype: null, pan: 0, context: "reactor" });

              soundPlayedRef.v = true;

            }

          }

        }

        continue;

      }



      if (isSellAction && t.part && t.part.id && !t.part.isSpecialTile) {

        game.sellPart(t);

        ui.gridCanvasRenderer?.markTileDirty(t.row, t.col);

        soundPlayedRef.v = true;

        continue;

      }



      if (!clicked_part) continue;

      placementTiles.push(t);

    }

    if (placementTiles.length && eng) {

      for (let pi = 0; pi < placementTiles.length; pi++) {

        const t = placementTiles[pi];

        game.state.intent_queue.push({

          action: "PLACE_PART",

          payload: { row: t.row, col: t.col, partId: clicked_part.id },

        });

      }

      const { placed } = await eng.consumeIntentQueueAsync();

      if (placed.length) {

        soundPlayedRef.v = true;

        if (ui.deviceFeatures?.lightVibration) ui.deviceFeatures.lightVibration();

      }

      for (let pj = 0; pj < placed.length; pj++) {

        const p = placed[pj];

        ui.gridCanvasRenderer?.markTileDirty(p.row, p.col);

        game.emit?.("partPlaced", { part: p.part, tile: game.tileset.getTile(p.row, p.col) });

      }

    }

  }



  spawnTileIcon(kind, fromTile, toTile = null) {

    this.api.spawnTileIcon?.(kind, fromTile, toTile);

  }



  blinkVent(tile) {

    this.api.blinkVent?.(tile);

  }



  clearAllActiveAnimations() {

    this.api.clearAllActiveAnimations?.();

  }



  getAnimationStatus() {

    return this.api.getAnimationStatus?.() ?? { activeVentRotors: 0, activeTileIcons: 0, totalActiveAnimations: 0 };

  }



  clearReactorHeat() {

    this.api.clearReactorHeat?.();

  }



  pulseReflector(fromTile, toTile) {

    this.api.pulseReflector?.(fromTile, toTile);

  }



  emitEP(fromTile) {

    this.api.emitEP?.(fromTile);

  }

}



export class AudioController {

  constructor(api) {

    this.api = api;

    this._unsub = [];

  }



  attach(game) {

    if (!game || this._attached) return;

    this._attached = true;

    const audio = this.api.getAudioService?.();

    if (audio) game.audio = audio;

    const onPartPlaced = () => game.audio?.trigger?.("placement");

    if (game.on) {

      game.on("partPlaced", onPartPlaced);

      this._unsub.push(() => game.off?.("partPlaced", onPartPlaced));

    }

    const ui = this.api.getUI?.();

    if (ui?.uiState && game.audio) {

      ui.uiState.audio_muted = !!preferences.mute;

      ui.uiState.volume_master = preferences.volumeMaster ?? 1;

      ui.uiState.volume_effects = preferences.volumeEffects ?? 1;

      ui.uiState.volume_alerts = preferences.volumeAlerts ?? 1;

      ui.uiState.volume_system = preferences.volumeSystem ?? 1;

      ui.uiState.volume_ambience = preferences.volumeAmbience ?? 1;

      const volumeKeys = ["volume_master", "volume_effects", "volume_alerts", "volume_system", "volume_ambience"];

      const prefMap = { volume_master: "volumeMaster", volume_effects: "volumeEffects", volume_alerts: "volumeAlerts", volume_system: "volumeSystem", volume_ambience: "volumeAmbience" };

      const audioMap = { volume_master: "master", volume_effects: "effects", volume_alerts: "alerts", volume_system: "system", volume_ambience: "ambience" };

      volumeKeys.forEach((k) => {

        this._unsub.push(subscribeKey(ui.uiState, k, () => {

          const v = ui.uiState[k];

          if (v != null && preferences) preferences[prefMap[k]] = v;

          game.audio?.setVolume?.(audioMap[k], v ?? 1);

        }));

      });

      this._unsub.push(subscribeKey(ui.uiState, "audio_muted", () => {

        game.audio?.toggleMute?.(ui.uiState.audio_muted);

        if (preferences) preferences.mute = ui.uiState.audio_muted;

      }));

    }

  }



  detach(game) {

    this._unsub.forEach((fn) => { try { fn(); } catch (_) {} });

    this._unsub.length = 0;

    if (game) game.audio = null;

    this._attached = false;

  }

}

