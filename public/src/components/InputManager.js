import { Hotkeys } from "../utils/hotkeys.js";
import { tileKey, resolveTileFromKey } from "../core/uiStore.js";

export class InputHandler {
  constructor(ui) {
    this.ui = ui;
    this.hotkeys = null;
    this.lastTileModified = null;
    this.longPressTimer = null;
    this.longPressDuration = 500;
    this._reactorEventTarget = null;
    this._reactorHandlers = null;
  }

  get isDragging() {
    return this.ui?.uiState?.interaction?.isDragging ?? false;
  }

  setup() {
    if (this.ui.game) {
      this.hotkeys = new Hotkeys(this.ui.game);
    }
  }

  _createLongPressCallback(state) {
    return () => {
      this.longPressTimer = null;
      if (state.longPressTargetTile) {
        if (this.ui?.uiState?.interaction) this.ui.uiState.interaction.sellingTileKey = null;
        state.longPressTargetTile.sellPart();
        this.ui.game.reactor.updateStats();
        if (this.ui.game?.audio) this.ui.game.audio.play("sell");
      }
      if (this.ui?.uiState?.interaction) this.ui.uiState.interaction.isDragging = false;
    };
  }

  _scheduleLongPressForTile(state, tile) {
    state.longPressTargetTile = tile;
    if (this.ui?.uiState?.interaction) this.ui.uiState.interaction.sellingTileKey = tileKey(tile.row, tile.col);
    this.longPressTimer = setTimeout(
      this._createLongPressCallback(state),
      this.longPressDuration
    );
  }

  _createPointerMoveHandler(state, getTileFromEvent, cancelLongPress, moveThreshold) {
    return async (e_move) => {
      const dx = e_move.clientX - state.startX;
      const dy = e_move.clientY - state.startY;
      if (
        !state.pointerMoved &&
        (Math.abs(dx) > moveThreshold || Math.abs(dy) > moveThreshold)
      ) {
        state.pointerMoved = true;
        cancelLongPress();
      }
      if (!this.isDragging) return;
      const moveTile = getTileFromEvent(e_move);
      if (moveTile && moveTile !== this.lastTileModified) {
        await this.ui.gridController.handleGridInteraction(moveTile, e_move);
        this.lastTileModified = moveTile;
      }
    };
  }

  _createPointerUpHandler(state, initialEvent, getTileFromEvent, cancelLongPress) {
    return async (e_up) => {
      if (!state.pointerMoved && this.isDragging && state.pointerDownTileEl) {
        cancelLongPress();
        await this.ui.gridController.handleGridInteraction(state.pointerDownTileEl, e_up || initialEvent);
      } else if (this.longPressTimer) {
        cancelLongPress();
      }
      if (this.isDragging) {
        if (this.ui?.uiState?.interaction) this.ui.uiState.interaction.isDragging = false;
        if (this.ui?.uiState?.interaction) this.ui.uiState.interaction.sellingTileKey = null;
        this.lastTileModified = null;
        this.ui.game.reactor.updateStats();
      }
      state.cleanup();
      state.pointerDownTileEl = null;
    };
  }

  _buildPointerState(tile, e) {
    return {
      pointerDownTileEl: tile,
      pointerMoved: false,
      startX: e.clientX,
      startY: e.clientY,
      longPressTargetTile: null,
      cleanup: null,
    };
  }

  _getCancelLongPress(state) {
    return () => {
      if (this.longPressTimer) {
        clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
      }
      if (this.ui?.uiState?.interaction) this.ui.uiState.interaction.sellingTileKey = null;
      state.longPressTargetTile = null;
    };
  }

  _attachPointerListeners(state, initialEvent, getTileFromEvent, cancelLongPress, moveThreshold) {
    const pointerMoveHandler = this._createPointerMoveHandler(state, getTileFromEvent, cancelLongPress, moveThreshold);
    const pointerUpHandler = this._createPointerUpHandler(state, initialEvent, getTileFromEvent, cancelLongPress);
    state.cleanup = () => {
      window.removeEventListener("pointermove", pointerMoveHandler);
      window.removeEventListener("pointerup", pointerUpHandler);
      window.removeEventListener("pointercancel", pointerUpHandler);
    };
    window.addEventListener("pointermove", pointerMoveHandler);
    window.addEventListener("pointerup", pointerUpHandler);
    window.addEventListener("pointercancel", pointerUpHandler);
  }

