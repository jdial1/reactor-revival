const REACTOR_PLATING_DEFAULT_CONTAINMENT = 1000;
const PERCENT_DIVISOR = 100;
const EP_DISPLAY_THRESHOLD = 1000000;
const HEAT_LOG_CAP = 1e100;
const HEAT_LOG_BASE = 1000;
const ISOTOPE_STABILIZATION_FACTOR = 0.05;
const PROTIUM_PARTICLE_FACTOR = 0.1;
const COMPONENT_REINFORCEMENT_FACTOR = 0.1;
const CATALYST_REDUCTION_CAP = 0.75;

function getUpgradeLevel(us, id) {
  return us.getUpgrade(id)?.level || 0;
}

function gatherUpgradeLevels(game) {
  const us = game.upgradeset;
  const level = (id) => getUpgradeLevel(us, id);
  return {
    improvedAlloys: level("improved_alloys"),
    quantumBuffering: level("quantum_buffering"),
    improvedWiring: level("improved_wiring"),
    improvedCoolantCells: level("improved_coolant_cells"),
    improvedNeutronReflection: level("improved_neutron_reflection"),
    improvedHeatExchangers: level("improved_heat_exchangers"),
    improvedHeatVents: level("improved_heat_vents"),
    fullSpectrumReflectors: level("full_spectrum_reflectors"),
    fluidHyperdynamics: level("fluid_hyperdynamics"),
    fractalPiping: level("fractal_piping"),
    ultracryonics: level("ultracryonics"),
    infusedCells: level("infused_cells"),
    unleashedCells: level("unleashed_cells"),
    unstableProtium: level("unstable_protium"),
    componentReinforcement: level("component_reinforcement"),
    isotopeStabilization: level("isotope_stabilization"),
    quantumTunneling: level("quantum_tunneling"),
  };
}

function computeTickMultiplier(part, game, levels) {
  let tickMultiplier = 1;
  if (part.category === "cell") {
    const tickUpgrade = game.upgradeset.getUpgrade(`${part.type}1_cell_tick`);
    if (tickUpgrade) tickMultiplier = Math.pow(2, tickUpgrade.level);
    if (part.type === "protium" && levels.unstableProtium > 0)
      tickMultiplier /= Math.pow(2, levels.unstableProtium);
    if (levels.isotopeStabilization > 0)
      tickMultiplier *= 1 + levels.isotopeStabilization * ISOTOPE_STABILIZATION_FACTOR;
  }
  if (part.category === "reflector") {
    const densityUpgrade = game.upgradeset.getUpgrade("improved_reflector_density");
    if (densityUpgrade && densityUpgrade.level > 0) tickMultiplier = 1 + densityUpgrade.level;
  }
  return tickMultiplier;
}

function computePowerMultiplier(part, game, levels) {
  let powerMultiplier = 1;
  if (part.category === "cell") {
    const powerUpgrade = game.upgradeset.getUpgrade(`${part.type}1_cell_power`);
    if (powerUpgrade) powerMultiplier = Math.pow(2, powerUpgrade.level);
    if (levels.infusedCells > 0) powerMultiplier *= Math.pow(2, levels.infusedCells);
    if (levels.unleashedCells > 0) powerMultiplier *= Math.pow(2, levels.unleashedCells);
    if (part.type === "protium" && levels.unstableProtium > 0)
      powerMultiplier *= Math.pow(2, levels.unstableProtium);
    if (part.type === "protium" && game.protium_particles > 0)
      powerMultiplier *= 1 + game.protium_particles * PROTIUM_PARTICLE_FACTOR;
  }
  return powerMultiplier;
}

function computeCapacitorMultipliers(part, levels) {
  let capacitorPowerMultiplier = 1;
  let capacitorContainmentMultiplier = 1;
  if (part.category === "capacitor") {
    if (levels.improvedWiring > 0) {
      capacitorPowerMultiplier *= levels.improvedWiring + 1;
      capacitorContainmentMultiplier *= levels.improvedWiring + 1;
    }
    if (levels.quantumBuffering > 0) {
      capacitorPowerMultiplier *= Math.pow(2, levels.quantumBuffering);
      capacitorContainmentMultiplier *= Math.pow(2, levels.quantumBuffering);
    }
  }
  return { capacitorPowerMultiplier, capacitorContainmentMultiplier };
}

function applyHeatExchangerUpgrades(levels) {
  let transfer = 1;
  let containment = 1;
  if (levels.improvedHeatExchangers > 0) {
    transfer *= levels.improvedHeatExchangers + 1;
    containment *= levels.improvedHeatExchangers + 1;
  }
  if (levels.fluidHyperdynamics > 0) transfer *= Math.pow(2, levels.fluidHyperdynamics);
  if (levels.fractalPiping > 0) containment *= Math.pow(2, levels.fractalPiping);
  return { transfer, containment };
}

function isTransferExchangerCategory(part) {
  return part.category === "heat_exchanger" || part.category === "heat_inlet" || part.category === "heat_outlet";
}

