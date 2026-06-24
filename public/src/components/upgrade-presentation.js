import { renderToNode, UpgradeCard } from "./button-factory.js";
import { enqueueGameEffect } from "../state/game-effects.js";

export function createUpgradeElement(upgrade) {
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
}

export function attachUpgradePresentation(UpgradeClass) {
  UpgradeClass.prototype.createElement = function createElement() {
    const el = createUpgradeElement(this);
    this.updateDisplayCost();
    return el;
  };
}
