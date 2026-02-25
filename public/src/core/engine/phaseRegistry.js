import {
  AUTONOMIC_REPAIR_POWER_COST,
  AUTONOMIC_REPAIR_POWER_MIN,
  EP_HEAT_SAFE_CAP,
  EP_CHANCE_LOG_BASE,
} from "../constants.js";
import { processCells } from "./cellProcessor.js";
import { processVents } from "./ventProcessor.js";
import { processAutoSell } from "./powerAutoSellProcessor.js";
import { processFluxAccumulators, processRealityFlux } from "./fluxProcessor.js";

function handlerAcceleratorHeat(engine, multiplier, options) {
  const reactor = engine.game.reactor;
  let power_add = options?.power_add ?? 0;
  const vessels = engine.active_vessels || [];
  for (let i = 0; i < vessels.length; i++) {
    const tile = vessels[i];
    if (tile.part?.id !== "particle_accelerator6") continue;
    const cap = tile.part.containment || 0;
    const current = tile.heat_contained || 0;
    const space = Math.max(0, cap - current);
    if (space <= 0 || reactor.current_heat.lte(0)) continue;
    const rate = tile.getEffectiveTransferValue ? tile.getEffectiveTransferValue() : 0;
    const maxPull = rate * multiplier;
    const pull = Math.min(maxPull, reactor.current_heat.toNumber(), space);
    if (pull > 0) {
      reactor.current_heat = reactor.current_heat.sub(pull);
      tile.heat_contained += pull;
      power_add += pull;
    }
  }
  return power_add;
}

function handlerAcceleratorEP(engine, multiplier) {
  let ep_chance_add = 0;
  const vessels = engine.active_vessels || [];
  for (let i = 0; i < vessels.length; i++) {
    const tile = vessels[i];
    const part = tile.part;
    if (part && part.category === "particle_accelerator" && tile.heat_contained > 0) {
      const lower_heat = Math.min(tile.heat_contained, part.ep_heat, EP_HEAT_SAFE_CAP);
      if (lower_heat <= 0 || !Number.isFinite(part.ep_heat) || part.ep_heat <= 0) continue;
      const chance = (Math.log(lower_heat) / Math.log(EP_CHANCE_LOG_BASE)) * (lower_heat / part.ep_heat);
      ep_chance_add += Number.isFinite(chance) ? chance * multiplier : 0;
    }
  }
  return ep_chance_add;
}

function handlerAutonomicRepair(engine, multiplier) {
  const reactor = engine.game.reactor;
  if (reactor.auto_repair_rate <= 0 || !reactor.current_power.gte(AUTONOMIC_REPAIR_POWER_MIN)) return;
  let repairsRemaining = Math.floor(reactor.auto_repair_rate * multiplier);
  const cells = engine.active_cells || [];
  for (let i = 0; i < cells.length; i++) {
    const tile = cells[i];
    if (repairsRemaining <= 0 || reactor.current_power.lt(AUTONOMIC_REPAIR_POWER_COST)) return;
    if (tile.part && tile.part.ticks > 0) {
      tile.ticks += 1;
      reactor.current_power = reactor.current_power.sub(AUTONOMIC_REPAIR_POWER_COST);
      repairsRemaining--;
    }
  }
}

function handlerAutoSell(engine, multiplier, options) {
  const effectiveMaxPower = options?.effectiveMaxPower;
  if (!effectiveMaxPower) return;
  processAutoSell(engine, multiplier, effectiveMaxPower);
}

export const PHASE_REGISTRY = new Map([
  [
    "cells",
    {
      getTiles: (e) => e.active_cells || [],
      handler: (engine, multiplier) => processCells(engine, multiplier),
    },
  ],
  [
    "acceleratorHeat",
    {
      getTiles: (e) => (e.active_vessels || []).filter((t) => t.part?.id === "particle_accelerator6"),
      handler: (engine, multiplier, options) => handlerAcceleratorHeat(engine, multiplier, options),
    },
  ],
  [
    "acceleratorEP",
    {
      getTiles: (e) => (e.active_vessels || []).filter((t) => t.part?.category === "particle_accelerator"),
      handler: (engine, multiplier) => handlerAcceleratorEP(engine, multiplier),
    },
  ],
  [
    "vents",
    {
      getTiles: (e) => e.active_vents || [],
      handler: (engine, multiplier) => processVents(engine, multiplier),
    },
  ],
  [
    "fluxAccumulators",
    {
      getTiles: (e) => (e.active_vessels || []).filter((t) => t.part?.category === "capacitor"),
      handler: (engine, multiplier) => processFluxAccumulators(engine, multiplier),
    },
  ],
  [
    "realityFlux",
    {
      getTiles: (e) => e.game?.tileset?.active_tiles_list || [],
      handler: (engine, multiplier) => processRealityFlux(engine, multiplier),
    },
  ],
  [
    "autonomicRepair",
    {
      getTiles: (e) => e.active_cells || [],
      handler: (engine, multiplier) => handlerAutonomicRepair(engine, multiplier),
    },
  ],
  [
    "autoSell",
    {
      getTiles: (e) => e.active_capacitors || [],
      handler: (engine, multiplier, options) => handlerAutoSell(engine, multiplier, options),
    },
  ],
]);

export function processComponentPhase(engine, phaseName, multiplier, options = {}) {
  const entry = PHASE_REGISTRY.get(phaseName);
  if (!entry) return undefined;
  const result = entry.handler(engine, multiplier, options);
  if (phaseName === "vents" && options.power_add !== undefined) {
    return (options.power_add ?? 0) + (result ?? 0);
  }
  return result;
}
