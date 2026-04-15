import { bundledGameData } from "./bundledStaticData.js";
import { compileTraitBitmask } from "./traits.js";

const PART_TEMPLATES = bundledGameData.parts;

function pow(a, b) {
  return (Number(a) || 1) ** (Number(b) || 0);
}

export function collectAllPartIds() {
  const ids = [];
  for (const p of PART_TEMPLATES) {
    if (typeof p.levels === "number" && p.levels > 0) {
      for (let L = 1; L <= p.levels; L++) ids.push(`${p.id}${L}`);
    } else {
      ids.push(p.id);
    }
  }
  return ids;
}

export function resolvePartTemplate(id) {
  const s = String(id);
  const exact = PART_TEMPLATES.find((p) => p.id === s);
  if (exact && exact.levels == null) {
    return { template: exact, level: exact.level ?? 1 };
  }
  const m = s.match(/^(.+?)(\d+)$/);
  if (!m) return null;
  const baseId = m[1];
  const n = parseInt(m[2], 10);
  const template = PART_TEMPLATES.find((p) => p.id === baseId && typeof p.levels === "number");
  if (!template || n < 1 || n > template.levels) return null;
  return { template, level: n };
}

export function buildPartDefFromCatalog(id) {
  const resolved = resolvePartTemplate(id);
  if (!resolved) return null;
  const { template: t, level } = resolved;
  const costMulti = t.cost_multi ?? 1;
  const baseCost = t.base_cost ?? 0;
  const cost = baseCost * pow(costMulti, level - 1);
  let ticks = t.base_ticks ?? 100;
  if (t.ticks_multiplier != null && level > 1) {
    ticks = (t.base_ticks ?? 100) * pow(t.ticks_multiplier, level - 1);
  }
  let power = t.base_power ?? 0;
  let heat = t.base_heat ?? 0;
  if (t.category === "cell" && level > 1) {
    const m = t.cost_multi ?? 2;
    power = (t.base_power ?? 0) * pow(m, level - 1);
    heat = (t.base_heat ?? 0) * pow(m, level - 1);
  }
  let vent = t.base_vent ?? 0;
  let transfer = t.base_transfer ?? 0;
  let containment = t.base_containment ?? 0;
  let reactor_power = t.base_reactor_power ?? 0;
  let reactor_heat = t.base_reactor_heat ?? 0;
  if (t.category === "vent") {
    containment = t.base_containment ?? 80;
    vent = t.base_vent ?? 4;
    if (level > 1) {
      containment = (t.base_containment ?? 0) * pow((t.containment_multi ?? 75) / 75, level - 1);
      vent = (t.base_vent ?? 0) * pow((t.vent_multiplier ?? 75) / 75, level - 1);
    }
  }
  if (
    (t.category === "heat_exchanger" || t.category === "heat_inlet" || t.category === "heat_outlet") &&
    level > 1
  ) {
    transfer = (t.base_transfer ?? 16) * pow((t.transfer_multiplier ?? 75) / 75, level - 1);
    containment = (t.base_containment ?? 0) * pow((t.containment_multi ?? 75) / 75, level - 1);
  } else if (
    t.category === "heat_exchanger" ||
    t.category === "heat_inlet" ||
    t.category === "heat_outlet"
  ) {
    transfer = t.base_transfer ?? 16;
    containment = t.base_containment ?? 320;
  }
  if (t.category === "capacitor") {
    reactor_power = t.base_reactor_power ?? 0;
    containment = t.base_containment ?? 10;
    if (level > 1) {
      reactor_power = (t.base_reactor_power ?? 0) * pow((t.reactor_power_multi ?? 140) / 140, level - 1);
      containment = (t.base_containment ?? 0) * pow((t.containment_multi ?? 5) / 5, level - 1);
    }
  }
  if (t.category === "reactor_plating" && level > 1) {
    reactor_heat = (t.base_reactor_heat ?? 0) * pow((t.reactor_heat_multiplier ?? 150) / 150, level - 1);
  } else if (t.category === "reactor_plating") {
    reactor_heat = t.base_reactor_heat ?? 250;
  }
  if (t.category === "coolant_cell") {
    containment = t.base_containment ?? 2000;
    if (level > 1) {
      containment = (t.base_containment ?? 0) * pow((t.containment_multi ?? 180) / 180, level - 1);
    }
  }
  let epHeat = t.base_ep_heat ?? 0;
  if (t.category === "particle_accelerator") {
    containment = t.base_containment ?? 1e9;
    if (level > 1 && t.containment_multiplier) {
      containment = (t.base_containment ?? 0) * pow(t.containment_multiplier / 1e6, level - 1);
    }
    epHeat = t.base_ep_heat ?? 5e8;
  }
  const power_inc = (t.base_power_increase ?? 0) + (level > 1 && t.power_increase_add ? (level - 1) * t.power_increase_add : 0);
  const heat_inc = t.base_heat_increase ?? 0;
  const traits = Array.isArray(t.traits) ? t.traits : (t.category === "cell" ? ["FUEL_CELL"] : []);
  const trait_mask = compileTraitBitmask(traits);

  const out = {
    ...t,
    id,
    type: t.type,
    category: t.category,
    level,
    base_power: t.base_power ?? 0,
    base_heat: t.base_heat ?? 0,
    base_cost: baseCost,
    base_ecost: t.base_ecost ?? 0,
    ecost: t.base_ecost ?? 0,
    base_reactor_power: t.base_reactor_power ?? 0,
    base_reactor_heat: t.base_reactor_heat ?? 0,
    base_ep_heat: t.base_ep_heat ?? 0,
    base_vent: t.base_vent ?? 0,
    base_transfer: t.base_transfer ?? 0,
    base_power_increase: t.base_power_increase ?? 0,
    base_heat_increase: t.base_heat_increase ?? 0,
    perpetual: false,
    pBase: power,
    hBase: heat,
    packM: 1,
    cell_pack_M: 1,
    cell_count: t.id === "protium" ? 1 : 0,
    cost,
    ticks,
    power,
    heat,
    vent,
    transfer,
    transfer_multiplier: t.transfer_multiplier ?? 1,
    containment: containment || 1000,
    reactor_power,
    reactor_heat,
    ep_heat: epHeat,
    power_increase: power_inc,
    heat_increase: heat_inc,
    traits,
    trait_mask,
  };
  return out;
}
