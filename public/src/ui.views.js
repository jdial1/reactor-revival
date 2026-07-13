import { html, render } from "lit-html";
import { subscribeKey } from "valtio/vanilla/utils";
import { preferences, EngineStatus } from "./store.js";

function heatRatioStripView(game) {
  const st = game?.state;
  if (!st) return html``;
  const ratio = typeof st.heat_ratio === "number" && isFinite(st.heat_ratio) ? st.heat_ratio : 0;
  const pct = Math.round(Math.min(150, Math.max(0, ratio * 100)));
  return html`<span class="ui-views-heat-strip" data-heat-pct=${String(pct)} aria-hidden="true">${pct}%</span>`;
}

function engineStatusChipView(game) {
  const st = game?.state;
  if (!st) return html``;
  const paused = !!st.pause;
  const stopped = st.engine_status === EngineStatus.STOPPED;
  const label = paused ? "Paused" : stopped ? "Idle" : "Run";
  const title = paused ? "Simulation paused" : stopped ? "Engine idle" : "Simulation running";
  return html`<span class="ui-views-engine-chip ${paused ? "paused" : ""} ${stopped ? "idle" : ""}" title=${title} aria-hidden="true">${label}</span>`;
}

export function mountHeatRatioStrip(game, host) {
  if (!game?.state || !host) return () => {};
  const run = () => {
    render(heatRatioStripView(game), host);
  };
  run();
  const unsubscribe = subscribeKey(game.state, "heat_ratio", run);
  return () => {
    try {
      unsubscribe();
    } catch (_) {}
    render(html``, host);
  };
}

export function mountEngineStatusChip(game, host) {
  if (!game?.state || !host) return () => {};
  const run = () => {
    render(engineStatusChipView(game), host);
  };
  run();
  const unsubs = [
    subscribeKey(game.state, "pause", run),
    subscribeKey(game.state, "engine_status", run),
  ];
  return () => {
    try {
      unsubs.forEach((fn) => fn());
    } catch (_) {}
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
  const unsubscribe = subscribeKey(preferences, "mute", run);
  return () => {
    try {
      unsubscribe();
    } catch (_) {}
    render(html``, host);
  };
}

export function mountUiViewHosts(game) {
  if (typeof document === "undefined" || !game) return () => {};
  const heatHost = document.getElementById("ui_views_heat_strip_host");
  const engineHost = document.getElementById("ui_views_engine_chip_host");
  const muteHost = document.getElementById("ui_views_mute_host");
  if (!heatHost || !engineHost || !muteHost) return () => {};
  const unmounts = [];
  const heatUnmount = mountHeatRatioStrip(game, heatHost);
  if (typeof heatUnmount === "function") unmounts.push(heatUnmount);
  const engineUnmount = mountEngineStatusChip(game, engineHost);
  if (typeof engineUnmount === "function") unmounts.push(engineUnmount);
  const muteUnmount = mountMuteIndicator(muteHost);
  if (typeof muteUnmount === "function") unmounts.push(muteUnmount);
  return () => {
    unmounts.forEach((fn) => { try { fn(); } catch (_) {} });
  };
}
