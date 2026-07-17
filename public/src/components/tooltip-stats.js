import { collectTooltipBonusLinesFromRules } from "../constants/part-tooltip-bonuses.js";
import { requireActiveBridge as requireBridge } from "../bridge/active.js";

function getEffectiveTransfer(part, tile_context) {
  if (!tile_context) return part.transfer;
  const bridge = requireBridge(tile_context.game, "getEffectiveTransfer");
  const rates = bridge.resolveDisplayRatesForTile(tile_context);
  return rates?.transfer ?? tile_context.getEffectiveTransferValue?.() ?? part.transfer;
}

function getEffectiveVent(part, tile_context) {
  if (!tile_context) return part.vent;
  const bridge = requireBridge(tile_context.game, "getEffectiveVent");
  const rates = bridge.resolveDisplayRatesForTile(tile_context);
  return rates?.vent ?? tile_context.getEffectiveVentValue?.() ?? part.vent;
}

export function collectPartSemanticSegments(part, tile_context = null) {
  const bridge = requireBridge(tile_context?.game ?? part.game, "collectPartSemanticSegments");
  const extras = {
    transfer: getEffectiveTransfer(part, tile_context),
    vent: getEffectiveVent(part, tile_context),
    power: part.power,
    heat: part.heat,
    range: part.range,
  };
  const segments = bridge.session.getPartDescription(part.id, {
    template: part.part?.base_description ?? part.base_description,
    ...extras,
  }).segments;
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

export function computeDisplaySellValue(part, tile = null) {
  if (!part) return 0;
  const bridge = requireBridge(tile?.game ?? part.game, "computeDisplaySellValue");
  if (tile && typeof tile.row === "number" && typeof tile.col === "number") {
    return bridge.computeSellValueForTile(tile);
  }
  return bridge.computeSellValueForPart(part.id);
}
