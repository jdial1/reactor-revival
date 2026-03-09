import { toDecimal } from "../../utils/decimal.js";
import { buildFacts } from "../game/gameEventRules.js";
import { setDecimal, updateDecimal } from "../store.js";
import { logger } from "../../utils/logger.js";
import {
  VALVE_OVERFLOW_THRESHOLD,
  REACTOR_HEAT_STANDARD_DIVISOR,
  HEAT_REMOVAL_TARGET_RATIO,
  MULTIPLIER_FLOOR,
  MAX_EP_EMIT_PER_TICK,
} from "../constants.js";
import { processComponentPhase } from "./phaseRegistry.js";

function explodeTile(engine, tile) {
  const reactor = engine.game.reactor;
  if (tile.part?.category === "particle_accelerator") reactor.checkMeltdown();
  engine.handleComponentExplosion(tile);
}

function explodeTilesFromIndices(engine, explosionIndices) {
  const ts = engine.game.tileset;
  const cols = engine.game.gridManager.cols;
  for (let i = 0; i < explosionIndices.length; i++) {
    const idx = explosionIndices[i] | 0;
    const tile = ts.getTile((idx / cols) | 0, idx % cols);
    if (!tile?.part || tile.exploded) continue;
    explodeTile(engine, tile);
  }
}

function collectTilesOverContainment(engine) {
  const tilesToExplode = engine._explosion_tilesToExplode;
  tilesToExplode.length = 0;
  for (let i = 0; i < engine.active_vessels.length; i++) {
    const tile = engine.active_vessels[i];
    if (!tile.part || tile.exploded) continue;
    const part = tile.part;
    if (part && part.containment > 0 && tile.heat_contained > part.containment) {
      tilesToExplode.push(tile);
    }
  }
}

function explodeTilesFromActiveVessels(engine) {
  collectTilesOverContainment(engine);
  const tilesToExplode = engine._explosion_tilesToExplode;
  for (let i = 0; i < tilesToExplode.length; i++) {
    explodeTile(engine, tilesToExplode[i]);
  }
}

function processExplosionsPhase(engine, explosionIndices) {
  const hasIndices = Array.isArray(explosionIndices) && explosionIndices.length > 0;
  if (hasIndices) {
    explodeTilesFromIndices(engine, explosionIndices);
  } else {
    explodeTilesFromActiveVessels(engine);
  }
}

function withPerf(engine, name, fn) {
  if (engine.game.performance && engine.game.performance.shouldMeasure()) {
    engine.game.performance.markStart(name);
  }
  fn();
  if (engine.game.performance && engine.game.performance.shouldMeasure()) {
    engine.game.performance.markEnd(name);
  }
}

function getEffectiveMaxPower(reactor) {
  return reactor.altered_max_power && toDecimal(reactor.altered_max_power).neq(reactor.base_max_power)
    ? toDecimal(reactor.altered_max_power)
    : reactor.max_power;
}

function applyPowerOverflow(reactor, power_add) {
  const effectiveMaxPower = getEffectiveMaxPower(reactor);
  const potentialPower = reactor.current_power.add(power_add);
  if (potentialPower.gt(effectiveMaxPower)) {
    const overflowToHeat = reactor.power_overflow_to_heat_ratio ?? 0.5;
    reactor.current_power = effectiveMaxPower;
    reactor.current_heat = reactor.current_heat.add(potentialPower.sub(effectiveMaxPower).mul(overflowToHeat));
  } else {
    reactor.current_power = potentialPower;
  }
  return effectiveMaxPower;
}

function computeEpGain(ep_chance_add) {
  if (ep_chance_add <= 0) return 0;
  let ep_gain = Math.floor(ep_chance_add);
  if (Math.random() < (ep_chance_add % 1)) ep_gain++;
  return ep_gain <= 0 ? 0 : ep_gain;
}

function applyEpToGame(engine, ep_gain) {
  const game = engine.game;
  game.exoticParticleManager.exotic_particles = game.exoticParticleManager.exotic_particles.add(ep_gain);
  updateDecimal(game.state, "total_exotic_particles", (d) => d.add(ep_gain));
  updateDecimal(game.state, "current_exotic_particles", (d) => d.add(ep_gain));
}

