import { applyToggleStateChange } from "../state.js";
import { drainGameEffects } from "../effect-orchestrator.js";
import { recordSimEvent } from "../domain/sim-events.js";
import { bumpGridPartsRevision } from "./bridge-grid-sync.js";
import { requireActiveBridge } from "./active.js";

function applyPlacePartIntent(game, payload) {
  const partId = payload?.partId;
  const row = payload?.row | 0;
  const col = payload?.col | 0;
  const bridge = requireActiveBridge(game, "placePart");
  if (!partId) return null;
  const part = game.partset?.getPartById?.(partId);
  const tile = game.tileset?.getTile(row, col);
  if (!part || !tile) return null;
  if (game.partset?.isPartDoctrineLocked?.(part)) return null;
  const result = bridge.placePart(row, col, partId);
  if (!result) {
    recordSimEvent(game, { type: "INSUFFICIENT_FUNDS", row, col });
    drainGameEffects(game, () => game?.ui);
    return null;
  }
  recordSimEvent(game, {
    type: "PART_PLACED",
    row,
    col,
    category: part.category,
  });
  drainGameEffects(game, () => game?.ui);
  return { row, col, part };
}

function applySellPartIntent(game, payload) {
  const row = payload?.row | 0;
  const col = payload?.col | 0;
  const tile = game.tileset?.getTile(row, col);
  if (!tile?.part || tile.part.isSpecialTile) return null;
  const bridge = requireActiveBridge(game, "sellPart");
  return bridge.sellPart(row, col);
}

function applyBlueprintIntent(game, payload) {
  const layout = payload?.layout;
  if (!layout) return { ok: false };
  const bridge = requireActiveBridge(game, "applyBlueprint");
  const result = bridge.applyBlueprint({
    layout,
    sellExisting: payload?.sellExisting === true,
    skipCostDeduction: payload?.skipCostDeduction === true,
    partial: payload?.partial === true,
    sellCredit: 0,
  });
  if (!result.ok && result.reason === "deficit") {
    game.emit?.("blueprintApplyDeficit", result);
    recordSimEvent(game, { type: "OPERATION_FAILED", context: "reactor" });
    drainGameEffects(game, () => game?.ui);
  }
  return result;
}

function applyBlueprintPlannerIntent(game, payload = {}) {
  const bridge = requireActiveBridge(game, "commitBlueprintPlanner");
  const result = bridge.commitBlueprintPlanner({ partial: payload.partial === true });
  if (!result.ok) {
    if (result.reason === "deficit") game.emit?.("blueprintApplyDeficit", result);
    recordSimEvent(game, { type: "OPERATION_FAILED", context: "reactor" });
    drainGameEffects(game, () => game?.ui);
    return result;
  }
  game.reactor?.updateStats?.();
  game.partset?.check_affordability?.(game);
  game.emit?.("grid_changed", {});
  return result;
}

function drainIntentBatchSync(game, engine, intents) {
  const placed = [];
  const sold = [];
  const reboots = [];
  let gridMutated = false;
  for (let i = 0; i < intents.length; i++) {
    const intent = intents[i];
    if (intent.action === "SELL_POWER") {
      game.sell_action();
      continue;
    }
    if (intent.action === "VENT_HEAT") {
      game.manual_reduce_heat_action();
      continue;
    }
    if (intent.action === "PAUSE_TOGGLE") {
      game.togglePause();
      continue;
    }
    if (intent.action === "SET_TOGGLE") {
      const { toggleName, value } = intent.payload || {};
      if (toggleName) applyToggleStateChange(game, toggleName, !!value);
      continue;
    }
    if (intent.action === "REBOOT") {
      reboots.push(intent);
      continue;
    }
    if (intent.action === "PLACE_PART") {
      const p = applyPlacePartIntent(game, intent.payload);
      if (p) {
        placed.push(p);
        gridMutated = true;
      }
      continue;
    }
    if (intent.action === "SELL_PART") {
      const s = applySellPartIntent(game, intent.payload);
      if (s) {
        sold.push(s);
        gridMutated = true;
      }
      continue;
    }
    if (intent.action === "APPLY_BLUEPRINT") {
      const res = applyBlueprintIntent(game, intent.payload);
      if (res?.ok) gridMutated = true;
    } else if (intent.action === "COMMIT_BLUEPRINT_PLANNER") {
      const res = applyBlueprintPlannerIntent(game, intent.payload);
      if (res?.ok) gridMutated = true;
    }
  }
  if (gridMutated) {
    game.reactor?.updateStats?.();
    bumpGridPartsRevision(game.tileset);
  }
  drainGameEffects(game, () => game?.ui);
  return { placed, sold, reboots };
}

export async function drainGridIntentsAsync(game, engine, intents) {
  const { placed, sold, reboots } = drainIntentBatchSync(game, engine, intents);
  for (let i = 0; i < reboots.length; i++) {
    const keepEp = reboots[i].payload?.keepEp === true;
    if (keepEp) await game.rebootActionKeepExoticParticles();
    else await game.rebootActionDiscardExoticParticles();
  }
  return { placed, sold };
}
