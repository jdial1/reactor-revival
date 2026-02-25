import { getUpgradeBonusLines as getUpgradeBonusLinesCore } from "../../core/part/partUpgradeBonusBuilder.js";

export function getUpgradeBonusLines(obj, tile, game) {
  return getUpgradeBonusLinesCore(obj, { tile, game });
}
