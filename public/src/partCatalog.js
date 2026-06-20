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
    pBase: t.base_power ?? 0,
    hBase: t.base_heat ?? 0,
    packM: 1,
    cell_pack_M: 1,
    cell_count: t.id === "protium" ? 1 : 0,
    cost,
    transfer_multiplier: t.transfer_multiplier ?? 1,
  };

  out.containment = t.base_containment ?? (t.category === "coolant_cell" ? 2000 : (t.category === "vent" ? 80 : (t.category === "heat_exchanger" ? 320 : (t.category === "capacitor" ? 10 : 1000))));

  const MULTIPLIERS = [
    { base: 'base_ticks', mult: 'ticks_multiplier', norm: 1 },
    { base: 'base_vent', mult: 'vent_multiplier', norm: 75 },
    { base: 'base_transfer', mult: 'transfer_multiplier', norm: 75 },
    { base: 'base_reactor_power', mult: 'reactor_power_multi', norm: 140 },
    { base: 'base_reactor_heat', mult: 'reactor_heat_multiplier', norm: 150 },
    { base: 'base_containment', mult: 'containment_multiplier', norm: 1e6 },
    { base: 'base_containment', mult: 'containment_multi', norm: t.containment_norm ?? (t.category === 'capacitor' ? 5 : (t.category === 'coolant_cell' ? 180 : 75)) },
  ];

  for (let i = 0; i < MULTIPLIERS.length; i++) {
    const { base, mult, norm } = MULTIPLIERS[i];
    if (t[base] != null && t[mult] != null && level > 1) {
      out[base] = t[base] * pow(t[mult] / norm, level - 1);
    }
  }

  if (t.category === "cell" && level > 1) {
    const m = t.cost_multi ?? 2;
    out.base_power = (t.base_power ?? 0) * pow(m, level - 1);
    out.base_heat = (t.base_heat ?? 0) * pow(m, level - 1);
    out.pBase = out.base_power;
    out.hBase = out.base_heat;
  }

  const power_inc = (t.base_power_increase ?? 0) + (level > 1 && t.power_increase_add ? (level - 1) * t.power_increase_add : 0);
  const heat_inc = t.base_heat_increase ?? 0;
  const traits = (Array.isArray(t.traits) && t.traits.length > 0) ? t.traits : (t.category === "cell" ? ["FUEL_CELL"] : []);
  const trait_mask = compileTraitBitmask(traits);

  out.ticks = out.base_ticks ?? 100;
  out.power = out.base_power;
  out.heat = out.base_heat;
  out.vent = out.base_vent;
  out.transfer = out.base_transfer;
  if (out.base_containment != null) out.containment = out.base_containment;
  out.reactor_power = out.base_reactor_power;
  out.reactor_heat = out.base_reactor_heat;
  out.ep_heat = out.base_ep_heat;

  out.power_increase = power_inc;
  out.heat_increase = heat_inc;
  out.traits = traits;
  out.trait_mask = trait_mask;

  return out;
}
