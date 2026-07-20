import { EngineStatus } from "../../schema/stateSchemas.js";

export function syncGameTogglesFromState(game) {
  syncEngineStatusToState(game);
}

function syncEngineStatusToState(game) {
  if (!game?.engine || !game?.state) return;
  const status = game.paused ? EngineStatus.PAUSED : (game.engine.running ? EngineStatus.RUNNING : EngineStatus.STOPPED);
  game.state.engine_status = status;
}

export function teardownGameStateEngineSync(game) {
  if (typeof game?._gameStateSyncTeardown === "function") {
    game._gameStateSyncTeardown();
    game._gameStateSyncTeardown = null;
  }
}

export function ensureGameStateEngineSync(game) {
  teardownGameStateEngineSync(game);
  syncGameTogglesFromState(game);
  game._gameStateSyncTeardown = () => {};
}
