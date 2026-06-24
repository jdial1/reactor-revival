import { subscribeKey } from "valtio/vanilla/utils";
import { EngineStatus } from "../schema/stateSchemas.js";

export function syncGameTogglesFromState(game) {
  if (!game?.state) return;
  const s = game.state;
  const p = !!s.pause;
  if (game.paused !== p) {
    game.paused = p;
    const eng = game.engine;
    if (eng) {
      if (p) eng.stop();
      else eng.start();
    }
  }
}

export function syncEngineStatusToState(game) {
  if (!game?.engine || !game?.state) return;
  const status = game.paused ? EngineStatus.PAUSED : (game.engine.running ? EngineStatus.RUNNING : EngineStatus.STOPPED);
  game.state.engine_status = status;
}

export function installGameStateEngineSync(game) {
  if (!game?.state) return () => {};
  const sync = () => syncGameTogglesFromState(game);
  const keys = ["pause", "auto_sell", "auto_buy", "heat_control"];
  const unsubs = keys.map((k) => subscribeKey(game.state, k, sync));
  sync();
  return () => unsubs.forEach((fn) => { try { fn(); } catch (_) {} });
}

export function teardownGameStateEngineSync(game) {
  if (typeof game?._gameStateSyncTeardown === "function") {
    game._gameStateSyncTeardown();
    game._gameStateSyncTeardown = null;
  }
}

export function ensureGameStateEngineSync(game) {
  teardownGameStateEngineSync(game);
  game._gameStateSyncTeardown = installGameStateEngineSync(game);
  syncEngineStatusToState(game);
}
