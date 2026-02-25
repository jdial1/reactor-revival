import { MELTDOWN_HEAT_MULTIPLIER } from "../constants.js";
import { logger } from "../../utils/logger.js";

export function shouldMeltdown(reactor) {
  if (reactor.has_melted_down) return false;
  if (reactor.game.grace_period_ticks > 0) {
    reactor.game.grace_period_ticks--;
    return false;
  }
  return reactor.current_heat.gt(reactor.max_heat.mul(MELTDOWN_HEAT_MULTIPLIER));
}

export function executeMeltdown(reactor) {
  const game = reactor.game;
  logger.log('warn', 'engine', '[MELTDOWN] Condition met! Initiating meltdown sequence.');
  game.debugHistory.add('reactor', 'Meltdown triggered', { heat: reactor.current_heat, max_heat: reactor.max_heat });
  reactor.has_melted_down = true;

  if (game.emit) game.emit("meltdown", { hasMeltedDown: true });
  game.emit?.("vibrationRequest", { type: "meltdown" });
  if (game.tooltip_manager) game.tooltip_manager.hide();

  if (game.state) game.state.melting_down = true;

  if (game.engine) game.engine.stop();

  if (!game.isSandbox) {
    game.emit?.("meltdownStarted", {});
  }
  if (!game.isSandbox && !game.ui?.meltdownUI) {
    game.tileset.active_tiles_list.forEach((tile) => {
      if (tile.part) tile.clearPart();
    });
  }

  game.partset.check_affordability(game);
  game.upgradeset.check_affordability(game);
}

export function clearMeltdown(reactor) {
  const game = reactor.game;
  reactor.has_melted_down = false;
  if (game.emit) game.emit("meltdownResolved", { hasMeltedDown: false });
  if (game.state) game.state.melting_down = false;
  game.partset.check_affordability(game);
  game.upgradeset.check_affordability(game);
  clearHeatVisualStates(reactor);
}

export function clearHeatVisualStates(reactor) {
  const game = reactor.game;
  if (game.tileset && game.tileset.active_tiles_list) {
    game.tileset.active_tiles_list.forEach((tile) => { tile.exploding = false; });
  }
  game.emit?.("heatWarningCleared");
  if (game.engine && game.engine.heatManager) {
    game.engine.heatManager.segments.clear();
    game.engine.heatManager.tileSegmentMap.clear();
    game.engine.heatManager.markSegmentsAsDirty();
  }
}
