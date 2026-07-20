import { updateLeaderboardIcon } from "../shell/ui-nav.js";
import { getGridCanvasRenderer } from "./ui-grid.js";

export function getUiConfigDisplayValue(game, configKey) {
  if (configKey === "exotic_particles") return game?.exoticParticleManager?.exotic_particles;
  return game?.state?.[configKey];
}

export function applyUiStateToDom(ui) {
  const game = ui.game;
  const config = ui.var_objs_config;
  if (!config || !game?.state) return;
  for (const configKey of Object.keys(config)) {
    const val = getUiConfigDisplayValue(game, configKey);
    if (val === undefined) continue;
    const cfg = config[configKey];
    cfg?.onupdate?.(val);
  }
}

export function applyUiStateToDomForKeys(ui, keys) {
  const game = ui.game;
  const config = ui.var_objs_config;
  if (!config || !game) return;
  for (const configKey of keys) {
    const cfg = config[configKey];
    if (!cfg) continue;
    const val = getUiConfigDisplayValue(game, configKey);
    if (val === undefined) continue;
    cfg.onupdate?.(val);
  }
}

export function processUiUpdateQueue(ui) {
  applyUiStateToDom(ui);
}

export function startRenderLoop(ui, timestamp = 0) {
  if (ui._updateLoopStopped) return;
  if (typeof document === "undefined" || !document) return;
  if (!ui._lastUiTime) ui._lastUiTime = timestamp;
  ui._lastUiTime = timestamp;

  ui._firstFrameSyncDone = true;

  if (timestamp - ui.last_interface_update > ui.update_interface_interval) {
    ui.last_interface_update = timestamp;
    const gridRenderer = getGridCanvasRenderer();
    if (gridRenderer && ui.game) gridRenderer.render(ui.game);
    updateLeaderboardIcon(ui);
    ui.heatVisualsUI?.drawHeatFlowOverlay?.();
    ui.heatVisualsUI?.drawVoltagePlacementOverlay?.();
  }

  ui.update_interface_task = requestAnimationFrame((ts) => startRenderLoop(ui, ts));
}
