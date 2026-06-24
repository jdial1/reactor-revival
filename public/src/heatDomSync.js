import { getPageReactor, getPageReactorBackground } from "./components/page-dom.js";

export function isHeatNetBalanced(netHeat, heatGeneration) {
  const net = Number(netHeat);
  const gen = Number(heatGeneration);
  return Number.isFinite(net) && net <= 0 && Number.isFinite(gen) && gen > 0;
}

export function syncReactorHeatVisualDom(ui, heatRatio, netHeat, heatGeneration) {
  if (typeof document === "undefined") return;
  const heatBalanced = isHeatNetBalanced(netHeat, heatGeneration);
  const background = getPageReactorBackground(ui);
  if (background) {
    const ratio = Number(heatRatio);
    const hr = Number.isFinite(ratio) ? ratio : 0;
    const cd = heatBalanced ? Math.min(0.5, Math.max(0, hr)) : Math.min(1.5, Math.max(0, hr));
    if (ui?.uiState) {
      ui.uiState.core_danger = cd;
    } else {
      background.style.setProperty("--heat-ratio", String(cd));
      background.style.setProperty("--core-danger", String(cd));
    }
    let alpha = 0;
    if (hr <= 0.5) alpha = 0;
    else if (hr <= 1.0) alpha = Math.min((hr - 0.5) * 2 * 0.2, 0.2);
    else if (hr <= 1.5) alpha = 0.2 + Math.min((hr - 1.0) * 2 * 0.3, 0.3);
    else alpha = 0.5;
    background.style.setProperty("--heat-bg-alpha", String(alpha));
    if (hr <= 0.5) background.style.backgroundColor = "transparent";
    else background.style.removeProperty("background-color");
    background.classList.remove("heat-warning", "heat-critical");
    if (!heatBalanced) {
      if (hr >= 1.3) background.classList.add("heat-warning", "heat-critical");
      else if (hr >= 0.8) background.classList.add("heat-warning");
    }
  }
  const reactorEl = getPageReactor(ui);
  if (reactorEl) {
    const r = Number(heatRatio);
    const hr = Math.round(Math.min(1.5, Math.max(0, Number.isFinite(r) ? r : 0)) * 1000) / 1000;
    reactorEl.setAttribute("data-heat-ratio", String(hr));
  }
}