  setupReactorEventListeners() {
    const reactor = this.ui.registry?.get?.("PageInit")?.getReactor?.() ?? this.ui.DOMElements?.reactor;
    if (!reactor) return;

    const MOVE_THRESHOLD = 18;

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
      const state = this._buildPointerState(tile, e);
      const cancelLongPress = this._getCancelLongPress(state);
      e.preventDefault();
      if (this.ui?.uiState?.interaction) this.ui.uiState.interaction.isDragging = true;
      this.lastTileModified = tile;
      if (tile.part && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        this._scheduleLongPressForTile(state, tile);
      }
      this._attachPointerListeners(state, e, getTileFromEvent, cancelLongPress, MOVE_THRESHOLD);
    };

    const eventTarget = this.ui.gridCanvasRenderer?.getCanvas() || reactor;
    const contextMenuHandler = async (e) => {
      e.preventDefault();
      const tile = this.ui.gridCanvasRenderer
        ? this.ui.gridCanvasRenderer.hitTest(e.clientX, e.clientY)
        : null;
      await this.ui.gridController.handleGridInteraction(tile, e);
    };
    const mouseMoveHandler = (e) => {
      const tile = this.ui.gridCanvasRenderer
        ? this.ui.gridCanvasRenderer.hitTest(e.clientX, e.clientY)
        : null;
      const next = tile?.enabled ? tile : null;
      if (this.ui?.uiState?.interaction) {
        this.ui.uiState.interaction.hoveredTileKey = next ? tileKey(next.row, next.col) : null;
      }
      if (
        tile?.part &&
        this.ui.game?.tooltip_manager &&
        !this.isDragging &&
        this.ui.help_mode_active
      ) {
        this.ui.game.tooltip_manager.show(tile.part, tile, false);
      }
    };
    const mouseLeaveHandler = () => {
      if (this.ui?.uiState?.interaction) this.ui.uiState.interaction.hoveredTileKey = null;
      if (this.ui?.game?.tooltip_manager && this.ui?.help_mode_active) {
        this.ui.game.tooltip_manager.hide();
      }
    };
    this._reactorEventTarget = eventTarget;
    this._reactorHandlers = {
      pointerdown: pointerDownHandler,
      contextmenu: contextMenuHandler,
      mousemove: mouseMoveHandler,
      mouseleave: mouseLeaveHandler,
    };
    eventTarget.addEventListener("pointerdown", pointerDownHandler);
    eventTarget.addEventListener("contextmenu", contextMenuHandler);
    eventTarget.addEventListener("mousemove", mouseMoveHandler, true);
    eventTarget.addEventListener("mouseleave", mouseLeaveHandler, true);
  }

  teardownReactorEventListeners() {
    if (!this._reactorEventTarget || !this._reactorHandlers) return;
    const t = this._reactorEventTarget;
    const h = this._reactorHandlers;
    t.removeEventListener("pointerdown", h.pointerdown);
    t.removeEventListener("contextmenu", h.contextmenu);
    t.removeEventListener("mousemove", h.mousemove, true);
    t.removeEventListener("mouseleave", h.mouseleave, true);
    this._reactorEventTarget = null;
    this._reactorHandlers = null;
  }

  setupSegmentHighlight() {
    const reactorElement = this.ui.registry?.get?.("PageInit")?.getReactor?.() ?? this.ui.DOMElements?.reactor;
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
        this.ui.gridInteractionUI.clearSegmentHighlight();
        return;
      }
      const tile = this.ui.gridCanvasRenderer
        ? this.ui.gridCanvasRenderer.hitTest(e.clientX, e.clientY)
        : null;
      if (tile) {
        const currentSegment =
          this.ui.game.engine.heatManager.getSegmentForTile(tile);

        if (currentSegment !== this.ui.gridInteractionUI.highlightedSegment) {
          this.ui.gridInteractionUI.clearSegmentHighlight();

          if (currentSegment) {
            for (const component of currentSegment.components) {
              component.highlight();
            }
            this.ui.gridInteractionUI.highlightedSegment = currentSegment;
          }
        }
      }
    });

    reactorElement.addEventListener("pointerleave", () => {
      this.ui.gridInteractionUI.clearSegmentHighlight();
    });
  }

  getHoveredTile() {
    const key = this.ui?.uiState?.interaction?.hoveredTileKey;
    return resolveTileFromKey(this.ui?.game, key);
  }

  getSellingTile() {
    const key = this.ui?.uiState?.interaction?.sellingTileKey;
    return resolveTileFromKey(this.ui?.game, key);
  }
}