function computeTransferExchangerMultipliers(part, levels) {
  let transferMultiplier = 1;
  let heatExchangerContainmentMultiplier = 1;
  if (isTransferExchangerCategory(part)) {
    const ex = applyHeatExchangerUpgrades(levels);
    transferMultiplier *= ex.transfer;
    heatExchangerContainmentMultiplier *= ex.containment;
  }
  if (part.category === "valve" && part.part.transfer_multiplier)
    transferMultiplier *= part.part.transfer_multiplier;
  return { transferMultiplier, heatExchangerContainmentMultiplier };
}

function computeVentMultipliers(part, levels) {
  let ventMultiplier = 1;
  let ventContainmentMultiplier = 1;
  if (part.category === "vent") {
    if (levels.improvedHeatVents > 0) {
      ventMultiplier *= 1 + levels.improvedHeatVents;
      ventContainmentMultiplier *= levels.improvedHeatVents + 1;
    }
    if (levels.fluidHyperdynamics > 0) ventMultiplier *= Math.pow(2, levels.fluidHyperdynamics);
    if (levels.fractalPiping > 0) ventContainmentMultiplier *= Math.pow(2, levels.fractalPiping);
  }
  return { ventMultiplier, ventContainmentMultiplier };
}

function computeCoolantContainmentMultiplier(part, levels) {
  let coolantContainmentMultiplier = 1;
  if (part.category === "coolant_cell") {
    if (levels.improvedCoolantCells > 0) coolantContainmentMultiplier *= levels.improvedCoolantCells + 1;
    if (levels.ultracryonics > 0) coolantContainmentMultiplier *= Math.pow(2, levels.ultracryonics);
  }
  return coolantContainmentMultiplier;
}

function computeReflectorPowerIncreaseMultiplier(part, levels) {
  let reflectorPowerIncreaseMultiplier = 1;
  if (part.category === "reflector") {
    if (levels.improvedNeutronReflection > 0)
      reflectorPowerIncreaseMultiplier *= 1 + levels.improvedNeutronReflection / PERCENT_DIVISOR;
    if (levels.fullSpectrumReflectors > 0) reflectorPowerIncreaseMultiplier += levels.fullSpectrumReflectors;
  }
  return reflectorPowerIncreaseMultiplier;
}

function computeCoolantReflectorMultipliers(part, levels) {
  return {
    coolantContainmentMultiplier: computeCoolantContainmentMultiplier(part, levels),
    reflectorPowerIncreaseMultiplier: computeReflectorPowerIncreaseMultiplier(part, levels),
  };
}

function computeEpHeatMultiplier(part, game) {
  let epHeatMultiplier = 1;
  if (part.category === "particle_accelerator") {
    const levelUpgrade = game.upgradeset.getUpgrade(`improved_particle_accelerators${part.part.level}`);
    if (levelUpgrade) epHeatMultiplier *= levelUpgrade.level + 1;
  }
  return epHeatMultiplier;
}

function computeEpHeatScale(part, game) {
  let epHeatScale = 1;
  if (part.category === "particle_accelerator") {
    const epRaw = game.state.current_exotic_particles ?? game.exoticParticleManager.exotic_particles;
    const epValue = epRaw != null && typeof epRaw.toNumber === "function" ? epRaw.toNumber() : Number(epRaw);
    const epValueFinite = Number.isFinite(epValue) ? epValue : 0;
    if (epValueFinite > EP_DISPLAY_THRESHOLD) {
      const ratio = epValueFinite / EP_DISPLAY_THRESHOLD;
      const scale = 1 + Math.log10(ratio);
      if (isFinite(scale) && !isNaN(scale)) epHeatScale = scale;
    }
  }
  return epHeatScale;
}

function applyBaseCellStats(part, levels, m) {
  part.reactor_heat = part.base_reactor_heat * (1 + levels.improvedAlloys) * Math.pow(2, levels.quantumBuffering);
  part.power = part.base_power * m.powerMultiplier;
  part.heat = part.base_heat;
  if (part.category === "cell" && levels.unleashedCells > 0) part.heat *= Math.pow(2, levels.unleashedCells);
  if (part.category === "cell" && part.type === "protium" && levels.unstableProtium > 0)
    part.heat *= Math.pow(2, levels.unstableProtium);
  part.ticks = part.base_ticks * m.tickMultiplier;
}

function applyContainmentVent(part, levels, m) {
  let baseContainmentMult = 1;
  if (levels.componentReinforcement > 0) baseContainmentMult += levels.componentReinforcement * COMPONENT_REINFORCEMENT_FACTOR;
  part.containment =
    (part.base_containment || (part.category === "reactor_plating" ? REACTOR_PLATING_DEFAULT_CONTAINMENT : 0)) *
    baseContainmentMult *
    m.capacitorContainmentMultiplier *
    m.heatExchangerContainmentMultiplier *
    m.ventContainmentMultiplier *
    m.coolantContainmentMultiplier;
  part.vent = (part.base_vent || 0) * m.ventMultiplier;
  part.reactor_power = part.base_reactor_power * m.capacitorPowerMultiplier;
}

