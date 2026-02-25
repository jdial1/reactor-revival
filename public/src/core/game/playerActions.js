import { FAILSAFE_MONEY_THRESHOLD } from "../constants.js";

export function runSellAction(game) {
  if (game.state.current_money !== Infinity && game.state.current_money.lt(FAILSAFE_MONEY_THRESHOLD) && game.reactor.current_power == 0) {
    const hasPartsToSell = game.tileset.active_tiles_list.some(
      (tile) => tile.part && !tile.part.isSpecialTile
    );
    if (!hasPartsToSell) {
      game.addMoney(FAILSAFE_MONEY_THRESHOLD);
      game.debugHistory.add('game', 'Failsafe: +$10 added');
    }
  } else {
    game.reactor.sellPower();
  }
  game.reactor.updateStats();
}

export function runManualReduceHeatAction(game) {
  game.debugHistory.add('game', 'Manual heat reduction');
  game.emit("vibrationRequest", { type: "heavy" });
  game.reactor.manualReduceHeat();
  game.reactor.updateStats();
}

export function runSellPart(game, tile) {
  if (tile && tile.part) {
    const sellValue = tile.calculateSellValue();
    game.debugHistory.add('game', 'sellPart', { row: tile.row, col: tile.col, partId: tile.part.id, value: sellValue });
    game.emit("vibrationRequest", { type: "heavy" });
    if (game.audio) {
      game.audio.play("sell", null, game.calculatePan(tile.col));
    }
    tile.sellPart();
  }
}

export function runEpartOnclick(game, purchased_upgrade) {
  if (
    !purchased_upgrade ||
    !purchased_upgrade.upgrade ||
    purchased_upgrade.level <= 0
  )
    return;
  game.upgradeset.getAllUpgrades().forEach((upg) => {
    if (
      upg.upgrade.type === "experimental_parts" &&
      upg.upgrade.id !== purchased_upgrade.upgrade.id
    ) {
      upg.updateDisplayCost();
    }
  });
  game.upgradeset.check_affordability(game);
}
