const PCT_BASE = 100;

export const PART_TOOLTIP_BONUS_RULES = Object.freeze({
  vent: Object.freeze([
    Object.freeze({
      upgradeId: "active_venting",
      neighborCategory: "capacitor",
      pctPerNeighborLevel: 1,
      label: "venting from {neighborCount} capacitor neighbors",
    }),
  ]),
  particle_accelerator: Object.freeze([
    Object.freeze({
      upgradeByPartLevel: Object.freeze({ 6: "improved_particle_accelerators6", default: "improved_particle_accelerators1" }),
      epHeatCapPow2: true,
    }),
  ]),
  cell: Object.freeze([
    Object.freeze({
      upgradeIdFromType: Object.freeze({ suffix: "1_cell_perpetual", staticLine: "Auto-replacement enabled" }),
    }),
  ]),
});

function countNeighborCategoryLevels(tile, category) {
  if (!tile?.containmentNeighborTiles) return 0;
  let capCount = 0;
  for (const neighbor of tile.containmentNeighborTiles) {
    if (neighbor.part && neighbor.part.category === category) {
      capCount += neighbor.part.part?.level || neighbor.part.level || 1;
    }
  }
  return capCount;
}

function pushPctLine(lines, pct, label) {
  lines.push(`<span class="pos">+${pct}%</span> ${label}`);
}

function pctFromMultiplier(mult) {
  return Math.round((mult - 1) * PCT_BASE);
}

export function collectTooltipBonusLinesFromRules(category, upg, obj, context, lines) {
  const rules = PART_TOOLTIP_BONUS_RULES[category];
  if (!rules) return;
  const tile = context?.tile;

  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    if (rule.upgradeId) {
      const level = upg(rule.upgradeId);
      if (level <= 0) continue;
      if (rule.neighborCategory) {
        const neighborCount = countNeighborCategoryLevels(tile, rule.neighborCategory);
        if (neighborCount <= 0) continue;
        const pct = level * neighborCount * (rule.pctPerNeighborLevel ?? 1);
        pushPctLine(lines, pct, rule.label.replace("{neighborCount}", String(neighborCount)));
      }
      continue;
    }
    if (rule.upgradeByPartLevel) {
      const lvl = obj.level || 1;
      const id = rule.upgradeByPartLevel[lvl] ?? rule.upgradeByPartLevel.default;
      const level = upg(id);
      if (level <= 0) continue;
      if (rule.epHeatCapPow2) {
        pushPctLine(lines, pctFromMultiplier(Math.pow(2, level)), "EP heat cap");
      }
      continue;
    }
    if (rule.upgradeIdFromType) {
      const game = context?.game ?? obj?.game;
      if (!game?.upgradeset || !obj.type) continue;
      const spec = rule.upgradeIdFromType;
      const upgrade = game.upgradeset.getUpgrade(`${obj.type}${spec.suffix}`);
      if (!upgrade || upgrade.level <= 0) continue;
      if (spec.staticLine) lines.push(spec.staticLine);
    }
  }
}
