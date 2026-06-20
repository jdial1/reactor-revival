import { calculateNeutronPulsePower, calculateQuadraticHeat } from "./kernel/physics.js";

const PCT_BASE = 100;
const SINGLE_CELL_DESC_TPL = "Creates %power power. Creates %heat heat. Lasts %ticks ticks.";
const MULTI_CELL_DESC_TPL = "Acts as %count %type cells. Creates %power power. Creates %heat heat. Lasts %ticks ticks";
const TITLE_PREFIX_STRIP = /Dual |Quad /;
const CELL_COUNTS_BY_LEVEL = [1, 2, 4];

function getBaseDescriptionTemplate(part) {
  const baseDescTpl = part.part.base_description;
  if (baseDescTpl === "%single_cell_description") return SINGLE_CELL_DESC_TPL;
  if (baseDescTpl === "%multi_cell_description") return MULTI_CELL_DESC_TPL;
  if (!baseDescTpl) return part.part.cell_count > 1 ? MULTI_CELL_DESC_TPL : SINGLE_CELL_DESC_TPL;
  return baseDescTpl;
}

function getEffectiveTransfer(part, tile_context) {
  return tile_context ? tile_context.getEffectiveTransferValue() : part.transfer;
}

function getEffectiveVent(part, tile_context) {
  return tile_context ? tile_context.getEffectiveVentValue() : part.vent;
}

function getCellCountForDesc(part) {
  const cellLevelIndex = (part.part.level || 1) - 1;
  return CELL_COUNTS_BY_LEVEL[cellLevelIndex] ?? part.cell_count ?? 1;
}

export function collectPartSemanticSegments(part, tile_context = null) {
  const tpl = getBaseDescriptionTemplate(part);
  const effectiveTransfer = getEffectiveTransfer(part, tile_context);
  const effectiveVent = getEffectiveVent(part, tile_context);
  const cellCountForDesc = getCellCountForDesc(part);
  const typeLabel = part.part.title.replace(TITLE_PREFIX_STRIP, "");
  const segments = [];
  if (tpl.includes("%count")) segments.push({ kind: "text", unitKey: "CELL_COUNT", value: cellCountForDesc });
  if (tpl.includes("%type")) segments.push({ kind: "text", unitKey: "CELL_TYPE", value: typeLabel });
  if (tpl.includes("%power_increase")) segments.push({ kind: "stat", unitKey: "POWER_INCREASE_UNITS", value: part.power_increase });
  if (tpl.includes("%heat_increase")) segments.push({ kind: "stat", unitKey: "HEAT_INCREASE_UNITS", value: part.heat_increase, places: 0 });
  if (tpl.includes("%reactor_power")) segments.push({ kind: "stat", unitKey: "REACTOR_POWER_UNITS", value: part.reactor_power });
  if (tpl.includes("%reactor_heat")) segments.push({ kind: "stat", unitKey: "REACTOR_HEAT_UNITS", value: part.reactor_heat, places: 0 });
  if (tpl.includes("%ticks")) segments.push({ kind: "stat", unitKey: "TICKS_UNITS", value: part.ticks });
  if (tpl.includes("%containment")) segments.push({ kind: "stat", unitKey: "CONTAINMENT_UNITS", value: part.containment, places: 0 });
  if (tpl.includes("%ep_heat")) segments.push({ kind: "stat", unitKey: "EP_HEAT_UNITS", value: part.ep_heat, places: 0 });
  if (tpl.includes("%range")) segments.push({ kind: "stat", unitKey: "RANGE_UNITS", value: part.range });
  if (tpl.includes("%power")) segments.push({ kind: "stat", unitKey: "POWER_UNITS", value: part.power });
  if (tpl.includes("%heat")) segments.push({ kind: "stat", unitKey: "HEAT_UNITS", value: part.heat, places: 0 });
  if (tpl.includes("%transfer")) segments.push({ kind: "stat", unitKey: "TRANSFER_UNITS", value: effectiveTransfer });
  if (tpl.includes("%vent")) segments.push({ kind: "stat", unitKey: "VENT_UNITS", value: effectiveVent });
  return segments;
}

function pctFromMultiplier(mult) {
  return Math.round((mult - 1) * PCT_BASE);
}

function addVentBonusLines(obj, upg, lines, context) {
  const tile = context?.tile;
  const tev = upg("improved_heat_vents");
  if (tev > 0) {
    lines.push(`<span class="pos">+${tev * PCT_BASE}%</span> venting`);
    lines.push(`<span class="pos">+${tev * PCT_BASE}%</span> max heat`);
  }
  const av = upg("active_venting");
  if (av > 0 && tile?.containmentNeighborTiles) {
    let capCount = 0;
    for (const neighbor of tile.containmentNeighborTiles) {
      if (neighbor.part && neighbor.part.category === "capacitor") {
        capCount += neighbor.part.part?.level || neighbor.part.level || 1;
      }
    }
    if (capCount > 0) {
      const pct = av * capCount;
      lines.push(`<span class="pos">+${pct}%</span> venting from ${capCount} capacitor neighbors`);
    }
  }
}

