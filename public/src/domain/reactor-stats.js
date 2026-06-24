import { applyReflectorCooling, calculateHeatPowerMultiplier } from "../kernel/physics.js";
import {
  calculateCellPulseHeat,
  calculateCellPulsePower,
  computeNeighborPulseNFromTile,
} from "../logic-tooltip-stats.js";
import { hasTrait } from "../traits.js";
import {
  BASE_MAX_HEAT,
  BASE_MAX_POWER,
  PERCENT_DIVISOR,
  REFLECTOR_COOLING_MIN_MULTIPLIER,
} from "../constants/balance.js";
import { toDecimal } from "../simUtils.js";

export const heatSfxLastTick = new Map();

export function getCellPowerCoefficientLP(part, game) {
  if (part.category !== "cell") {
    const pow =
      typeof part.power === "number" && !isNaN(part.power) && isFinite(part.power) ? part.power : part.base_power;
    return Number.isFinite(pow) ? pow : part.base_power || 0;
  }
  let P = part.base_power || 0;
  if (game?.upgradeset) {
    const powerUpg = game.upgradeset.getUpgrade(`${part.type}1_cell_power`);
    if (powerUpg && powerUpg.level > 0) P *= Math.pow(2, powerUpg.level);
    if (part.type === "protium") {
      const unstable = game.upgradeset.getUpgrade("unstable_protium")?.level || 0;
      if (unstable > 0) P *= Math.pow(2, unstable);
    }
  }
  return Number.isFinite(P) ? P : 0;
}

export function getCellHeatCoefficientH(part, game) {
  if (part.category !== "cell") {
    const ht =
      typeof part.heat === "number" && !isNaN(part.heat) && isFinite(part.heat) ? part.heat : part.base_heat;
    return Number.isFinite(ht) ? ht : part.base_heat || 0;
  }
  let H = part.base_heat || 0;
  if (game?.upgradeset) {
    const unstable = game.upgradeset.getUpgrade("unstable_protium")?.level || 0;
    if (part.type === "protium" && unstable > 0) H *= Math.pow(0.5, unstable);
    const depletedCount = game.protium_particles || 0;
    if (depletedCount > 0) H *= (1 + 0.10 * depletedCount);
  }
  return Number.isFinite(H) ? H : 0;
}

export function applyReflectorEffects(tile, reactor, onReflectorPulse) {
  let reflector_count = 0;
  tile.reflectorNeighborTiles.forEach((r_tile) => {
    if (r_tile.ticks > 0) {
      reflector_count++;
      if (onReflectorPulse) {
        try {
          onReflectorPulse(r_tile, tile);
        } catch (_) {}
      }
    }
  });
  if (hasTrait(tile.part?.trait_mask, "FUEL_CELL") && typeof tile.heat === "number" && !isNaN(tile.heat)) {
    if (reactor.reflector_cooling_factor > 0 && reflector_count > 0) {
      tile.heat = applyReflectorCooling(
        tile.heat,
        reflector_count,
        reactor.reflector_cooling_factor,
        REFLECTOR_COOLING_MIN_MULTIPLIER
      );
    }
  }
}

export function applyCellMultipliers(tile, reactor) {
  if (!tile.part || !hasTrait(tile.part.trait_mask, "FUEL_CELL") || !tile.ticks || tile.ticks <= 0) return;
  const hpm = reactor.heat_power_multiplier;
  if (!hpm || hpm <= 0) return;
  const cur = reactor.current_heat;
  if (!cur || !cur.gt(0)) return;
  const heatNum = cur.toNumber();
  const mult = calculateHeatPowerMultiplier(hpm, heatNum, 1000, 1e100, PERCENT_DIVISOR);
  if (Number.isFinite(mult) && mult > 0 && typeof tile.power === "number") {
    tile.power *= mult;
  }
}

function computeTileContributions(tile, reactor, accum) {
  if (hasTrait(tile.part?.trait_mask, "FUEL_CELL") && tile.ticks > 0) {
    accum.stats_power += tile.power || 0;
    accum.stats_heat_generation += tile.heat || 0;
  }
  if (tile.heat_contained > 0) accum.stats_total_part_heat += tile.heat_contained;
  if (hasTrait(tile.part?.trait_mask, "CAPACITOR")) {
    accum.temp_transfer_multiplier += (tile.part.part.level || 1) * reactor.transfer_capacitor_multiplier;
    accum.temp_vent_multiplier += (tile.part.part.level || 1) * reactor.vent_capacitor_multiplier;
  } else if (hasTrait(tile.part?.trait_mask, "REACTOR_PLATING")) {
    accum.temp_transfer_multiplier += (tile.part.part.level || 1) * reactor.transfer_plating_multiplier;
    accum.temp_vent_multiplier += (tile.part.part.level || 1) * reactor.vent_plating_multiplier;
  }
}

