import { updateLeaderboardIcon } from "./ui-nav.js";
import { getGridCanvasRenderer } from "./grid-canvas-service.js";

export function getUiConfigDisplayValue(game, configKey) {
  if (configKey === "exotic_particles") return game?.exoticParticleManager?.exotic_particles;
  return game?.state?.[configKey];
}

export function snapUiDisplayValuesFromState(ui) {
  if (!ui.displayValues) return;
  const d = ui.displayValues;
  ["money", "heat", "power", "ep"].forEach((k) => {
    const o = d[k];
    if (o && typeof o.current === "number" && typeof o.target === "number") o.current = o.target;
  });
}

export function syncUiDisplayValueTargetsFromState(ui) {
  const game = ui.game;
  if (!game?.state || !ui.displayValues) return;
  const s = game.state;
  const d = ui.displayValues;
  const toNum = (v) => (v != null && typeof v.toNumber === "function" ? v.toNumber() : Number(v ?? 0));
  if (d.money) d.money.target = toNum(s.current_money);
  if (d.heat) d.heat.target = toNum(s.current_heat);
  if (d.power) d.power.target = toNum(s.current_power);
  if (d.ep) d.ep.target = toNum(game.exoticParticleManager?.exotic_particles ?? s.current_exotic_particles ?? 0);
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
  syncUiDisplayValueTargetsFromState(ui);
  snapUiDisplayValuesFromState(ui);
  applyUiStateToDom(ui);
}

export function updateUiRollingNumbers(ui, _dt) {
  snapUiDisplayValuesFromState(ui);
}

export function startRenderLoop(ui, timestamp = 0) {
  if (ui._updateLoopStopped) return;
  if (typeof document === "undefined" || !document) return;
  if (typeof document.getElementById !== "function") return;
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
