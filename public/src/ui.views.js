import { html, render } from "lit-html";
import { subscribe } from "valtio/vanilla";
import { preferences } from "./store.js";

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
  const stopped = st.engine_status === "stopped";
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
  const unsub = subscribe(game.state, run);
  return () => {
    try {
      unsub();
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
  const unsub = subscribe(game.state, run);
  return () => {
    try {
      unsub();
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
  const unsub = subscribe(preferences, run);
  return () => {
    try {
      unsub();
    } catch (_) {}
    render(html``, host);
  };
}
