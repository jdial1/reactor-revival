import { tileKey, resolveTileFromKey } from "../state.js";

class Hotkeys {
  constructor(game) { this.game = game; }
  *getTiles(tile, event) {
    if (!this.game) return;
    const { shiftKey, ctrlKey, altKey } = event;
    if (ctrlKey && altKey) yield* this.checker(tile);
    else if (ctrlKey) yield* this.row(tile);
    else if (altKey) yield* this.column(tile);
    else if (shiftKey && tile.part) yield* this.fillSame(tile.part);
    else yield tile;
  }
  *row(tile)          { for (let c = 0; c < this.game.cols; c++) { const t = this.game.tileset.getTile(tile.row, c); if (t?.enabled) yield t; } }
  *column(tile)       { for (let r = 0; r < this.game.rows; r++) { const t = this.game.tileset.getTile(r, tile.col); if (t?.enabled) yield t; } }
  *checker(startTile) { const startIsOdd = (startTile.row + startTile.col) % 2; for (const tile of this.game.tileset.active_tiles_list) { if ((tile.row + tile.col) % 2 === startIsOdd) yield tile; } }
  *fillSame(part)     { for (const tile of this.game.tileset.active_tiles_list) { if (tile.part === part) yield tile; } }
}

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

  _setInteractionState(patch) {
    const interaction = this.ui?.uiState?.interaction;
    if (!interaction) return;
    this.ui.uiState.interaction = { ...interaction, ...patch };
  }

  _createLongPressCallback(state) {
    return () => {
      this.longPressTimer = null;
      if (state.longPressTargetTile) {
        this._setInteractionState({ sellingTileKey: null });
        void this.ui.gridController.handleGridInteraction(state.longPressTargetTile, { type: "longpress", button: 0 });
      }
      this._setInteractionState({ isDragging: false });
    };
  }

  _scheduleLongPressForTile(state, tile) {
    state.longPressTargetTile = tile;
    this._setInteractionState({ sellingTileKey: tileKey(tile.row, tile.col) });
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
        this._setInteractionState({ isDragging: false, sellingTileKey: null });
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
      this._setInteractionState({ sellingTileKey: null });
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
    const reactor = this.ui.pageInitUI?.getReactor?.() ?? this.ui.DOMElements?.reactor;
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
      if (e.button > 0) return;
      const tile = getTileFromEvent(e);
      if (!tile?.enabled) return;
      const state = this._buildPointerState(tile, e);
      const cancelLongPress = this._getCancelLongPress(state);
      e.preventDefault();
      this._setInteractionState({ isDragging: true });
      this.lastTileModified = tile;
      if (tile.part && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        this._scheduleLongPressForTile(state, tile);
      }
      this._attachPointerListeners(state, e, getTileFromEvent, cancelLongPress, MOVE_THRESHOLD);
    };

    const pointerMoveHandler = (e) => {
      const tile = getTileFromEvent(e);
      const key = tile?.enabled ? tileKey(tile.row, tile.col) : null;
      this._setInteractionState({ hoveredTileKey: key });
    };

    const pointerLeaveHandler = () => {
      this._setInteractionState({ hoveredTileKey: null });
    };

    const eventTarget = this.ui.gridCanvasRenderer?.getCanvas() || reactor;
    this._reactorEventTarget = eventTarget;
    this._reactorHandlers = {
      pointerdown: pointerDownHandler,
      pointermove: pointerMoveHandler,
      pointerleave: pointerLeaveHandler,
    };
    eventTarget.addEventListener("pointerdown", pointerDownHandler);
    eventTarget.addEventListener("pointermove", pointerMoveHandler);
    eventTarget.addEventListener("pointerleave", pointerLeaveHandler);
  }

  teardownReactorEventListeners() {
    if (!this._reactorEventTarget || !this._reactorHandlers) return;
    const t = this._reactorEventTarget;
    const h = this._reactorHandlers;
    t.removeEventListener("pointerdown", h.pointerdown);
    t.removeEventListener("pointermove", h.pointermove);
    t.removeEventListener("pointerleave", h.pointerleave);
    this._reactorEventTarget = null;
    this._reactorHandlers = null;
  }

  setupSegmentHighlight() {
    const reactorElement = this.ui.pageInitUI?.getReactor?.() ?? this.ui.DOMElements?.reactor;
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
