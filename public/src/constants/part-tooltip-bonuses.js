const PCT_BASE = 100;

export const PART_TOOLTIP_BONUS_RULES = Object.freeze({
  vent: Object.freeze([
    Object.freeze({
      upgradeId: "improved_heat_vents",
      lines: Object.freeze([
        Object.freeze({ pctPerLevel: PCT_BASE, label: "venting" }),
        Object.freeze({ pctPerLevel: PCT_BASE, label: "max heat" }),
      ]),
    }),
    Object.freeze({
      upgradeId: "active_venting",
      neighborCategory: "capacitor",
      pctPerNeighborLevel: 1,
      label: "venting from {neighborCount} capacitor neighbors",
    }),
  ]),
  heat_exchanger: Object.freeze([
    Object.freeze({
      upgradeId: "improved_heat_exchangers",
      combinedLine: Object.freeze({ pctPerLevel: PCT_BASE, labels: Object.freeze(["transfer", "max heat"]) }),
    }),
  ]),
  heat_inlet: Object.freeze([
    Object.freeze({
      upgradeId: "improved_heat_exchangers",
      combinedLine: Object.freeze({ pctPerLevel: PCT_BASE, labels: Object.freeze(["transfer", "max heat"]) }),
    }),
  ]),
  heat_outlet: Object.freeze([
    Object.freeze({
      upgradeId: "improved_heat_exchangers",
      combinedLine: Object.freeze({ pctPerLevel: PCT_BASE, labels: Object.freeze(["transfer", "max heat"]) }),
    }),
  ]),
  capacitor: Object.freeze([
    Object.freeze({
      upgradeId: "improved_wiring",
      combinedLine: Object.freeze({ pctPerLevel: PCT_BASE, labels: Object.freeze(["power capacity", "max heat"]) }),
    }),
  ]),
  coolant_cell: Object.freeze([
    Object.freeze({
      upgradeId: "improved_coolant_cells",
      lines: Object.freeze([Object.freeze({ pctPerLevel: PCT_BASE, label: "max heat" })]),
    }),
  ]),
  reflector: Object.freeze([
    Object.freeze({
      upgradeId: "improved_reflector_density",
      lines: Object.freeze([Object.freeze({ pctPerLevel: PCT_BASE, label: "duration" })]),
    }),
    Object.freeze({
      upgradeId: "improved_neutron_reflection",
      lines: Object.freeze([Object.freeze({ pctPerLevel: 1, label: "power reflection" })]),
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
      upgradeIdFromType: Object.freeze({ suffix: "1_cell_power", pow2Pct: true, label: "power" }),
    }),
    Object.freeze({
      upgradeIdFromType: Object.freeze({ suffix: "1_cell_tick", pow2Pct: true, label: "duration" }),
    }),
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

function pushCombinedPctLine(lines, pct, labels) {
  const parts = labels.map((label) => `<span class="pos">+${pct}%</span> ${label}`);
  lines.push(parts.join(", "));
}

function pctFromMultiplier(mult) {
  return Math.round((mult - 1) * PCT_BASE);
}

export function collectTooltipBonusLinesFromRules(category, upg, obj, context, lines) {
  const rules = PART_TOOLTIP_BONUS_RULES[category];
  if (!rules) return;
  const tile = context?.tile;
  const game = context?.game ?? obj?.game;

  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    if (rule.upgradeId) {
      const level = upg(rule.upgradeId);
      if (level <= 0) continue;
      if (rule.lines) {
        for (let j = 0; j < rule.lines.length; j++) {
          const line = rule.lines[j];
          pushPctLine(lines, level * line.pctPerLevel, line.label);
        }
      }
      if (rule.combinedLine) {
        pushCombinedPctLine(lines, level * rule.combinedLine.pctPerLevel, rule.combinedLine.labels);
      }
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
      if (!game?.upgradeset || !obj.type) continue;
      const spec = rule.upgradeIdFromType;
      const upgrade = game.upgradeset.getUpgrade(`${obj.type}${spec.suffix}`);
      if (!upgrade || upgrade.level <= 0) continue;
      if (spec.staticLine) {
        lines.push(spec.staticLine);
      } else if (spec.pow2Pct) {
        pushPctLine(lines, pctFromMultiplier(Math.pow(2, upgrade.level)), spec.label);
      }
    }
  }
}
