import { toDecimal } from "../../simUtils.js";
import { numFormat as fmt } from "../../core/numbers.js";
import { getActiveBridge } from "../../bridge/active.js";

export function formatUpgradeDisplayCost(upgrade) {
  if (!upgrade) return "";
  const bridge = getActiveBridge(upgrade.game);
  if (!bridge) return "";
  const preview = bridge.previewUpgrade(upgrade.id);
  if (!preview || preview.reason === "max_level" || upgrade.level >= upgrade.max_level) return "MAX";
  const costDec = preview.costDecimal != null ? toDecimal(preview.costDecimal) : toDecimal(preview.cost);
  const isEp = preview.currency === "ep" || preview.currency === "exotic_particles";
  return isEp ? `${fmt(costDec)} EP` : `$${fmt(costDec)}`;
}
