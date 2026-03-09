import { fromError } from "zod-validation-error";
import { toDecimal, toNumber } from "../utils/decimal.js";
import { buildFacts } from "./game/gameEventRules.js";
import { setDecimal, snapshot } from "./store.js";
import { HEAT_EPSILON } from "./heatCalculations.js";
import { GameLoopTickResultSchema } from "./schemas.js";
import { logger } from "../utils/logger.js";

const SAB_BYTES_PER_FLOAT = 4;

function ensureHeatSAB(engine, ts, gridLen) {
  const needNew = !engine._heatSABView || engine._heatSABView.length !== gridLen;
  if (needNew) {
    engine._heatSABView = new Float32Array(new SharedArrayBuffer(gridLen * SAB_BYTES_PER_FLOAT));
    engine._heatSABView.set(ts.heatMap);
    ts.heatMap = engine._heatSABView;
  } else {
    engine._heatSABView.set(ts.heatMap);
  }
}

function ensureContainmentSAB(engine, game, gridLen) {
  const ts = game.tileset;
  const needNew = !engine._containmentSABView || engine._containmentSABView.length !== gridLen;
  if (needNew) {
    engine._containmentSABView = new Float32Array(new SharedArrayBuffer(gridLen * SAB_BYTES_PER_FLOAT));
    const rows = game.gridManager.rows;
    const cols = game.gridManager.cols;
    const coords = Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => ({ r, c }))
    ).flat();
    coords.forEach(({ r, c }) => {
      const tile = ts.getTile(r, c);
      if (tile?.part) engine._containmentSABView[ts.gridIndex(r, c)] = tile.part.containment || 0;
    });
  }
}

function ensureSABsReady(engine, game, gridLen) {
  const ts = game.tileset;
  const needHeat = !engine._heatSABView || engine._heatSABView.length !== gridLen;
  const needContainment = !engine._containmentSABView || engine._containmentSABView.length !== gridLen;
  if (needHeat) ensureHeatSAB(engine, ts, gridLen);
  else engine._heatSABView.set(ts.heatMap);
  if (needContainment) ensureContainmentSAB(engine, game, gridLen);
}

function partToRow(part) {
  return {
    id: part.id,
    containment: part.containment ?? 0,
    vent: part.vent ?? 0,
    power: part.power ?? 0,
    heat: part.heat ?? 0,
    category: part.category ?? "",
    ticks: part.ticks ?? 0,
    type: part.type ?? "",
    ep_heat: part.ep_heat ?? 0,
    level: part.level ?? 1,
    transfer: part.transfer ?? 0,
  };
}

function buildPartTable(ts) {
  const partIdToIndex = {};
  const partTable = [];
  const list = (ts.active_tiles_list || []).filter((tile) => tile?.enabled && tile.part);
  for (const tile of list) {
    const part = tile.part;
    if (partIdToIndex[part.id] !== undefined) continue;
    partIdToIndex[part.id] = partTable.length;
    partTable.push(partToRow(part));
  }
  return { partIdToIndex, partTable };
}

function buildPartLayout(ts, partIdToIndex) {
  const list = (ts.active_tiles_list || []).filter((tile) => tile?.enabled && tile.part);
  return list.map((tile) => {
    const part = tile.part;
    const transferRate = typeof tile.getEffectiveTransferValue === "function" ? tile.getEffectiveTransferValue() : 0;
    const ventRate = typeof tile.getEffectiveVentValue === "function" ? tile.getEffectiveVentValue() : 0;
    return {
      r: tile.row,
      c: tile.col,
      partIndex: partIdToIndex[part.id],
      ticks: tile.ticks ?? 0,
      activated: !!tile.activated,
      transferRate,
      ventRate,
    };
  });
}

function buildPartSnapshot(ts) {
  const { partIdToIndex, partTable } = buildPartTable(ts);
  const partLayout = buildPartLayout(ts, partIdToIndex);
  return { partTable, partLayout };
}

function buildReactorStatePayload(reactor) {
  return {
    current_heat: reactor.current_heat,
    current_power: reactor.current_power,
    max_heat: toNumber(reactor.max_heat ?? 0),
    max_power: toNumber(reactor.max_power ?? 0),
    auto_sell_multiplier: reactor.auto_sell_multiplier ?? 0,
    sell_price_multiplier: reactor.sell_price_multiplier ?? 1,
    power_overflow_to_heat_ratio: reactor.power_overflow_to_heat_ratio ?? 0.5,
    power_multiplier: reactor.power_multiplier ?? 1,
    heat_controlled: reactor.heat_controlled ? 1 : 0,
    vent_multiplier_eff: reactor.vent_multiplier_eff ?? 0,
    stirling_multiplier: reactor.stirling_multiplier ?? 0,
  };
}

