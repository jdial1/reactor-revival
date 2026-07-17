#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dataDir = path.join(root, "public", "data");
const outDir = path.join(root, "game-data", "reactor_revival");

function pow(a, b) {
  return (Number(a) || 1) ** (Number(b) || 0);
}

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(dataDir, name), "utf8"));
}

function expandPartTemplate(t) {
  const results = [];
  if (typeof t.levels === "number" && t.levels > 0) {
    for (let level = 1; level <= t.levels; level++) {
      results.push(buildComponent(t, level, `${t.id}${level}`));
    }
    return results;
  }
  results.push(buildComponent(t, t.level ?? 1, t.id));
  return results;
}

function buildComponent(template, level, id) {
  const t = template;
  const costMulti = t.cost_multi ?? 1;
  const baseCost = t.base_cost ?? 0;
  const cost = baseCost * pow(costMulti, level - 1);
  const comp = {
    id,
    type: t.type,
    title: t.title,
    category: t.category,
    level,
    baseCost: cost,
    costMultiplier: costMulti,
    traits: t.traits ?? (t.category === "cell" ? ["FUEL_CELL"] : []),
    experimental: t.experimental ?? false,
    erequires: t.erequires ?? null,
    location: t.location ?? null,
    baseTicks: t.base_ticks ?? 0,
    basePower: t.base_power ?? 0,
    baseHeat: t.base_heat ?? 0,
    baseVent: t.base_vent ?? 0,
    baseTransfer: t.base_transfer ?? 0,
    baseContainment: t.base_containment ?? 0,
    baseReactorPower: t.base_reactor_power ?? 0,
    baseReactorHeat: t.base_reactor_heat ?? 0,
    baseEpHeat: t.base_ep_heat ?? 0,
    basePowerIncrease: t.base_power_increase ?? 0,
    baseHeatIncrease: t.base_heat_increase ?? 0,
    powerIncreaseAdd: t.power_increase_add ?? 0,
    ventConsumesPower: t.vent_consumes_power ?? false,
    capacitorAutosellHeatRatio: t.capacitor_autosell_heat_ratio ?? 0,
    outletRespectNeighborCap: t.outlet_respect_neighbor_cap ?? false,
    cellTickUpgradeCost: t.cell_tick_upgrade_cost ?? null,
    cellPowerUpgradeCost: t.cell_power_upgrade_cost ?? null,
    cellPerpetualUpgradeCost: t.cell_perpetual_upgrade_cost ?? null,
  };

  const MULTIPLIERS = [
    { base: "baseTicks", src: "base_ticks", mult: "ticks_multiplier", norm: 1 },
    { base: "baseVent", src: "base_vent", mult: "vent_multiplier", norm: 75 },
    { base: "baseTransfer", src: "base_transfer", mult: "transfer_multiplier", norm: 75 },
    { base: "baseReactorPower", src: "base_reactor_power", mult: "reactor_power_multi", norm: 140 },
    { base: "baseReactorHeat", src: "base_reactor_heat", mult: "reactor_heat_multiplier", norm: 150 },
    { base: "baseContainment", src: "base_containment", mult: "containment_multiplier", norm: 1e6 },
    { base: "baseContainment", src: "base_containment", mult: "containment_multi", norm: t.containment_norm ?? (t.category === "capacitor" ? 5 : (t.category === "coolant_cell" ? 180 : 75)) },
  ];

  for (const { base, src, mult } of MULTIPLIERS) {
    if (t[src] != null && t[mult] != null && level > 1) {
      comp[base] = t[src] * pow(t[mult], level - 1);
    }
  }

  if (t.category === "cell" && level > 1) {
    const m = t.cost_multi ?? 2;
    comp.basePower = (t.base_power ?? 0) * pow(m, level - 1);
    comp.baseHeat = (t.base_heat ?? 0) * pow(m, level - 1);
  }

  if (t.category === "cell") {
    comp.cellCount = level === 1 ? 1 : (level === 2 ? 2 : 4);
    comp.pulseMultiplier = 1;
    comp.cellMultiplier = level === 1 ? 1 : (level === 2 ? 4 : 12);
  }

  if (t.category === "reflector" && level > 1 && t.power_increase_add) {
    comp.basePowerIncrease = (t.base_power_increase ?? 0) + (level - 1) * t.power_increase_add;
  }

  comp.power = comp.basePower;
  comp.heat = comp.baseHeat;
  comp.vent = comp.baseVent;
  comp.transfer = comp.baseTransfer;
  comp.containment = comp.baseContainment;
  comp.reactorPower = comp.baseReactorPower;
  comp.reactorHeat = comp.baseReactorHeat;
  comp.epHeat = comp.baseEpHeat;
  comp.powerIncrease = comp.basePowerIncrease;
  comp.heatIncrease = comp.baseHeatIncrease;
  comp.valve_group = t.valve_group ?? null;
  comp.activation_threshold = t.activation_threshold ?? null;
  comp.transfer_direction = t.transfer_direction ?? null;
  comp.transfer_multiplier = t.transfer_multiplier ?? null;

  return comp;
}

