import { setDecimal, updateDecimal, enqueueGameEffect } from "./state.js";
import { toDecimal } from "./utils.js";
import { tryDeductMoneyGameLoop, tryCreditMoneyGameLoop } from "./logic.js";

export function buildGridIntents({ game, tilesToModify, event, clicked_part }) {
  const isSellAction = event.type === "longpress";
  if (game.blueprintPlanner?.active) {
    return [{ type: "blueprint_batch", isSellAction, tiles: tilesToModify, partId: clicked_part?.id ?? null }];
  }
  if (isSellAction) {
    return [{ type: "sell_batch", tiles: tilesToModify }];
  }
  if (clicked_part) {
    return [{ type: "place_batch", tiles: tilesToModify, part: clicked_part }];
  }
  return [];
}

export function validateGridIntent(game, intent) {
  if (game.reactor?.has_melted_down) return false;
  if (intent.type === "blueprint_batch") return true;
  if (intent.type === "sell_batch") return true;
  if (intent.type === "place_batch") return !!intent.part;
  return false;
}

export async function executeBlueprintBatch(game, ui, intent, soundPlayedRef) {
  const { isSellAction, tiles, partId } = intent;
  for (const t of tiles) {
    if (isSellAction) {
      game.setBlueprintPlannerSlot(t.row, t.col, null);
      ui.gridCanvasRenderer?.markTileDirty(t.row, t.col);
    } else if (partId) {
      const part = game.partset?.getPartById?.(partId);
      if (!part) continue;
      const cur = game.getBlueprintPlannerPartId(t.row, t.col);
      const id = part.id;
      if (cur === id) game.setBlueprintPlannerSlot(t.row, t.col, null);
      else game.setBlueprintPlannerSlot(t.row, t.col, id);
      ui.gridCanvasRenderer?.markTileDirty(t.row, t.col);
      if (!soundPlayedRef.v) {
        enqueueGameEffect(game, { kind: "sfx", id: "placement", subtype: null, pan: 0, context: "reactor" });
        soundPlayedRef.v = true;
      }
    }
  }
}

export function executeSellBatch(game, ui, intent, soundPlayedRef) {
  for (const t of intent.tiles) {
    if (t.part && t.part.id && !t.part.isSpecialTile) {
      game.sellPart(t);
      ui.gridCanvasRenderer?.markTileDirty(t.row, t.col);
      soundPlayedRef.v = true;
    }
  }
}

export async function executePlaceBatch(game, ui, intent, soundPlayedRef) {
  const clicked_part = intent.part;
  const eng = game.engine;
  const useWorkerEconomy =
    eng &&
    eng._gameLoopWorkerTickSeen &&
    typeof eng._useGameLoopWorker === "function" &&
    eng._useGameLoopWorker() &&
    !eng._gameLoopWorkerFailed;
  const costNum = Number(clicked_part.cost);

  for (const t of intent.tiles) {
    if (useWorkerEconomy) {
      const r = await tryDeductMoneyGameLoop(game, costNum);
      if (!r.ok) {
        if (!soundPlayedRef.v) {
          const pan = game.calculatePan ? game.calculatePan(t.col) : 0;
          enqueueGameEffect(game, { kind: "sfx", id: "error", pan, context: "reactor" });
          soundPlayedRef.v = true;
        }
        continue;
      }
      setDecimal(game.state, "current_money", toDecimal(r.balanceAfter));
      const partPlaced = await t.setPart(clicked_part);
      if (partPlaced) {
        ui.gridCanvasRenderer?.markTileDirty(t.row, t.col);
        if (ui.deviceFeatures?.lightVibration) ui.deviceFeatures.lightVibration();
        soundPlayedRef.v = true;
        game.emit?.("partPlaced", { part: clicked_part, tile: t });
      } else {
        const c = await tryCreditMoneyGameLoop(game, costNum);
        setDecimal(game.state, "current_money", toDecimal(c.balanceAfter));
        if (!soundPlayedRef.v) {
          const pan = game.calculatePan ? game.calculatePan(t.col) : 0;
          enqueueGameEffect(game, { kind: "sfx", id: "error", pan, context: "reactor" });
          soundPlayedRef.v = true;
        }
      }
    } else {
      const money = game.state.current_money;
      const canAfford = money != null && typeof money.gte === "function"
        ? money.gte(clicked_part.cost)
        : Number(money) >= Number(clicked_part.cost);

      if (canAfford) {
        updateDecimal(game.state, "current_money", (d) => d.sub(clicked_part.cost));
        const partPlaced = await t.setPart(clicked_part);

        if (partPlaced) {
          ui.gridCanvasRenderer?.markTileDirty(t.row, t.col);
          if (ui.deviceFeatures?.lightVibration) ui.deviceFeatures.lightVibration();
          soundPlayedRef.v = true;
          game.emit?.("partPlaced", { part: clicked_part, tile: t });
        } else {
          updateDecimal(game.state, "current_money", (d) => d.add(clicked_part.cost));
          if (!soundPlayedRef.v) {
            const pan = game.calculatePan ? game.calculatePan(t.col) : 0;
            enqueueGameEffect(game, { kind: "sfx", id: "error", pan, context: "reactor" });
            soundPlayedRef.v = true;
          }
        }
      } else {
        if (!soundPlayedRef.v) {
          const pan = game.calculatePan ? game.calculatePan(t.col) : 0;
          enqueueGameEffect(game, { kind: "sfx", id: "error", pan, context: "reactor" });
          soundPlayedRef.v = true;
        }
      }
    }
  }
}

export async function dispatchGridIntents(game, ui, intents) {
  const soundPlayedRef = { v: false };
  for (const intent of intents) {
    if (!validateGridIntent(game, intent)) continue;
    if (intent.type === "blueprint_batch") {
      await executeBlueprintBatch(game, ui, intent, soundPlayedRef);
    } else if (intent.type === "sell_batch") {
      executeSellBatch(game, ui, intent, soundPlayedRef);
    } else if (intent.type === "place_batch") {
      await executePlaceBatch(game, ui, intent, soundPlayedRef);
    }
  }
}
