import { applyToggleStateChange, runSellPart } from "../state.js";
import { drainGameEffects } from "../effect-orchestrator.js";
import { recordSimEvent } from "./sim-events.js";
import { applyBlueprintLayoutDiff, layoutFromPlannerSlots } from "./blueprint.js";
import { debitMoney, creditMoney } from "./economy-intents.js";
import { bumpGridPartsRevision, invalidateTickParts } from "./part-classification.js";
import { toNumber } from "../simUtils.js";

async function applyPlacePartIntent(game, payload) {
  const partId = payload?.partId;
  const row = payload?.row | 0;
  const col = payload?.col | 0;
  const part = game.partset?.getPartById?.(partId);
  const tile = game.tileset?.getTile(row, col);
  if (!part || !tile) return null;
  const costNum = Number(part.cost) || 0;
  const money = game.state?.current_money;
  const canAfford = money != null && typeof money.gte === "function"
    ? money.gte(part.cost)
    : toNumber(money) >= costNum;
  if (!canAfford) {
    recordSimEvent(game, { type: "INSUFFICIENT_FUNDS", row, col });
    drainGameEffects(game, () => game?.ui);
    return null;
  }
  debitMoney(game, costNum);
  const partPlaced = await tile.setPart(part);
  if (partPlaced) return { row, col, part };
  creditMoney(game, costNum);
  recordSimEvent(game, { type: "OPERATION_FAILED", context: "reactor", col });
  drainGameEffects(game, () => game?.ui);
  return null;
}

function applySellPartIntent(game, payload) {
  const row = payload?.row | 0;
  const col = payload?.col | 0;
  const tile = game.tileset?.getTile(row, col);
  if (!tile?.part || tile.part.isSpecialTile) return null;
  runSellPart(game, tile);
  return { row, col };
}

function applyBlueprintIntent(game, payload) {
  const layout = payload?.layout;
  if (!layout) return { ok: false };
  if (payload?.sellExisting) {
    game.tileset.tiles_list.forEach((tile) => {
      if (tile.enabled && tile.part) runSellPart(game, tile);
    });
  }
  const result = applyBlueprintLayoutDiff(game, layout, {
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
  const layout = layoutFromPlannerSlots(game);
  if (!layout) return { ok: false, reason: "empty" };
  const entries = Object.entries(game.blueprintPlanner?.slots || {}).filter(([, partId]) => partId);
  for (let i = 0; i < entries.length; i++) {
    const [key, partId] = entries[i];
    const [rs, cs] = key.split(",");
    const r = Number(rs);
    const c = Number(cs);
    const part = game.partset.getPartById(partId);
    const tile = game.tileset.getTile(r, c);
    if (!part || !tile?.enabled || !game.unlockManager.isPartUnlocked(part)) return { ok: false, reason: "unlock" };
    if (part.erequires) {
      const u = game.upgradeset.getUpgrade(part.erequires);
      if (!u || u.level <= 0) return { ok: false, reason: "unlock" };
    }
  }
  const result = applyBlueprintLayoutDiff(game, layout, { partial: payload.partial === true });
  if (!result.ok) {
    if (result.reason === "deficit") game.emit?.("blueprintApplyDeficit", result);
    recordSimEvent(game, { type: "OPERATION_FAILED", context: "reactor" });
    drainGameEffects(game, () => game?.ui);
    return result;
  }
  game.blueprintPlanner.slots = {};
  game.blueprintPlanner.active = false;
  game.reactor.updateStats();
  game.partset.check_affordability(game);
  game.emit?.("grid_changed", {});
  return result;
}

export async function drainGridIntentsAsync(game, engine, intents) {
  const placed = [];
  const sold = [];
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
      const keepEp = intent.payload?.keepEp === true;
      if (keepEp) await game.rebootActionKeepExoticParticles();
      else await game.rebootActionDiscardExoticParticles();
      continue;
    }
    if (intent.action === "PLACE_PART") {
      const p = await applyPlacePartIntent(game, intent.payload);
      if (p) {
        placed.push(p);
        gridMutated = true;
        game.unlockManager?.incrementPlacedCount?.(p.part.type, p.part.level);
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
    invalidateTickParts(engine);
  }
  drainGameEffects(game, () => game?.ui);
  return { placed, sold };
}
