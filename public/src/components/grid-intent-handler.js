import { MOBILE_BREAKPOINT_PX } from "../constants/ui-constants.js";
import { actions } from "../store.js";
import { drainGridIntentsAsync } from "../bridge/bridge-intents.js";

export async function handleGridInteraction(ui, tile, event) {
  const game = ui?.game;
  if (!tile || !game || !ui || game.reactor?.has_melted_down) return;

  const isSellAction = event.type === "longpress";
  const clicked_part = ui.stateManager.getClickedPart();
  const inputManager = ui.inputHandler;
  if (inputManager && !inputManager.hotkeys) inputManager.setup();

  const placementMacro = ui?.uiState?.interaction?.placementMacro ?? null;
  const tilesToModify =
    inputManager?.hotkeys && typeof inputManager.hotkeys.getTiles === "function"
      ? [...inputManager.hotkeys.getTiles(tile, event, placementMacro)]
      : [tile];

  const isMobile = window.innerWidth <= MOBILE_BREAKPOINT_PX;
  const macroAllowsPlacement =
    (placementMacro === "fill" && !!tile.part) ||
    (!!clicked_part && !!placementMacro && placementMacro !== "fill");

  if (isMobile && !isSellAction && tile.part && !clicked_part && !macroAllowsPlacement) {
    game.emit("showContextModal", { tile });
    return;
  }

  if (!isSellAction && ui.help_mode_active && !isMobile) {
    const t0 = tilesToModify[0];
    const helpTargetPart = t0?.part ?? clicked_part;
    if (helpTargetPart && ui.tooltipManager) ui.tooltipManager.show(helpTargetPart, t0, true);
    return;
  }

  const soundPlayedRef = { v: false };
  const eng = game.engine;
  const placementTiles = [];
  const sellTiles = [];

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
      sellTiles.push(t);
      continue;
    }

    if (!clicked_part) continue;
    placementTiles.push(t);
  }

  if (sellTiles.length && eng) {
    const intents = sellTiles.map((t) => ({
      action: "SELL_PART",
      payload: { row: t.row, col: t.col },
    }));
    const { sold } = await drainGridIntentsAsync(game, eng, intents);
    if (sold.length) {
      soundPlayedRef.v = true;
      if (ui.deviceFeatures?.heavyVibration) ui.deviceFeatures.heavyVibration();
    }
    for (let sj = 0; sj < sold.length; sj++) {
      const s = sold[sj];
      ui.gridCanvasRenderer?.markTileDirty(s.row, s.col);
    }
  }

  if (placementTiles.length && eng) {
    const intents = placementTiles.map((t) => ({
      action: "PLACE_PART",
      payload: { row: t.row, col: t.col, partId: clicked_part.id },
    }));
    const { placed } = await drainGridIntentsAsync(game, eng, intents);
    if (placed.length) {
      soundPlayedRef.v = true;
      if (ui.deviceFeatures?.lightVibration) ui.deviceFeatures.lightVibration();
    }
    for (let pj = 0; pj < placed.length; pj++) {
      const p = placed[pj];
      ui.gridCanvasRenderer?.markTileDirty(p.row, p.col);
    }
  }
}
