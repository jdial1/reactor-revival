import Decimal, { toDecimal } from "../utils/decimal.js";
import { VALVE_OVERFLOW_THRESHOLD } from "./constants.js";

const TIME_FLUX_CHUNK_TICKS = 100;
const ANALYTICAL_CATCHUP_THRESHOLD = 5000;
const STABLE_HEAT_RATIO = VALVE_OVERFLOW_THRESHOLD;
const SAMPLE_TICKS = 5;

function applyReactorStateProjection(engine, N, avgHeatPerTick, avgPowerPerTick, avgMoneyPerTick) {
  const reactor = engine.game.reactor;
  const newHeat = reactor.current_heat.add(avgHeatPerTick * N);
  reactor.current_heat = Decimal.max(toDecimal(0), Decimal.min(reactor.max_heat, newHeat));
  const effectiveMaxPower = (reactor.altered_max_power && toDecimal(reactor.altered_max_power).neq(reactor.base_max_power))
    ? toDecimal(reactor.altered_max_power) : reactor.max_power;
  const newPower = reactor.current_power.add(avgPowerPerTick * N);
  reactor.current_power = Decimal.max(toDecimal(0), Decimal.min(effectiveMaxPower, newPower));
  if (Number.isFinite(avgMoneyPerTick) && avgMoneyPerTick !== 0) {
    engine.game.addMoney(avgMoneyPerTick * N);
  }
}

function advanceTicksAndHandleDepletions(engine, cells, reflectorSet, N) {
  for (let i = 0; i < cells.length; i++) {
    const tile = cells[i];
    if (tile.ticks != null) tile.ticks -= N;
  }
  for (const r of reflectorSet) {
    if (r.ticks != null) r.ticks -= N;
  }
  for (let i = 0; i < cells.length; i++) {
    const tile = cells[i];
    if (tile.ticks <= 0 && tile.part) {
      if (tile.part.type === "protium") {
        engine.game.protium_particles += tile.part.cell_count;
        engine.game.update_cell_power();
      }
      engine.handleComponentDepletion(tile);
    }
  }
  for (const r of reflectorSet) {
    if (r.ticks <= 0 && r.part) engine.handleComponentDepletion(r);
  }
}

export function applyTimeFluxProjection(engine, N, avgHeatPerTick, avgPowerPerTick, avgMoneyPerTick) {
  const reactor = engine.game.reactor;
  const game = engine.game;
  applyReactorStateProjection(engine, N, avgHeatPerTick, avgPowerPerTick, avgMoneyPerTick);
  const cells = engine.active_cells.slice();
  const reflectorSet = new Set();
  for (let i = 0; i < cells.length; i++) {
    const refs = cells[i].reflectorNeighborTiles;
    for (let j = 0; j < refs.length; j++) reflectorSet.add(refs[j]);
  }
  advanceTicksAndHandleDepletions(engine, cells, reflectorSet, N);
  engine.tick_count += N;
  engine.markPartCacheAsDirty();
  game.emit?.("reactorTick", { current_heat: reactor.current_heat, current_power: reactor.current_power });
  if (reactor.updateStats) reactor.updateStats();
}

function canProjectChunk(reactor, chunk) {
  if (chunk <= SAMPLE_TICKS) return false;
  if (reactor.max_heat.lte(0)) return true;
  return reactor.current_heat.div(reactor.max_heat).toNumber() < VALVE_OVERFLOW_THRESHOLD;
}

function sampleTickAverages(engine, reactor) {
  const heat0 = reactor.current_heat;
  const power0 = reactor.current_power;
  const money0 = engine.game.state.current_money;
  for (let i = 0; i < SAMPLE_TICKS; i++) engine._processTick(1.0);
  const heat1 = reactor.current_heat;
  const power1 = reactor.current_power;
  const money1 = engine.game.state.current_money;
  return {
    avgHeat: heat1.sub(heat0).div(SAMPLE_TICKS).toNumber(),
    avgPower: power1.sub(power0).div(SAMPLE_TICKS).toNumber(),
    avgMoney: (money1 && money1.sub ? money1.sub(money0).div(SAMPLE_TICKS).toNumber() : 0),
    heatRatio: reactor.max_heat.gt(0) ? heat1.div(reactor.max_heat).toNumber() : 0,
  };
}

