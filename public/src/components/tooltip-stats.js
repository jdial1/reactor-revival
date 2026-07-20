import { requireActiveBridge as requireBridge } from "../bridge/active.js";
import { numFormat as fmt } from "../core/numbers.js";
import { getPartImagePath } from "../core/part-images.js";
import { collectTooltipBonusLinesFromRules } from "../constants/part-tooltip-bonuses.js";

export function getUpgradeBonusLines(obj, context = {}) {
  const lines = [];
  if (!obj || obj.upgrade) return lines;
  const game = context.game ?? context.tile?.game;
  if (!game?.upgradeset) return lines;
  const upg = (id) => game.upgradeset.getUpgrade(id)?.level || 0;
  collectTooltipBonusLinesFromRules(obj.category, upg, obj, context, lines);
  return lines;
}

export function partIconPath(part) {
  if (!part) return null;
  return getPartImagePath({
    type: part.type,
    category: part.category,
    level: part.level ?? 1,
    id: part.id,
  });
}

function getEffectiveTransfer(part, tile_context) {
  if (!tile_context) return part.transfer;
  const bridge = requireBridge(tile_context.game, "getEffectiveTransfer");
  const rates = bridge.resolveDisplayRatesForTile(tile_context);
  return rates?.transfer ?? part.transfer;
}

function getEffectiveVent(part, tile_context) {
  if (!tile_context) return part.vent;
  const bridge = requireBridge(tile_context.game, "getEffectiveVent");
  const rates = bridge.resolveDisplayRatesForTile(tile_context);
  return rates?.vent ?? part.vent;
}

export function resolveTileDisplayRate(tile, key) {
  if (!tile?.game) return 0;
  const bridge = requireBridge(tile.game, "resolveTileDisplayRate");
  const rates = bridge.resolveDisplayRatesForTile(tile);
  if (!rates) return 0;
  if (key === "transfer" && tile.part?.category === "vent") {
    return rates.vent ?? rates.transfer ?? 0;
  }
  return rates[key] ?? 0;
}

function partDescriptionPayload(part, tile_context = null, game = null) {
  const bridge = requireBridge(game ?? tile_context?.game, "partDescriptionPayload");
  const extras = {
    transfer: getEffectiveTransfer(part, tile_context),
    vent: getEffectiveVent(part, tile_context),
    power: part.power,
    heat: part.heat,
    range: part.range,
    fmt,
  };
  return {
    bridge,
    extras,
    result: bridge.session.getPartDescription(part.id, {
      template: part.part?.baseDescription ?? part.part?.base_description ?? part.base_description,
      ...extras,
    }),
  };
}

export function resolvePartDescription(part, tile_context = null, game = null) {
  if (!part?.id) return "";
  return partDescriptionPayload(part, tile_context, game).result?.text ?? "";
}

export function collectPartSemanticSegments(part, tile_context = null, game = null) {
  const { extras, result } = partDescriptionPayload(part, tile_context, game);
  const segments = result?.segments ?? [];
  if (part.category === "vent" && tile_context?.game) {
    const stirlingMult = Number(tile_context.game.reactor?.sessionModifiers?.stirling_multiplier ?? 0);
    if (stirlingMult > 0) {
      segments.push({
        kind: "stat",
        unitKey: "STIRLING_POWER_UNITS",
        value: extras.vent * stirlingMult,
      });
    }
  }
  return segments;
}

export function computeDisplaySellValue(part, tile = null, game = null) {
  if (!part) return 0;
  const bridge = requireBridge(game ?? tile?.game, "computeDisplaySellValue");
  if (tile && typeof tile.row === "number" && typeof tile.col === "number") {
    return bridge.computeSellValueForTile(tile);
  }
  return bridge.computeSellValueForPart(part.id);
}
