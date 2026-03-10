import { html, render } from "lit-html";
import { runCheckAffordability } from "../../../core/upgradeset/affordabilityChecker.js";
import { UpgradeCard } from "../../buttonFactory.js";
import { ReactiveLitComponent } from "../../ReactiveLitComponent.js";

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
  if (!wrapper?.isConnected) return;

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
  const state = upgradeset.game?.state;
  const useReactiveLevelAndCost = !!state?.upgrade_display;

  byContainer.forEach((upgrades, containerId) => {
    const container = document.getElementById(containerId);
    if (!container?.isConnected) return;

    const cards = upgrades.map((upgrade) => {
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
      return UpgradeCard(upgrade, doctrineSource, onBuyClick, { onBuyMaxClick, onResetClick, useReactiveLevelAndCost });
    });
    try {
      render(html`${cards}`, container);
    } catch (err) {
      const msg = String(err?.message ?? "");
      if (msg.includes("nextSibling") || msg.includes("parentNode")) return;
      throw err;
    }
  });

  const game = upgradeset.game;
  filtered.forEach((upgrade) => {
    const container = document.getElementById(getUpgradeContainerId(upgrade));
    if (!container?.isConnected) return;
    upgrade.$el = container?.querySelector(`[data-id="${upgrade.id}"]`);
    if (upgrade.$el) {
      upgrade.updateDisplayCost();
      const display = state?.upgrade_display;
      if (display) {
        if (!display[upgrade.id]) display[upgrade.id] = { level: upgrade.level, display_cost: upgrade.display_cost };
        const levelContainer = upgrade.$el.querySelector(".upgrade-level-info");
        const costContainer = upgrade.$el.querySelector(".cost-display");
        if (levelContainer) {
          levelContainer.replaceChildren();
          const levelRenderFn = () => {
            const d = display[upgrade.id] ?? upgrade;
            const lvl = d.level ?? upgrade.level;
            const header = lvl >= upgrade.max_level ? "MAX" : `Level ${lvl}/${upgrade.max_level}`;
            return html`<span class="level-text">${header}</span>`;
          };
          ReactiveLitComponent.mountMulti(
            [{ state: display, keys: [upgrade.id] }],
            levelRenderFn,
            levelContainer
          );
        }
        if (costContainer) {
          costContainer.replaceChildren();
          const costRenderFn = () => {
            const d = display[upgrade.id] ?? upgrade;
            return html`${d.display_cost ?? upgrade.display_cost}`;
          };
          ReactiveLitComponent.mountMulti(
            [{ state: display, keys: [upgrade.id] }],
            costRenderFn,
            costContainer
          );
        }
      }
    }
  });

  if (game) runCheckAffordability(upgradeset, game);
}