const parts = readJson("part_list.json");
const upgrades = readJson("upgrade_list.json");
const objectives = readJson("objective_list.json");
const achievements = readJson("achievement_list.json");
const techTree = readJson("tech_tree.json");
const difficulty = readJson("difficulty_curves.json");
const helpText = readJson("help_text.json");
const flavorText = readJson("flavor_text.json");
const failureFlavor = readJson("failure_flavor.json");

const components = parts.flatMap(expandPartTemplate);

const categories = [
  { id: "cell", label: "FUEL CELLS" },
  { id: "reflector", label: "REFLECTORS" },
  { id: "capacitor", label: "CAPACITORS" },
  { id: "vent", label: "HEAT VENTS" },
  { id: "heat_exchanger", label: "HEAT EXCHANGERS" },
  { id: "heat_inlet", label: "HEAT INLETS" },
  { id: "heat_outlet", label: "HEAT OUTLETS" },
  { id: "coolant_cell", label: "COOLANT CELLS" },
  { id: "reactor_plating", label: "REACTOR PLATING" },
  { id: "particle_accelerator", label: "PARTICLE ACCELERATORS" },
  { id: "valve", label: "VALVES" },
];

const manifest = {
  id: "reactor_revival",
  name: "Reactor Revival",
  description: "Canonical Reactor Revival game definition.",
  version: "2.0.0",
  saveVersion: 2,
  tickRate: 1000,
  tickRateMs: 1000,
  tickRateUpgradable: true,
  baseTicksPerSecond: 1,
  gridDefaults: {
    rows: 12,
    cols: 12,
    minRows: 6,
    minCols: 6,
    maxRows: 50,
    maxCols: 50,
    expandableRows: 38,
    expandableCols: 38,
    baseMaxHeat: 1000,
    baseMaxPower: 100,
  },
  features: {
    heatSuppression: true,
    breederMechanics: false,
    environmentalCooling: false,
    exchangerRouting: true,
    moxScaling: false,
    fluidMode: false,
    legacyLoopOrder: true,
    pendingDestruction: true,
    generatesMoney: true,
    doubleBufferedHeat: false,
    condensatorCooling: false,
    prestigeMechanics: true,
    offlineProgression: true,
    autoReplace: true,
    upgradeModifiers: true,
    chronometerSpeed: true,
    forcefulFusion: true,
    heatControlOperator: true,
    particleAccelerators: true,
    experimentalUpgrades: true,
    valveMechanics: true,
    tileHeatMap: true,
    pressureExchangers: true,
    containmentExplosions: true,
    reactorStats: true,
    intentEconomy: true,
    sustainedObjectives: true,
    failureStates: true,
    decimalEconomy: true,
    objectives: true,
    achievements: true,
    blueprintPlanner: true,
  },
  economy: {
    currency: "Money",
    baseMoney: 10,
    autoSellPower: true,
    exoticParticles: "Exotic Particles",
    prestigeCurrency: "Exotic Particles",
    weaveQuantum: 1000000,
    prestigeMultiplierPerEp: 0.001,
    prestigeMultiplierCap: 100,
  },
  mechanics: {
    meltdownThreshold: "failure_states",
    meltdownHeatMultiplier: 2,
    gracePeriodTicks: 30,
    hullRepelFraction: 0.05,
    offlineProgression: true,
    valve: {
      overflowThreshold: 0.8,
      topupThreshold: 0.2,
      topupCapRatio: 0.2,
    },
    exchanger: {
      diffDivisor: 2,
      minTransferUnit: 1,
      maxIterations: 10000,
    },
    cell: {
      defaultCellCount: 1,
      pulseFromReflectors: true,
      heatFormula: "pulseSquaredOverC",
    },
    failure: {
      meltdownHeatMultiplier: 2,
      gracePeriodTicks: 30,
      hullRepelFraction: 0.05,
      fragmentationExplosionChance: 0.12,
      saturationRatio: 1.1,
      hullDecayPerOverpressure: 5,
    },
    economy: {
      powerOverflowToHeatRatio: 1,
      defaultOverflowRatio: 0.5,
      autoSellBasis: "maxPower",
    },
    offline: {
      welcomeBackThresholdMs: 30000,
      maxCatchupTicks: 100,
      maxCatchupMs: 100000,
    },
  },
  categories,
};

const research = {
  techTree,
  objectives,
  achievements,
  difficulty,
  presentation: {
    helpText,
    flavorText,
    failureFlavor,
  },
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "data.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
fs.writeFileSync(path.join(outDir, "parts.json"), `${JSON.stringify({ components }, null, 2)}\n`, "utf8");
fs.writeFileSync(path.join(outDir, "upgrades.json"), `${JSON.stringify(upgrades, null, 2)}\n`, "utf8");
fs.writeFileSync(path.join(outDir, "research.json"), `${JSON.stringify(research, null, 2)}\n`, "utf8");
console.log(`Wrote ${outDir} (${components.length} components)`);
