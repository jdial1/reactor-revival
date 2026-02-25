import { logger } from "../utils/logger.js";

const CELL_UPGRADE_TEMPLATES = [
  { type: "cell_power", title: "Potent ", description: "s: +100% power.", actionId: "cell_power" },
  { type: "cell_tick", title: "Enriched ", description: "s: 2x duration.", actionId: "cell_tick" },
  { type: "cell_perpetual", title: "Perpetual ", description: "s: auto-replace at 1.5x normal price.", levels: 1, actionId: "cell_perpetual" },
];

export function generateCellUpgrades(game) {
  const generatedUpgrades = [];
  const allParts = game.partset.getAllParts();
  logger.log('debug', 'game', 'All parts:', allParts.map((p) => ({ id: p.id, level: p.level, hasCost: !!p.part.cell_tick_upgrade_cost })));
  const baseCellParts = allParts.filter((p) => p.part.cell_tick_upgrade_cost && p.level === 1);
  logger.log('debug', 'game', 'Base cell parts for upgrades:', baseCellParts.map((p) => p.id));
  for (const template of CELL_UPGRADE_TEMPLATES) {
    for (const part of baseCellParts) {
      const upgradeDef = {
        id: `${part.id}_${template.type}`,
        type: `${template.type}_upgrades`,
        title: template.title + part.title,
        description: part.title + template.description,
        levels: template.levels,
        cost: part.part[`${template.type}_upgrade_cost`],
        multiplier: part.part[`${template.type}_upgrade_multi`],
        actionId: template.actionId,
        classList: [part.id, template.type],
        part: part,
        icon: part.getImagePath(),
      };
      logger.log('debug', 'game', `Generated upgrade: ${upgradeDef.id} with cost: ${upgradeDef.cost}`);
      generatedUpgrades.push(upgradeDef);
    }
  }
  logger.log('debug', 'game', 'Total generated upgrades:', generatedUpgrades.length);
  return generatedUpgrades;
}