function emitParticleVisuals(engine) {
  try {
    if (typeof engine.game.emit !== "function") return;
    let emitted = 0;
    for (let j = 0; j < engine.active_vessels.length; j++) {
      const t = engine.active_vessels[j];
      if (t.part?.category === "particle_accelerator" && t.heat_contained > 0) {
        engine.game.emit("exoticParticleEmitted", { tile: t });
        emitted++;
        if (emitted >= MAX_EP_EMIT_PER_TICK) break;
      }
    }
  } catch (_) {}
}

function applyExoticParticleGain(engine, ep_chance_add) {
  const ep_gain = computeEpGain(ep_chance_add);
  if (ep_gain <= 0) return;
  applyEpToGame(engine, ep_gain);
  emitParticleVisuals(engine);
}

function updateReactorStats(reactor) {
  reactor.updateStats();
  if (typeof reactor.recordClassificationStats === "function") reactor.recordClassificationStats();
}

function applyPowerMultiplier(reactor, power_add) {
  const powerMult = reactor.power_multiplier || 1;
  if (powerMult !== 1) {
    const extra = power_add * (powerMult - 1);
    reactor.current_power = reactor.current_power.add(extra);
    if (reactor.current_power.gt(reactor.max_power)) {
      const overflowToHeat = reactor.power_overflow_to_heat_ratio ?? 0.5;
      reactor.current_heat = reactor.current_heat.add(reactor.current_power.sub(reactor.max_power).mul(overflowToHeat));
      reactor.current_power = reactor.max_power;
    }
  }
  if (reactor.current_power.gt(reactor.max_power)) reactor.current_power = reactor.max_power;
}

function applyStatsThenPowerMult(reactor, power_add) {
  updateReactorStats(reactor);
  applyPowerMultiplier(reactor, power_add);
}

function applyStatsPowerMultThenAutoSell(engine, reactor, power_add, effectiveMaxPower, multiplier) {
  applyStatsThenPowerMult(reactor, power_add);
  processComponentPhase(engine, "autoSell", multiplier, { effectiveMaxPower });
}

function applyHeatReductions(reactor, multiplier) {
  if (reactor.power_to_heat_ratio > 0 && reactor.current_heat.gt(0)) {
    const heatPercent = reactor.current_heat.div(reactor.max_heat).toNumber();
    if (heatPercent > VALVE_OVERFLOW_THRESHOLD && reactor.current_power.gt(0)) {
      const heatToRemoveTarget = reactor.current_heat.mul(HEAT_REMOVAL_TARGET_RATIO).toNumber();
      const powerNeeded = heatToRemoveTarget / reactor.power_to_heat_ratio;
      const powerUsed = Math.min(reactor.current_power.toNumber(), powerNeeded);
      const heatRemoved = powerUsed * reactor.power_to_heat_ratio;
      reactor.current_power = reactor.current_power.sub(powerUsed);
      reactor.current_heat = reactor.current_heat.sub(heatRemoved);
    }
  }
  if (reactor.current_heat.gt(0) && reactor.heat_controlled) {
    const ventBonus = reactor.vent_multiplier_eff || 0;
    const baseRed = reactor.max_heat.toNumber() / REACTOR_HEAT_STANDARD_DIVISOR;
    const reduction = baseRed * (1 + ventBonus / 100) * multiplier;
    reactor.current_heat = reactor.current_heat.sub(reduction);
  }
  if (reactor.current_heat.lt(0)) reactor.current_heat = toDecimal(0);
}

function syncStateVars(reactor, game, ctx) {
  const rawPowerDelta = reactor.current_power.sub(ctx.powerBeforeTick).toNumber();
  const rawHeatDelta = reactor.current_heat.sub(ctx.heatBeforeTick).toNumber();
  const norm = Math.max(MULTIPLIER_FLOOR, ctx.multiplier);
  if (game.state) {
    game.state.power_delta_per_tick = rawPowerDelta / norm;
    game.state.heat_delta_per_tick = rawHeatDelta / norm;
    setDecimal(game.state, "current_power", reactor.current_power);
    setDecimal(game.state, "current_heat", reactor.current_heat);
  }
}

function updatePostTickAudio(engine, reactor) {
  if (engine.game.audio?.ambienceManager) {
    engine.game.audio.ambienceManager.updateAmbienceHeat(reactor.current_heat.toNumber(), reactor.max_heat.toNumber());
  }
  if (engine.game.audio?.industrialManager) {
    engine.game.audio.industrialManager.scheduleIndustrialAmbience(engine.active_vents.length, engine.active_exchangers.length);
  }
}

