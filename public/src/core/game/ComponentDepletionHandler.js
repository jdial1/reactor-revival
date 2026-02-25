import { logger } from "../../utils/logger.js";
import { updateDecimal } from "../store.js";

export function handleComponentDepletion(game, tile) {
  if (!tile.part) return;
  game.debugHistory.add('game', 'Component depletion', { row: tile.row, col: tile.col, partId: tile.part.id, perpetual: tile.part.perpetual });

  const part = tile.part;
  const hasProtiumLoader = game.upgradeset.getUpgrade("experimental_protium_loader")?.level > 0;
  const isProtium = part.type === "protium";
  const autoReplace = (part.perpetual || (isProtium && hasProtiumLoader)) && !!game.reactor?.auto_buy_enabled;
  if (autoReplace) {
    const cost = part.getAutoReplacementCost();
    const money = game.state.current_money;
    game.logger?.debug(`[AUTO-BUY] Attempting to replace '${part.id}'. Cost: ${cost}, Current Money: ${money}`);
    const canAfford = game.isSandbox || (money != null && typeof money.gte === "function" && money.gte(cost));
    if (canAfford) {
      if (!game.isSandbox) {
        updateDecimal(game.state, "current_money", (d) => d.sub(cost));
      }
      game.logger?.debug(`[AUTO-BUY] Success. New Money: ${game.state.current_money}`);
      part.recalculate_stats();
      tile.ticks = part.ticks;
      game.reactor.updateStats();
      return;
    }
    logger.log('debug', 'game', '[AUTO-BUY] Failed. Insufficient funds.');
  }

  game.emit("tileCleared", { tile });
  tile.clearPart();
}