function applyTransferPlating(part, game, m) {
  part.transfer = part.base_transfer * m.transferMultiplier;
  if (part.category === "reactor_plating") {
    part.transfer = game.reactor.plating_transfer_rate > 0 ? part.containment * game.reactor.plating_transfer_rate : 0;
  }
}

function applyRangeWithTunneling(part, levels) {
  part.range = part.base_range;
  if (part.category === "heat_inlet" || part.category === "heat_outlet") {
    if (levels.quantumTunneling > 0) part.range += levels.quantumTunneling;
  }
}

function applyEpHeatWithFallback(part, game, m) {
  let epHeatAfter = part.base_ep_heat * m.epHeatMultiplier * m.epHeatScale;
  if (part.category === "particle_accelerator" && game.reactor.catalyst_reduction > 0) {
    const reduction = Math.min(CATALYST_REDUCTION_CAP, game.reactor.catalyst_reduction);
    epHeatAfter *= 1 - reduction;
  }
  if (!isFinite(epHeatAfter) || isNaN(epHeatAfter)) {
    const fallback = part.base_ep_heat * m.epHeatMultiplier;
    epHeatAfter = Number.isFinite(fallback) ? fallback : part.base_ep_heat || 0;
  }
  part.ep_heat = epHeatAfter;
}

function applyCostsIncreases(part, m) {
  part.power_increase = part.base_power_increase * m.reflectorPowerIncreaseMultiplier;
  part.heat_increase = part.base_heat_increase;
  part.cost = part.base_cost;
  part.ecost = part.base_ecost;
}

function applyMultipliersToPart(part, game, levels, m) {
  applyBaseCellStats(part, levels, m);
  applyContainmentVent(part, levels, m);
  applyTransferPlating(part, game, m);
  applyRangeWithTunneling(part, levels);
  applyEpHeatWithFallback(part, game, m);
  applyCostsIncreases(part, m);
}

function isPerpetualForCell(part, game) {
  const upg = game.upgradeset.getUpgrade(`${part.id}_cell_perpetual`);
  return upg != null && upg.level > 0;
}

function isPerpetualForReflector(game) {
  const upg = game.upgradeset.getUpgrade("perpetual_reflectors");
  return upg != null && upg.level > 0;
}

function isPerpetualForCapacitor(game) {
  const upg = game.upgradeset.getUpgrade("perpetual_capacitors");
  return upg != null && upg.level > 0;
}

function applyPerpetualFlag(part, game) {
  part.perpetual = false;
  if (part.category === "cell" && isPerpetualForCell(part, game)) part.perpetual = true;
  else if (part.category === "reflector" && isPerpetualForReflector(game)) part.perpetual = true;
  else if (part.category === "capacitor" && isPerpetualForCapacitor(game)) part.perpetual = true;
}

function applyHeatPowerMultiplier(part, game) {
  if (part.category !== "cell" || game.reactor.heat_power_multiplier <= 0 || game.reactor.current_heat <= 0) return;
  const rawHeat = game.reactor.current_heat;
  const heatNum = typeof rawHeat?.toNumber === "function" ? rawHeat.toNumber() : Number(rawHeat);
  const heatForLog = Math.min(heatNum, HEAT_LOG_CAP);
  const heatMultiplier =
    1 +
    game.reactor.heat_power_multiplier *
      (Math.log(heatForLog) / Math.log(HEAT_LOG_BASE) / PERCENT_DIVISOR);
  part.power *= heatMultiplier;
  if (!isFinite(part.power) || isNaN(part.power)) part.power = part.base_power || 0;
}

export function recalculatePartStats(part) {
  const game = part.game;
  const levels = gatherUpgradeLevels(game);
  const tickMultiplier = computeTickMultiplier(part, game, levels);
  const powerMultiplier = computePowerMultiplier(part, game, levels);
  const { capacitorPowerMultiplier, capacitorContainmentMultiplier } = computeCapacitorMultipliers(part, levels);
  const { transferMultiplier, heatExchangerContainmentMultiplier } =
    computeTransferExchangerMultipliers(part, levels);
  const { ventMultiplier, ventContainmentMultiplier } = computeVentMultipliers(part, levels);
  const { coolantContainmentMultiplier, reflectorPowerIncreaseMultiplier } =
    computeCoolantReflectorMultipliers(part, levels);
  const epHeatMultiplier = computeEpHeatMultiplier(part, game);
  const epHeatScale = computeEpHeatScale(part, game);
  const m = {
    tickMultiplier,
    powerMultiplier,
    capacitorPowerMultiplier,
    capacitorContainmentMultiplier,
    transferMultiplier,
    heatExchangerContainmentMultiplier,
    ventMultiplier,
    ventContainmentMultiplier,
    coolantContainmentMultiplier,
    reflectorPowerIncreaseMultiplier,
    epHeatMultiplier,
    epHeatScale,
  };
  applyMultipliersToPart(part, game, levels, m);
  applyPerpetualFlag(part, game);
  applyHeatPowerMultiplier(part, game);
}
