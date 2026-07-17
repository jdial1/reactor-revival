import { renderToNode, PartButton, UpgradeCard } from "./button-factory.js";
import { enqueueGameEffect } from "../state/game-effects.js";

const partElements = new WeakMap();

export const bindPartElement = (part, el) => {
  if (el && el.nodeType === 1) partElements.set(part, el);
  else partElements.delete(part);
};

export const getPartElement = (part) => partElements.get(part) ?? null;

export const createPartElement = (part) => {
  const onClick = () => {
    const el = getPartElement(part);
    if (part.affordable) {
      if (part.game?.ui?.help_mode_active && part.game?.ui?.tooltipManager) {
        part.game.ui.tooltipManager.show(part, null, true, el);
      }
      const uiState = part.game?.ui?.uiState;
      if (uiState?.interaction) {
        uiState.interaction.selectedPartId = part.id;
      }
      part.game.emit?.("partClicked", { part });
      el?.classList.add("part_active");
    } else if (part.game?.ui?.tooltipManager) {
      part.game.ui.tooltipManager.show(part, null, true, el);
    }
  };
  const el = renderToNode(PartButton(part, onClick));
  bindPartElement(part, el);
  return el;
};

export const attachPartPresentation = (PartClass) => {
  PartClass.prototype.createElement = function createElement() {
    return createPartElement(this);
  };
};

export const createUpgradeElement = (upgrade) => {
  const doctrineSource = (id) => upgrade.game?.upgradeset?.getDoctrineForUpgrade(id);
  const onBuyClick = (e) => {
    e.stopPropagation();
    if (upgrade.game.upgradeset && !upgrade.game.upgradeset.isUpgradeAvailable(upgrade.id)) return;
    if (!upgrade.game.upgradeset.purchaseUpgrade(upgrade.id)) {
      enqueueGameEffect(upgrade.game, { kind: "sfx", id: "error", context: "global" });
      enqueueGameEffect(upgrade.game, {
        kind: "floating_text",
        body: "[Not enough funds!]",
        context: "global",
      });
      return;
    }
    enqueueGameEffect(upgrade.game, { kind: "sfx", id: "upgrade", context: "global" });
    upgrade.game.upgradeset.check_affordability(upgrade.game);
  };
  return renderToNode(UpgradeCard(upgrade, doctrineSource, onBuyClick));
};

export const attachUpgradePresentation = (UpgradeClass) => {
  UpgradeClass.prototype.createElement = function createElement() {
    const el = createUpgradeElement(this);
    this.updateDisplayCost();
    return el;
  };
};