function syncAudioThenVisuals(engine, reactor) {
  updatePostTickAudio(engine, reactor);
}

function syncStateThenVisuals(engine, reactor, ctx) {
  syncStateVars(reactor, engine.game, ctx);
  syncAudioThenVisuals(engine, reactor);
}

function emitTickCompleteEvent(engine, reactor) {
  if (typeof engine.game.emit !== "function") return;
  engine.game.emit("tick_complete", {
    tick: engine.tick_count,
    power: reactor.current_power,
    heat: reactor.current_heat,
    activeCells: engine.active_cells.length,
    activeVents: engine.active_vents.length,
  });
}

function finalizeTick(engine) {
  const now = Date.now();
  if (now - engine.last_session_update >= engine.session_update_interval) {
    engine.game.updateSessionTime();
    engine.last_session_update = now;
  }
  if (engine._eventHead !== engine._eventTail) {
    engine.game.emit?.("visualEventsReady", engine.getEventBuffer());
  }
  if (engine.game.performance && engine.game.performance.shouldMeasure()) {
    engine.game.performance.markEnd("tick_total");
  }
  emitTickCompleteEvent(engine, engine.game.reactor);
  const game = engine.game;
  const facts = buildFacts(game, engine);
  if (!facts.isSandbox && typeof game.eventRouter?.evaluate === "function") game.eventRouter.evaluate(facts, game);
  engine.tick_count++;
}

function phaseAcceleratorHeat(engine, multiplier, power_add) {
  return processComponentPhase(engine, "acceleratorHeat", multiplier, { power_add });
}

function phaseAcceleratorEP(engine, multiplier) {
  let ep_chance_add;
  withPerf(engine, "tick_particle_accelerators", () => {
    ep_chance_add = processComponentPhase(engine, "acceleratorEP", multiplier);
  });
  logger.log('debug', 'engine', `[EP-GEN] Total EP chance for this tick: ${ep_chance_add}`);
  return ep_chance_add;
}

function phaseVents(engine, multiplier, power_add) {
  let add = power_add;
  withPerf(engine, "tick_vents", () => {
    add = processComponentPhase(engine, "vents", multiplier, { power_add: add });
  });
  logger.log('debug', 'engine', `[TICK STAGE] After vent processing: Reactor Heat = ${engine.game.reactor.current_heat.toFixed(2)}`);
  return add;
}

function phasePowerOverflowAndEP(engine, reactor, power_add, ep_chance_add) {
  const effectiveMaxPower = applyPowerOverflow(reactor, power_add);
  applyExoticParticleGain(engine, ep_chance_add);
  return effectiveMaxPower;
}

function phaseStatsAndAutoSell(engine, reactor, power_add, effectiveMaxPower, multiplier) {
  withPerf(engine, "tick_stats", () => {
    applyStatsPowerMultThenAutoSell(engine, reactor, power_add, effectiveMaxPower, multiplier);
  });
}

function phaseHeatFluxAndRepair(engine, reactor, multiplier) {
  applyHeatReductions(reactor, multiplier);
  processComponentPhase(engine, "fluxAccumulators", multiplier);
  processComponentPhase(engine, "realityFlux", multiplier);
  processComponentPhase(engine, "autonomicRepair", multiplier);
}

function phaseSyncAndFinalize(engine, reactor, ui, ctx) {
  syncStateThenVisuals(engine, reactor, ctx);
  if (engine.game.performance && engine.game.performance.shouldMeasure()) {
    engine.game.performance.markEnd("tick_stats");
  }
  finalizeTick(engine);
}

export function runPostHeatPhase(engine, ctx, explosionIndices = null) {
  const reactor = engine.game.reactor;
  const ui = engine.game.ui;
  const { multiplier } = ctx;
  let { power_add } = ctx;

  power_add = phaseAcceleratorHeat(engine, multiplier, power_add);
  const ep_chance_add = phaseAcceleratorEP(engine, multiplier);
  withPerf(engine, "tick_explosions", () => processExplosionsPhase(engine, explosionIndices));
  power_add = phaseVents(engine, multiplier, power_add);
  const effectiveMaxPower = phasePowerOverflowAndEP(engine, reactor, power_add, ep_chance_add);
  phaseStatsAndAutoSell(engine, reactor, power_add, effectiveMaxPower, multiplier);
  phaseHeatFluxAndRepair(engine, reactor, multiplier);
  phaseSyncAndFinalize(engine, reactor, ui, ctx);
}