export function serializeStateForGameLoopWorker(engine) {
  const game = engine.game;
  const ts = game.tileset;
  const reactor = game.reactor;
  if (!ts?.heatMap) return null;
  const gridLen = ts.heatMap.length;
  if (!engine._heatUseSAB) return null;
  ensureSABsReady(engine, game, gridLen);
  const stateSnapshot = game.state ? snapshot(game.state) : null;

  const { partTable, partLayout } = buildPartSnapshot(ts);
  const autoSellFromStore = stateSnapshot?.auto_sell !== undefined;

  const rawMoney = stateSnapshot?.current_money;
  const currentMoney = rawMoney != null ? (typeof rawMoney === "number" || typeof rawMoney === "string" ? rawMoney : toNumber(rawMoney)) : undefined;
  return {
    current_money: currentMoney,
    heatBuffer: engine._heatSABView.buffer,
    partLayout,
    partTable,
    reactorState: buildReactorStatePayload(reactor),
    rows: game.gridManager.rows,
    cols: game.gridManager.cols,
    maxCols: ts.max_cols ?? game.gridManager.cols,
    autoSell: autoSellFromStore ? !!stateSnapshot?.auto_sell : !!game.ui?.stateManager?.getVar?.("auto_sell"),
    multiplier: 1,
    tickCount: 1,
  };
}

function applyExplosionIndices(engine, ts, indices, maxCols) {
  if (!Array.isArray(indices)) return;
  indices.forEach((rawIdx) => {
    const idx = rawIdx | 0;
    const tile = ts.getTile((idx / maxCols) | 0, idx % maxCols);
    if (tile?.part) engine.handleComponentExplosion(tile);
  });
}

function applyDepletionIndices(engine, ts, indices, maxCols) {
  if (!Array.isArray(indices)) return;
  indices.forEach((rawIdx) => {
    const idx = rawIdx | 0;
    const tile = ts.getTile((idx / maxCols) | 0, idx % maxCols);
    if (tile?.part) engine.handleComponentDepletion(tile);
  });
}

function applyTileUpdates(ts, tileUpdates) {
  if (!Array.isArray(tileUpdates)) return;
  tileUpdates.forEach((u) => {
    const tile = ts.getTile(u.r, u.c);
    if (!tile) return;
    if (typeof u.ticks === "number") tile.ticks = u.ticks;
  });
}

function syncUIAfterTick(engine, data, reactor) {
  const norm = Math.max(0.001, data.tickCount || 1);
  const game = engine.game;
  if (game?.state) {
    game.state.power_delta_per_tick = (data.powerDelta ?? 0) / norm;
    game.state.heat_delta_per_tick = (data.heatDelta ?? 0) / norm;
    setDecimal(game.state, "current_power", reactor.current_power);
    setDecimal(game.state, "current_heat", reactor.current_heat);
  }
  game?.emit?.("tickRecorded");
  reactor.updateStats();
}

function syncSessionAfterTick(engine, data) {
  engine.tick_count += data.tickCount || 1;
  const now = Date.now();
  if (now - engine.last_session_update >= engine.session_update_interval) {
    engine.game.updateSessionTime();
    engine.last_session_update = now;
  }
}

export function applyGameLoopTickResult(engine, data) {
  if (!data || data.error) return;
  const result = GameLoopTickResultSchema.safeParse(data);
  if (!result.success) {
    logger.log("warn", "engine", "[GameLoopWorker] Result validation failed:", fromError(result.error).toString());
    return;
  }
  data = result.data;
  const game = engine.game;
  const reactor = game.reactor;
  const ts = game.tileset;
  const maxCols = ts?.max_cols ?? game.gridManager.cols;
  const rawHeat = data.reactorHeat ?? 0;
  reactor.current_heat = toDecimal(rawHeat < HEAT_EPSILON ? 0 : rawHeat);
  reactor.current_power = toDecimal(data.reactorPower ?? 0);
  applyExplosionIndices(engine, ts, data.explosionIndices, maxCols);
  applyDepletionIndices(engine, ts, data.depletionIndices, maxCols);
  applyTileUpdates(ts, data.tileUpdates);
  if (Number(data.moneyEarned) > 0) game.addMoney(data.moneyEarned);
  reactor.checkMeltdown();
  const facts = buildFacts(game, engine, data);
  if (!facts.isSandbox && typeof game.eventRouter?.evaluate === "function") game.eventRouter.evaluate(facts, game);
  syncUIAfterTick(engine, data, reactor);
  syncSessionAfterTick(engine, data);
}
