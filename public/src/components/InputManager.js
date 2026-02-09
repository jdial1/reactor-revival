import { Hotkeys } from "../utils/hotkeys.js";

export class InputManager {
  constructor(ui) {
    this.ui = ui;
    this.hotkeys = null;
    this.isDragging = false;
    this.lastTileModified = null;
    this.longPressTimer = null;
    this.longPressDuration = 500;
    this._sellingTile = null;
    this._hoveredTile = null;
  }

  setup() {
    if (this.ui.game) {
      this.hotkeys = new Hotkeys(this.ui.game);
    }
  }

  setupReactorEventListeners() {
    const reactor = this.ui.DOMElements.reactor;
    if (!reactor) return;

    let longPressTargetTile = null;
    let pointerMoved = false;
    let pointerDownTileEl = null;
    let startX = 0;
    let startY = 0;
    const MOVE_THRESHOLD = 18;

    const cancelLongPress = () => {
      if (this.longPressTimer) {
        clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
      }
      this._sellingTile = null;
      longPressTargetTile = null;
    };

    const getTileFromEvent = (ev) => {
      const target = ev.target;
      if (target && target === this.ui.gridCanvasRenderer?.getCanvas()) {
        return this.ui.gridCanvasRenderer.hitTest(ev.clientX, ev.clientY);
      }
      return null;
    };

    const pointerDownHandler = (e) => {
      if ((e.pointerType === "mouse" && e.button !== 0) || e.button > 0) return;
      const tile = getTileFromEvent(e);
      if (!tile?.enabled) return;
      pointerDownTileEl = tile;
      e.preventDefault();
      this.isDragging = true;
      this.lastTileModified = tile;
      pointerMoved = false;
      startX = e.clientX;
      startY = e.clientY;
      const hasPart = tile.part;
      const noModifiers = !e.ctrlKey && !e.altKey && !e.shiftKey;
      if (hasPart && noModifiers) {
        longPressTargetTile = tile;
        this._sellingTile = tile;
        this.longPressTimer = setTimeout(() => {
          this.longPressTimer = null;
          if (longPressTargetTile) {
            this._sellingTile = null;
            longPressTargetTile.clearPart(true);
            this.ui.game.reactor.updateStats();
            if (this.ui.game?.audio) this.ui.game.audio.play("sell");
          }
          this.isDragging = false;
        }, this.longPressDuration);
      }
      const pointerMoveHandler = async (e_move) => {
        const dx = e_move.clientX - startX;
        const dy = e_move.clientY - startY;
        if (
          !pointerMoved &&
          (Math.abs(dx) > MOVE_THRESHOLD || Math.abs(dy) > MOVE_THRESHOLD)
        ) {
          pointerMoved = true;
          cancelLongPress();
        }
        if (!this.isDragging) return;
        const moveTile = getTileFromEvent(e_move);
        if (moveTile && moveTile !== this.lastTileModified) {
          await this.handleGridInteraction(moveTile, e_move);
          this.lastTileModified = moveTile;
        }
      };
      const pointerUpHandler = async (e_up) => {
        if (!pointerMoved && this.isDragging && pointerDownTileEl) {
          cancelLongPress();
          await this.handleGridInteraction(pointerDownTileEl, e_up || e);
        } else if (this.longPressTimer) {
          cancelLongPress();
        }
        if (this.isDragging) {
          this.isDragging = false;
          this.lastTileModified = null;
          this.ui.game.reactor.updateStats();
          this.ui.stateManager.setVar("current_money", this.ui.game.current_money);
        }
        window.removeEventListener("pointermove", pointerMoveHandler);
        window.removeEventListener("pointerup", pointerUpHandler);
        window.removeEventListener("pointercancel", pointerUpHandler);
        pointerDownTileEl = null;
      };
      window.addEventListener("pointermove", pointerMoveHandler);
      window.addEventListener("pointerup", pointerUpHandler);
      window.addEventListener("pointercancel", pointerUpHandler);
    };

    const eventTarget = this.ui.gridCanvasRenderer?.getCanvas() || reactor;
    eventTarget.addEventListener("pointerdown", pointerDownHandler);
    eventTarget.addEventListener("contextmenu", async (e) => {
      e.preventDefault();
      const tile = this.ui.gridCanvasRenderer
        ? this.ui.gridCanvasRenderer.hitTest(e.clientX, e.clientY)
        : null;
      await this.handleGridInteraction(tile, e);
    });

    eventTarget.addEventListener(
      "mousemove",
      (e) => {
        const tile = this.ui.gridCanvasRenderer
          ? this.ui.gridCanvasRenderer.hitTest(e.clientX, e.clientY)
          : null;
        this._hoveredTile = tile?.enabled ? tile : null;
        if (
          tile?.part &&
          this.ui.game?.tooltip_manager &&
          !this.isDragging &&
          this.ui.help_mode_active
        ) {
          this.ui.game.tooltip_manager.show(tile.part, tile, false);
        }
      },
      true
    );

    eventTarget.addEventListener("mouseleave", () => {
      this._hoveredTile = null;
      if (this.ui.game?.tooltip_manager && this.ui.help_mode_active) {
        this.ui.game.tooltip_manager.hide();
      }
    }, true);
  }