function addHeatExchangerBonusLines(obj, upg, lines) {
  const ihe = upg("improved_heat_exchangers");
  if (ihe > 0) lines.push(`<span class="pos">+${ihe * PCT_BASE}%</span> transfer, <span class="pos">+${ihe * PCT_BASE}%</span> max heat`);
}

function addInletOutletBonusLines(obj, upg, lines) {
  const ihe = upg("improved_heat_exchangers");
  if (ihe > 0) lines.push(`<span class="pos">+${ihe * PCT_BASE}%</span> transfer, <span class="pos">+${ihe * PCT_BASE}%</span> max heat`);
}

function addCapacitorBonusLines(obj, upg, lines) {
  const iw = upg("improved_wiring");
  if (iw > 0) lines.push(`<span class="pos">+${iw * PCT_BASE}%</span> power capacity, <span class="pos">+${iw * PCT_BASE}%</span> max heat`);
}

function addCoolantCellBonusLines(obj, upg, lines) {
  const icc = upg("improved_coolant_cells");
  if (icc > 0) lines.push(`<span class="pos">+${icc * PCT_BASE}%</span> max heat`);
}

function addReflectorBonusLines(obj, upg, lines) {
  const ird = upg("improved_reflector_density");
  if (ird > 0) lines.push(`<span class="pos">+${ird * PCT_BASE}%</span> duration`);
  const inr = upg("improved_neutron_reflection");
  if (inr > 0) lines.push(`<span class="pos">+${inr}%</span> power reflection`);
}

function addReactorPlatingBonusLines(_obj, _upg, _lines) {}

function addParticleAcceleratorBonusLines(obj, upg, lines) {
  const lvl = obj.level || 1;
  const id = lvl === 6 ? "improved_particle_accelerators6" : "improved_particle_accelerators1";
  const ipa = upg(id);
  if (ipa > 0) lines.push(`<span class="pos">+${pctFromMultiplier(Math.pow(2, ipa))}%</span> EP heat cap`);
}

function addCellBonusLines(obj, upg, lines, context) {
  const game = context?.game;
  if (!game?.upgradeset) return;
  const powerUpg = game.upgradeset.getUpgrade(`${obj.type}1_cell_power`);
  if (powerUpg?.level > 0) lines.push(`<span class="pos">+${pctFromMultiplier(Math.pow(2, powerUpg.level))}%</span> power`);
  const tickUpg = game.upgradeset.getUpgrade(`${obj.type}1_cell_tick`);
  if (tickUpg?.level > 0) lines.push(`<span class="pos">+${pctFromMultiplier(Math.pow(2, tickUpg.level))}%</span> duration`);
  const perpUpg = game.upgradeset.getUpgrade(`${obj.type}1_cell_perpetual`);
  if (perpUpg?.level > 0) lines.push("Auto-replacement enabled");
}

const CATEGORY_BONUS_HANDLERS = {
  vent: addVentBonusLines,
  heat_exchanger: addHeatExchangerBonusLines,
  heat_inlet: addInletOutletBonusLines,
  heat_outlet: addInletOutletBonusLines,
  capacitor: addCapacitorBonusLines,
  coolant_cell: addCoolantCellBonusLines,
  reflector: addReflectorBonusLines,
  reactor_plating: addReactorPlatingBonusLines,
  particle_accelerator: addParticleAcceleratorBonusLines,
  cell: addCellBonusLines,
};

export function getUpgradeBonusLines(obj, context = {}) {
  const lines = [];
  if (!obj || obj.upgrade) return lines;
  const game = context.game ?? obj.game;
  if (!game?.upgradeset) return lines;
  const upg = (id) => game.upgradeset.getUpgrade(id)?.level || 0;
  const handler = CATEGORY_BONUS_HANDLERS[obj.category];
  if (handler) handler(obj, upg, lines, context);
  return lines;
}

export function computeNeighborPulseNFromTile(tile) {
  let N = 0;
  const cellNeighbors = tile.cellNeighborTiles || [];
  for (let ni = 0; ni < cellNeighbors.length; ni++) {
    const nb = cellNeighbors[ni];
    if (nb.part?.category === "cell" && (nb.ticks ?? 0) > 0) N += nb.part.cell_count || 1;
  }
  const reflectors = tile.reflectorNeighborTiles || [];
  for (let ri = 0; ri < reflectors.length; ri++) {
    const rb = reflectors[ri];
    if ((rb.ticks ?? 0) > 0 && rb.part?.category === "reflector") {
      const v = rb.part.neighbor_pulse_value;
      N += typeof v === "number" && isFinite(v) && v >= 0 ? v : 1;
    }
  }
  return N;
}

export function calculateCellPulsePower(coefficient, M, N) {
  return calculateNeutronPulsePower(coefficient, M, N);
}

export function calculateCellPulseHeat(Hbase, M, N, C) {
  return calculateQuadraticHeat(Hbase, M, N, C);
}