export function deriveReactorStats(gridState, reactor) {
  const tileset = gridState;
  let gridMaxPower = toDecimal(BASE_MAX_POWER);
  let gridMaxHeat = toDecimal(BASE_MAX_HEAT);
  const capTiles = tileset.active_tiles_list;
  for (let i = 0; i < capTiles.length; i++) {
    const tile = capTiles[i];
    if (!tile.activated || !tile.part) continue;
    const p = tile.part;
    if (p.category === "capacitor") {
      gridMaxPower = gridMaxPower.add(toDecimal(p.reactor_power ?? 0));
    } else if (p.category === "reactor_plating") {
      gridMaxHeat = gridMaxHeat.add(toDecimal(p.reactor_heat ?? 0));
      const rp = toDecimal(p.reactor_power ?? 0);
      if (rp.gt(0)) gridMaxPower = gridMaxPower.add(rp);
    }
  }
  const accum = {
    stats_power: 0,
    stats_heat_generation: 0,
    stats_total_part_heat: 0,
    stats_vent: 0,
    stats_inlet: 0,
    stats_outlet: 0,
    current_max_power: gridMaxPower,
    current_max_heat: gridMaxHeat,
    temp_transfer_multiplier: 0,
    temp_vent_multiplier: 0,
  };

  const onReflectorPulse = (r_tile, tile) => {
    const eng = reactor.game?.engine;
    if (eng?.enqueueReflectorVisualPulse) {
      eng.enqueueReflectorVisualPulse(r_tile.row, r_tile.col, tile.row, tile.col);
    }
  };

  tileset.active_tiles_list.forEach((tile) => {
    if (tile.activated && tile.part) {
      tile.powerOutput = 0;
      tile.heatOutput = 0;
      tile.display_power = 0;
      tile.display_heat = 0;
      const p = tile.part;
      if (p.category === "cell" && tile.ticks > 0) {
        const game = reactor.game;
        const pow = game ? getCellPowerCoefficientLP(p, game) : p.base_power || 0;
        const ht = game ? getCellHeatCoefficientH(p, game) : p.base_heat || 0;
        const M = p.cell_pack_M ?? 1;
        const C = Math.max(1, p.cell_count_C ?? p.cell_count ?? 1);
        const N = computeNeighborPulseNFromTile(tile);
        tile.power = calculateCellPulsePower(pow, M, N);
        tile.heat = calculateCellPulseHeat(ht, M, N, C);
      }
    }
  });

  tileset.active_tiles_list.forEach((tile) => {
    if (tile.activated && tile.part) {
      if (tile.part.category === "cell" && tile.ticks > 0) {
        applyReflectorEffects(tile, reactor, onReflectorPulse);
        applyCellMultipliers(tile, reactor);
      }
      computeTileContributions(tile, reactor, accum);
    }
  });

  tileset.active_tiles_list.forEach((tile) => {
    if (!tile.part) return;
    accum.stats_vent += tile.getEffectiveVentValue();
    if (tile.part.category === "heat_inlet") accum.stats_inlet += tile.getEffectiveTransferValue();
    if (tile.part.category === "heat_outlet") accum.stats_outlet += tile.getEffectiveTransferValue();
  });

  let stats_stirling_power = 0;
  const stirlingMult = Number(reactor.stirling_multiplier ?? 0);
  if (stirlingMult > 0) {
    tileset.active_tiles_list.forEach((tile) => {
      if (tile.activated && tile.part?.category === "vent") {
        stats_stirling_power += tile.getEffectiveVentValue() * stirlingMult;
      }
    });
  }
  accum.stats_cell_power = accum.stats_power;
  accum.stats_stirling_power = stats_stirling_power;
  accum.stats_power = accum.stats_power + stats_stirling_power;

  tileset.active_tiles_list.forEach((tile) => {
    if (tile.activated && tile.part) {
      tile.display_power = tile.power || 0;
      tile.display_heat = tile.heat || 0;
    }
  });

  accum.stats_power = Number(accum.stats_power || 0);
  accum.stats_heat_generation = Number(accum.stats_heat_generation || 0);
  accum.stats_total_part_heat = Number(accum.stats_total_part_heat || 0);
  if (!isFinite(accum.stats_power) || isNaN(accum.stats_power)) accum.stats_power = 0;
  accum.stats_net_heat = accum.stats_heat_generation - accum.stats_vent - accum.stats_outlet;
  accum.stats_cash = accum.current_max_power.mul(reactor.auto_sell_multiplier);

  return Object.freeze(accum);
}

export function resetHeatThresholdSignalState(game) {
  heatSfxLastTick.clear();
  if (!game?.state || typeof game.state !== "object") return;
  game.state._firstHighHeatSeen = false;
  game.state.ui_heat_critical = false;
  game.state.ui_pipe_integrity_warning = false;
}
