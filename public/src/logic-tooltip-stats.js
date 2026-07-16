import { collectTooltipBonusLinesFromRules } from "./constants/part-tooltip-bonuses.js";
import { formatPartDescription } from "reactor-core";

function getEffectiveTransfer(part, tile_context) {
  if (tile_context) {
    const bridge = tile_context.game?.coreBridge;
    if (bridge?.isActive) {
      const rates = bridge.resolveDisplayRatesForTile(tile_context);
      if (rates) return rates.transfer;
    }
    return tile_context.getEffectiveTransferValue?.() ?? part.transfer;
  }
  return part.transfer;
}

function getEffectiveVent(part, tile_context) {
  if (tile_context) {
    const bridge = tile_context.game?.coreBridge;
    if (bridge?.isActive) {
      const rates = bridge.resolveDisplayRatesForTile(tile_context);
      if (rates) return rates.vent;
    }
    return tile_context.getEffectiveVentValue?.() ?? part.vent;
  }
  return part.vent;
}

function partToCompiledShape(part) {
  return {
    id: part.id,
    title: part.title,
    category: part.category,
    type: part.type,
    level: part.level,
    baseTicks: part.ticks,
    basePower: part.power,
    baseHeat: part.heat,
    containment: part.containment,
    reactorPower: part.reactor_power,
    reactorHeat: part.reactor_heat,
    vent: part.vent,
    transfer: part.transfer,
    powerIncrease: part.power_increase,
    heatIncrease: part.heat_increase,
    cellCount: part.cell_count,
    epHeat: part.ep_heat,
    baseDescription: part.part?.base_description ?? part.base_description,
    definition: part.part,
  };
}

export function collectPartSemanticSegments(part, tile_context = null) {
  const bridge = tile_context?.game?.coreBridge ?? part.game?.coreBridge;
  const extras = {
    transfer: getEffectiveTransfer(part, tile_context),
    vent: getEffectiveVent(part, tile_context),
    power: part.power,
    heat: part.heat,
    range: part.range,
  };
  let segments;
  if (bridge?.isActive && bridge.session?.getPartDescription) {
    segments = bridge.session.getPartDescription(part.id, {
      template: part.part?.base_description ?? part.base_description,
      ...extras,
    }).segments;
  } else {
    segments = formatPartDescription(
      partToCompiledShape(part),
      part.part?.base_description ?? part.base_description,
      extras,
    ).segments;
  }
  if (part.category === "vent" && tile_context?.game) {
    const stirlingLvl = tile_context.game.upgradeset.getUpgrade("stirling_generators")?.level ?? 0;
    if (stirlingLvl > 0) {
      const effectiveVent = extras.vent;
      segments.push({
        kind: "stat",
        unitKey: "STIRLING_POWER_UNITS",
        value: effectiveVent * (stirlingLvl * 0.01),
      });
    }
  }
  return segments;
}

export function getUpgradeBonusLines(obj, context = {}) {
  const lines = [];
  if (!obj || obj.upgrade) return lines;
  const game = context.game ?? obj.game;
  if (!game?.upgradeset) return lines;
  const upg = (id) => game.upgradeset.getUpgrade(id)?.level || 0;
  collectTooltipBonusLinesFromRules(obj.category, upg, obj, context, lines);
  return lines;
}

export function computeNeighborPulseNFromTile(tile) {
  const desc = tile?.game?.coreBridge?.describeCellPulse?.(tile);
  return typeof desc?.pulseN === "number" ? desc.pulseN : 0;
}

export function computeDisplaySellValue(part, tile = null) {
  if (!part) return 0;
  const bridge = tile?.game?.coreBridge ?? part.game?.coreBridge;
  if (!bridge?.isActive) return 0;
  if (tile && typeof tile.row === "number" && typeof tile.col === "number") {
    return bridge.computeSellValueForTile(tile);
  }
  return bridge.computeSellValueForPart?.(part.id) ?? 0;
}