function isProjectionStable(avgs, reactor) {
  return avgs.heatRatio < STABLE_HEAT_RATIO &&
    !reactor.has_melted_down &&
    Number.isFinite(avgs.avgHeat) &&
    Number.isFinite(avgs.avgPower);
}

function processProjectedChunk(engine, reactor, chunk) {
  const maxProjection = Math.max(0, TIME_FLUX_CHUNK_TICKS - SAMPLE_TICKS);
  const avgs = sampleTickAverages(engine, reactor);
  const N = isProjectionStable(avgs, reactor)
    ? Math.min(chunk - SAMPLE_TICKS, maxProjection)
    : 0;
  if (N > 0) {
    applyTimeFluxProjection(engine, N, avgs.avgHeat, avgs.avgPower, avgs.avgMoney);
    return SAMPLE_TICKS + N;
  }
  for (let i = 0; i < chunk - SAMPLE_TICKS; i++) engine._processTick(1.0);
  return chunk;
}

function runTickBatch(engine, count) {
  for (let i = 0; i < count; i++) engine._processTick(1.0);
}

export function runInstantCatchup(engine) {
  const queuedTicks = Math.floor(engine.time_accumulator / engine.game.loop_wait);
  engine.time_accumulator = 0;
  if (queuedTicks <= 0) return;
  if (queuedTicks > ANALYTICAL_CATCHUP_THRESHOLD) {
    runAnalyticalCatchup(engine, queuedTicks);
    return;
  }
  const reactor = engine.game.reactor;
  let remaining = queuedTicks;
  engine._timeFluxFastForward = true;
  while (remaining > 0 && !reactor.has_melted_down) {
    const chunk = Math.min(TIME_FLUX_CHUNK_TICKS, remaining);
    if (canProjectChunk(reactor, chunk)) {
      remaining -= processProjectedChunk(engine, reactor, chunk);
    } else {
      runTickBatch(engine, chunk);
      remaining -= chunk;
    }
  }
  engine._timeFluxFastForward = false;
}

function clampProjectionToMeltdown(reactor, avgs, projectTicksTotal) {
  if (!Number.isFinite(avgs.avgHeat) || avgs.avgHeat <= 0 || !reactor.max_heat.gt(0)) {
    return { projectTicks: projectTicksTotal, wouldMeltdown: false };
  }
  const meltdownHeat = reactor.max_heat.mul(2).toNumber();
  const heatToMeltdown = meltdownHeat - reactor.current_heat.toNumber();
  if (heatToMeltdown <= 0) return { projectTicks: projectTicksTotal, wouldMeltdown: false };
  const ticksToMeltdown = Math.floor(heatToMeltdown / avgs.avgHeat);
  if (ticksToMeltdown < projectTicksTotal) {
    return { projectTicks: ticksToMeltdown, wouldMeltdown: true };
  }
  return { projectTicks: projectTicksTotal, wouldMeltdown: false };
}

export function runAnalyticalCatchup(engine, queuedTicks) {
  const reactor = engine.game.reactor;
  const avgs = sampleTickAverages(engine, reactor);
  const projectTicksTotal = queuedTicks - SAMPLE_TICKS;
  const { projectTicks, wouldMeltdown } = clampProjectionToMeltdown(reactor, avgs, projectTicksTotal);
  if (projectTicks > 0 && Number.isFinite(avgs.avgHeat) && Number.isFinite(avgs.avgPower)) {
    applyTimeFluxProjection(engine, projectTicks, avgs.avgHeat, avgs.avgPower, avgs.avgMoney);
  }
  if (wouldMeltdown) {
    reactor.current_heat = reactor.max_heat.mul(2).add(1);
    reactor.checkMeltdown();
  }
  engine._timeFluxFastForward = false;
}
