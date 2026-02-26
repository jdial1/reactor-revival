import { html, render } from "lit-html";
import { runCheckAffordability } from "../../../core/upgradeset/affordabilityChecker.js";
import { UpgradeCard } from "../../buttonFactory.js";
import { repeat } from "../../../utils/litHelpers.js";

const EXPAND_UPGRADE_IDS = ["expand_reactor_rows", "expand_reactor_cols"];

function getUpgradeContainerId(upgrade) {
  if (upgrade.base_ecost && upgrade.base_ecost.gt && upgrade.base_ecost.gt(0)) {
    return upgrade.upgrade.type;
  }
  const map = {
    cell_power: "cell_power_upgrades",
    cell_tick: "cell_tick_upgrades",
    cell_perpetual: "cell_perpetual_upgrades",
    exchangers: "exchanger_upgrades",
    vents: "vent_upgrades",
    other: "other_upgrades",
  };
  const key = upgrade.upgrade?.type;
  return key?.endsWith("_upgrades") ? key : (map[key] || key);
}

function shouldSkipCellUpgrade(upgrade, upgradeset) {
  try {
    const upgType = upgrade?.upgrade?.type || "";
    const basePart = upgrade?.upgrade?.part;
    const isCellUpgrade = typeof upgType === "string" && upgType.indexOf("cell_") === 0;
    if (isCellUpgrade && basePart && basePart.category === "cell") {
      const show =
        upgradeset.game?.unlockManager && typeof upgradeset.game.unlockManager.isPartUnlocked === "function"
          ? upgradeset.game.unlockManager.isPartUnlocked(basePart)
          : true;
      return !show;
    }
  } catch (_) {}
  return false;
}

export function runPopulateUpgradeSection(upgradeset, wrapperId, filterFn) {
  if (typeof document === "undefined") return;
  const wrapper = document.getElementById(wrapperId);
  if (!wrapper) return;

  const filtered = upgradeset.upgradesArray
    .filter(filterFn)
    .filter((u) => !EXPAND_UPGRADE_IDS.includes(u.upgrade?.id))
    .filter((u) => !(upgradeset.isUpgradeAvailable(u.id) && shouldSkipCellUpgrade(u, upgradeset)));

  const byContainer = new Map();
  filtered.forEach((upgrade) => {
    const cid = getUpgradeContainerId(upgrade);
    if (!byContainer.has(cid)) byContainer.set(cid, []);
    byContainer.get(cid).push(upgrade);
  });

  const doctrineSource = (id) => upgradeset.game?.upgradeset?.getDoctrineForUpgrade(id);

  byContainer.forEach((upgrades, containerId) => {
    const container = document.getElementById(containerId);
    if (!container) return;

    const template = html`${repeat(
      upgrades,
      (u) => u.id,
      (upgrade) => {
        const onBuyClick = (e) => {
          e.stopPropagation();
          if (!upgradeset.isUpgradeAvailable(upgrade.id)) return;
          if (!upgradeset.purchaseUpgrade(upgrade.id)) {
            if (upgradeset.game?.audio) upgradeset.game.audio.play("error");
            return;
          }
          if (upgradeset.game?.audio) upgradeset.game.audio.play("upgrade");
        };
        const onBuyMaxClick = (e) => {
          e.stopPropagation();
          if (!upgradeset.game?.isSandbox) return;
          if (upgradeset.isUpgradeAvailable(upgrade.id)) {
            const count = upgradeset.purchaseUpgradeToMax(upgrade.id);
            if (count > 0 && upgradeset.game?.audio) upgradeset.game.audio.play("upgrade");
          }
        };
        const onResetClick = (e) => {
          e.stopPropagation();
          if (upgradeset.game?.isSandbox) upgradeset.resetUpgradeLevel(upgrade.id);
        };
        return UpgradeCard(upgrade, doctrineSource, onBuyClick, { onBuyMaxClick, onResetClick });
      }
    )}`;
    render(template, container);
  });

  filtered.forEach((upgrade) => {
    const container = document.getElementById(getUpgradeContainerId(upgrade));
    if (!container) return;
    upgrade.$el = container.querySelector(`[data-id="${upgrade.id}"]`);
    if (upgrade.$el) {
      const descEl = upgrade.$el.querySelector(".upgrade-description");
      if (descEl) {
        const desc = upgrade.description || "";
        descEl.innerHTML = upgrade.game?.ui?.stateManager ? upgrade.game.ui.stateManager.addPartIconsToTitle(desc) : desc;
      }
      upgrade.updateDisplayCost();
    }
  });

  if (upgradeset.game) runCheckAffordability(upgradeset, upgradeset.game);
}
