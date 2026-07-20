import { hydrateGridFromHost } from "@app/bridge/bridge-grid-sync.js";
import { hydrateEconomyFromHost } from "@app/bridge/bridge-economy-sync.js";
import { hydrateUpgradeLevelsFromHost } from "@app/bridge/bridge-upgrades.js";
import { projectHeatMapToTileset } from "@app/bridge/core-state-projection.js";
import { assertNotTickInFlight } from "@app/bridge/tick-commit.js";
import { toNumber } from "@app/simUtils.js";

function resolveBridge(gameOrBridge) {
  if (!gameOrBridge) return null;
  return gameOrBridge.coreBridge ?? gameOrBridge;
}

export function syncGridFromGame(gameOrBridge) {
  const bridge = resolveBridge(gameOrBridge);
  if (!bridge) return;
  hydrateGridFromHost(bridge);
}

export function syncReactorScalarsFromGame(gameOrBridge) {
  const bridge = resolveBridge(gameOrBridge);
  if (!bridge?.session || !bridge.game?.reactor) return;
  const reactor = bridge.game.reactor;
  bridge.session.grid.currentHeat = toNumber(reactor.current_heat);
  bridge.session.grid.currentPower = toNumber(reactor.current_power);
}

export function loadEconomyFromHost(gameOrBridge) {
  const bridge = resolveBridge(gameOrBridge);
  if (!bridge) return;
  hydrateEconomyFromHost(bridge);
}

export function pushHostUpgradeLevelsForLoad(gameOrBridge) {
  const bridge = resolveBridge(gameOrBridge);
  if (!bridge) return;
  hydrateUpgradeLevelsFromHost(bridge);
}

export function hydrateSessionFromHost(gameOrBridge) {
  const bridge = resolveBridge(gameOrBridge);
  if (!bridge?.session) return;
  pushHostUpgradeLevelsForLoad(bridge);
  loadEconomyFromHost(bridge);
  syncGridFromGame(bridge);
}

export function setTileHeat(gameOrBridge, row, col, value) {
  const bridge = resolveBridge(gameOrBridge);
  assertNotTickInFlight(bridge, "setTileHeat");
  if (!bridge?.session) return false;
  bridge.session.grid.setTileHeat(row, col, toNumber(value));
  projectHeatMapToTileset(bridge);
  return true;
}

export function setTileTicks(gameOrBridge, row, col, value) {
  const bridge = resolveBridge(gameOrBridge);
  if (!bridge?.session) return false;
  const inst = bridge.session.grid.getComponentAt(row, col);
  if (!inst) return false;
  inst.ticks = toNumber(value);
  const tile = bridge.game?.tileset?.getTile(row, col);
  if (tile) tile._setProjectedTicks(inst.ticks);
  return true;
}

export function setReactorHeat(gameOrBridge, value) {
  const bridge = resolveBridge(gameOrBridge);
  if (!bridge?.session) return false;
  bridge.session.grid.currentHeat = toNumber(value);
  bridge.projectLiveState();
  return true;
}

export function setReactorPower(gameOrBridge, value) {
  const bridge = resolveBridge(gameOrBridge);
  if (!bridge?.session) return false;
  bridge.session.grid.currentPower = toNumber(value);
  bridge.projectLiveState();
  return true;
}

export function resetReactorHeat(gameOrBridge) {
  const bridge = resolveBridge(gameOrBridge);
  if (!bridge?.session) return;
  bridge.session.grid.resetHeat();
  bridge.projectLiveState();
}

export function attachHeatMutatorsForTests(gameOrBridge) {
  const bridge = resolveBridge(gameOrBridge);
  if (!bridge || bridge._heatMutatorsAttached) return bridge;
  bridge._heatMutatorsAttached = true;
  bridge.setTileHeat = (row, col, value) => setTileHeat(bridge, row, col, value);
  bridge.setTileTicks = (row, col, value) => setTileTicks(bridge, row, col, value);
  bridge.setReactorHeat = (value) => setReactorHeat(bridge, value);
  bridge.setReactorPower = (value) => setReactorPower(bridge, value);
  bridge.resetReactorHeat = () => resetReactorHeat(bridge);
  return bridge;
}