  setupSegmentHighlight() {
    const reactorElement = this.ui.DOMElements.reactor;
    if (!reactorElement) return;

    const heatComponentCategories = [
      "vent",
      "heat_exchanger",
      "heat_inlet",
      "heat_outlet",
      "coolant_cell",
      "reactor_plating",
    ];

    reactorElement.addEventListener("pointermove", (e) => {
      const clickedPart = this.ui.stateManager.getClickedPart();
      if (
        !clickedPart ||
        !heatComponentCategories.includes(clickedPart.category)
      ) {
        this.ui.clearSegmentHighlight();
        return;
      }
      const tile = this.ui.gridCanvasRenderer
        ? this.ui.gridCanvasRenderer.hitTest(e.clientX, e.clientY)
        : null;
      if (tile) {
        const currentSegment =
          this.ui.game.engine.heatManager.getSegmentForTile(tile);

        if (currentSegment !== this.ui.highlightedSegment) {
          this.ui.clearSegmentHighlight();

          if (currentSegment) {
            for (const component of currentSegment.components) {
              component.highlight();
            }
            this.ui.highlightedSegment = currentSegment;
          }
        }
      }
    });

    reactorElement.addEventListener("pointerleave", () => {
      this.ui.clearSegmentHighlight();
    });
  }

  async handleGridInteraction(tile, event) {
    if (!tile) return;

    if (
      this.ui.game &&
      this.ui.game.reactor &&
      this.ui.game.reactor.has_melted_down
    ) {
      return;
    }

    const startTile = tile;
    const isRightClick =
      (event.pointerType === "mouse" && event.button === 2) ||
      event.type === "contextmenu";
    const clicked_part = this.ui.stateManager.getClickedPart();
    if (!this.hotkeys) this.setup();
    const tilesToModify =
      this.hotkeys && typeof this.hotkeys.getTiles === "function"
        ? [...this.hotkeys.getTiles(startTile, event)]
        : [startTile];
    let soundPlayed = false;

    const isMobile = window.innerWidth <= 900;
    if (isMobile && !isRightClick && startTile.part && !clicked_part) {
      this.ui.showContextModal(startTile);
      return;
    }

    for (const tile of tilesToModify) {
      if (isRightClick) {
        if (tile.part && tile.part.id && !tile.part.isSpecialTile) {
          this.ui.game.sellPart(tile);
          this.ui.gridCanvasRenderer?.markTileDirty(tile.row, tile.col);
          if (!soundPlayed && this.ui.game?.audio) {
            this.ui.game.audio.play("sell");
            soundPlayed = true;
          }
        }
      } else {
        if (tile.part && this.ui.help_mode_active) {
          if (this.ui.game?.tooltip_manager) {
            this.ui.game.tooltip_manager.show(tile.part, tile, true);
          }
          return;
        }

        if (clicked_part) {
          const money = this.ui.game.current_money;
          const canAfford = money != null && typeof money.gte === "function"
            ? money.gte(clicked_part.cost)
            : Number(money) >= Number(clicked_part.cost);
          if (canAfford) {
            this.ui.game._current_money =
              this.ui.game._current_money.sub(clicked_part.cost);
            const partPlaced = await tile.setPart(clicked_part);
            if (partPlaced) {
              this.ui.gridCanvasRenderer?.markTileDirty(tile.row, tile.col);
              if (this.ui.lightVibration) {
                this.ui.lightVibration();
              }
              soundPlayed = true;
              if (this.ui.game?.emit)
                this.ui.game.emit("partPlaced", {
                  part: clicked_part,
                  tile,
                });
            } else {
              this.ui.game._current_money =
                this.ui.game._current_money.add(clicked_part.cost);
              if (!soundPlayed && this.ui.game?.audio) {
                const pan = this.ui.game.calculatePan
                  ? this.ui.game.calculatePan(tile.col)
                  : 0;
                this.ui.game.audio.play("error", null, pan);
                soundPlayed = true;
              }
            }
          } else {
            if (!soundPlayed && this.ui.game?.audio) {
              const pan = this.ui.game.calculatePan
                ? this.ui.game.calculatePan(tile.col)
                : 0;
              this.ui.game.audio.play("error", null, pan);
              soundPlayed = true;
            }
          }
        }
      }
    }
  }

  getHoveredTile() {
    return this._hoveredTile ?? null;
  }

  getSellingTile() {
    return this._sellingTile ?? null;
  }
}
