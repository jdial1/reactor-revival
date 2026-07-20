import { html, render } from "lit-html";
import { subscribeKey } from "valtio/vanilla/utils";
import { preferences, EngineStatus } from "../../store.js";
import { teardownAll } from "../../core/teardown.js";
import { getUiElement } from "./page-dom.js";
import { hudViewFromSnapshot, resolveSessionSnapshot } from "./hud-from-snapshot.js";

function heatRatioStripView(game) {
  const view = hudViewFromSnapshot(resolveSessionSnapshot(game), game);
  const ratio = typeof view.heat_ratio === "number" && isFinite(view.heat_ratio) ? view.heat_ratio : 0;
  const pct = Math.round(Math.min(150, Math.max(0, ratio * 100)));
  return html`<span class="ui-views-heat-strip" data-heat-pct=${String(pct)} aria-hidden="true">${pct}%</span>`;
}

function engineStatusChipView(game) {
  const view = hudViewFromSnapshot(resolveSessionSnapshot(game), game);
  const paused = !!view.pause;
  const stopped = view.engine_status === EngineStatus.STOPPED;
  const label = paused ? "Paused" : stopped ? "Idle" : "Run";
  const title = paused ? "Simulation paused" : stopped ? "Engine idle" : "Simulation running";
  return html`<span class="ui-views-engine-chip ${paused ? "paused" : ""} ${stopped ? "idle" : ""}" title=${title} aria-hidden="true">${label}</span>`;
}

export function mountHeatRatioStrip(game, host) {
  if (!game || !host) return () => {};
  const run = () => {
    render(heatRatioStripView(game), host);
  };
  run();
  const unsubs = [];
  if (game.ui?.uiState) {
    unsubs.push(subscribeKey(game.ui.uiState, "snapshot_rev", run));
  }
  return () => {
    teardownAll(unsubs);
    render(html``, host);
  };
}

export function mountEngineStatusChip(game, host) {
  if (!game || !host) return () => {};
  const run = () => {
    render(engineStatusChipView(game), host);
  };
  run();
  const unsubs = [];
  if (game.ui?.uiState) {
    unsubs.push(subscribeKey(game.ui.uiState, "snapshot_rev", run));
  }
  return () => {
    teardownAll(unsubs);
    render(html``, host);
  };
}

function muteIndicatorView() {
  if (!preferences.mute) return html``;
  return html`<span class="ui-views-mute" title="Audio muted" aria-label="Audio muted">🔇</span>`;
}

export function mountMuteIndicator(host) {
  if (!host) return () => {};
  const run = () => {
    render(muteIndicatorView(), host);
  };
  run();
  const unsubs = [];
  unsubs.push(subscribeKey(preferences, "mute", run));
  return () => {
    teardownAll(unsubs);
    render(html``, host);
  };
}

export function mountUiViewHosts(game) {
  if (typeof document === "undefined" || !game) return () => {};
  const heatHost = getUiElement(null, "ui_views_heat_strip_host");
  const engineHost = getUiElement(null, "ui_views_engine_chip_host");
  const muteHost = getUiElement(null, "ui_views_mute_host");
  if (!heatHost || !engineHost || !muteHost) return () => {};
  const unmounts = [];
  const heatUnmount = mountHeatRatioStrip(game, heatHost);
  if (typeof heatUnmount === "function") unmounts.push(heatUnmount);
  const engineUnmount = mountEngineStatusChip(game, engineHost);
  if (typeof engineUnmount === "function") unmounts.push(engineUnmount);
  const muteUnmount = mountMuteIndicator(muteHost);
  if (typeof muteUnmount === "function") unmounts.push(muteUnmount);
  return () => {
    teardownAll(unmounts);
  };
}
