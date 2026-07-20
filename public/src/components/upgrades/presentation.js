import { renderToNode, PartButton, UpgradeCard } from "./button-factory.js";
import { actions } from "../../store.js";
import { Upgrade } from "../../domain/upgrade.js";

export { formatUpgradeDisplayCost } from "./upgrade-display.js";

export function purchaseUpgradeWithFeedback(upgradeset, upgradeId, { onSuccess } = {}) {
  if (!upgradeset) return false;
  if (typeof upgradeset.isUpgradeAvailable === "function" && !upgradeset.isUpgradeAvailable(upgradeId)) {
    return false;
  }
  const game = upgradeset.game;
  if (!upgradeset.purchaseUpgrade(upgradeId)) {
    if (game) {
      actions.enqueueEffect(game, { kind: "sfx", id: "error", context: "global" });
      actions.enqueueEffect(game, {
        kind: "floating_text",
        body: "[Not enough funds!]",
        context: "global",
      });
    }
    return false;
  }
  if (game) {
    actions.enqueueEffect(game, { kind: "sfx", id: "upgrade", context: "global" });
    upgradeset.check_affordability?.(game);
  }
  onSuccess?.();
  return true;
}

const partElements = new WeakMap();

export const bindPartElement = (part, el) => {
  if (el && el.nodeType === 1) partElements.set(part, el);
  else partElements.delete(part);
};

export const getPartElement = (part) => partElements.get(part) ?? null;

export const createPartElement = (part, game = null) => {
  const g = game ?? null;
  const onClick = () => {
    const el = getPartElement(part);
    const ui = g?.ui;
    if (part.affordable) {
      if (ui?.help_mode_active && ui?.tooltipManager) {
        ui.tooltipManager.show(part, null, true, el);
      }
      const uiState = ui?.uiState;
      if (uiState?.interaction) {
        uiState.interaction.selectedPartId = part.id;
      }
      g?.emit?.("partClicked", { part });
    } else if (ui?.tooltipManager) {
      ui.tooltipManager.show(part, null, true, el);
    }
  };
  const el = renderToNode(PartButton(part, onClick, { game: g }));
  bindPartElement(part, el);
  return el;
};

export const createUpgradeElement = (upgrade) => {
  const doctrineSource = (id) => upgrade.game?.upgradeset?.getDoctrineForUpgrade(id);
  const onBuyClick = (e) => {
    e.stopPropagation();
    purchaseUpgradeWithFeedback(upgrade.game?.upgradeset, upgrade.id);
  };
  return renderToNode(UpgradeCard(upgrade, doctrineSource, onBuyClick));
};

export const attachUpgradePresentation = (UpgradeClass) => {
  UpgradeClass.prototype.createElement = function createElement() {
    return createUpgradeElement(this);
  };
};

attachUpgradePresentation(Upgrade);
