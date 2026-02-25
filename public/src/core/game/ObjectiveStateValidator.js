import { logger } from "../../utils/logger.js";

export function validateObjectiveState(game) {
  if (!game.objectives_manager || game._saved_objective_index === undefined) {
    return;
  }

  const currentIndex = game.objectives_manager.current_objective_index;
  const savedIndex = game._saved_objective_index;

  if (currentIndex !== savedIndex) {
    logger.log('warn', 'game', `Objective state inconsistency detected: current=${currentIndex}, saved=${savedIndex}. Restoring...`);
    game.objectives_manager.current_objective_index = savedIndex;
    if (game.objectives_manager.set_objective && game.objectives_manager.objectives_data) {
      game.objectives_manager.set_objective(savedIndex, true);
    }
    setTimeout(() => {
      game.saveManager.autoSave();
    }, 100);
  }
}
