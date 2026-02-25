import { MOBILE_BREAKPOINT_PX } from "../../core/constants.js";
import { updateDecimal } from "../../core/store.js";

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
    if (!tile || !game || !ui) return;
    if (game.reactor?.has_melted_down) return;

    const startTile = tile;
    const isRightClick =
      (event.pointerType === "mouse" && event.button === 2) ||
      event.type === "contextmenu";
    const clicked_part = ui.stateManager.getClickedPart();

    const inputManager = this.api.getInputManager?.();
    if (inputManager && !inputManager.hotkeys) inputManager.setup();

    const tilesToModify =
      inputManager?.hotkeys && typeof inputManager.hotkeys.getTiles === "function"
        ? [...inputManager.hotkeys.getTiles(startTile, event)]
        : [startTile];

    let soundPlayed = false;
    const isMobile = window.innerWidth <= MOBILE_BREAKPOINT_PX;

    if (isMobile && !isRightClick && startTile.part && !clicked_part) {
      game.emit("showContextModal", { tile: startTile });
      return;
    }

    for (const t of tilesToModify) {
      if (isRightClick) {
        if (t.part && t.part.id && !t.part.isSpecialTile) {
          game.sellPart(t);
          ui.gridCanvasRenderer?.markTileDirty(t.row, t.col);
          if (!soundPlayed && game.audio) {
            game.audio.play("sell");
            soundPlayed = true;
          }
        }
      } else {
        if (t.part && ui.help_mode_active) {
          if (game.tooltip_manager) {
            game.tooltip_manager.show(t.part, t, true);
          }
          return;
        }

        if (clicked_part) {
          const money = game.state.current_money;
          const canAfford = money != null && typeof money.gte === "function"
            ? money.gte(clicked_part.cost)
            : Number(money) >= Number(clicked_part.cost);

          if (canAfford) {
            if (!game.isSandbox) {
              updateDecimal(game.state, "current_money", (d) => d.sub(clicked_part.cost));
            }
            const partPlaced = await t.setPart(clicked_part);

            if (partPlaced) {
              ui.gridCanvasRenderer?.markTileDirty(t.row, t.col);
              if (ui.deviceFeatures?.lightVibration) {
                ui.deviceFeatures.lightVibration();
              }
              soundPlayed = true;
              if (game.emit) {
                game.emit("partPlaced", { part: clicked_part, tile: t });
              }
            } else {
              if (!game.isSandbox) {
                updateDecimal(game.state, "current_money", (d) => d.add(clicked_part.cost));
              }
              if (!soundPlayed && game.audio) {
                const pan = game.calculatePan ? game.calculatePan(t.col) : 0;
                game.audio.play("error", null, pan);
                soundPlayed = true;
              }
            }
          } else {
            if (!soundPlayed && game.audio) {
              const pan = game.calculatePan ? game.calculatePan(t.col) : 0;
              game.audio.play("error", null, pan);
              soundPlayed = true;
            }
          }
        }
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
