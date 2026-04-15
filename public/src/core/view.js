import { AppState } from "../store.js";
import { fmt } from "../utils.js";

const el = (id) => (typeof document !== "undefined" ? document.getElementById(id) : null);

const inVitest =
  typeof process !== "undefined" && process.env && process.env.VITEST === "true";

export function projectState() {
  if (typeof document === "undefined" || !document.documentElement || !document.body) {
    return;
  }
  const heatRatio = AppState.heat / AppState.maxHeat;
  document.documentElement.style.setProperty("--heat-ratio", String(heatRatio));
  if (AppState.reducedMotion) {
    document.documentElement.style.setProperty("--prefers-reduced-motion", "reduce");
  } else {
    document.documentElement.style.removeProperty("--prefers-reduced-motion");
  }
  document.body.classList.toggle("reactor-meltdown", AppState.meltdown);
  document.body.classList.toggle("game-paused", AppState.isPaused);

  const moneyEl = el("info_money");
  if (moneyEl) moneyEl.textContent = `$${fmt(AppState.money)}`;
  const powerEl = el("info_power");
  if (powerEl) powerEl.textContent = `${Math.floor(AppState.power)} / ${AppState.maxPower}`;
  const heatEl = el("info_heat");
  if (heatEl) heatEl.textContent = `${Math.floor(AppState.heat)} / ${AppState.maxHeat}`;
  const epEl = el("info_ep");
  if (epEl) epEl.textContent = `${fmt(AppState.ep)} EP`;

  renderGridCanvas();

  if (!inVitest) {
    requestAnimationFrame(projectState);
  }
}

function renderGridCanvas() {
  const canvas = el("reactor-canvas");
  if (!canvas || !AppState.grid) return;
  const ctx = canvas.getContext("2d");
  const ts = 48;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < AppState.rows * AppState.cols; i++) {
    const x = (i % AppState.cols) * ts;
    const y = Math.floor(i / AppState.cols) * ts;

    ctx.fillStyle = "#1a1d1a";
    ctx.fillRect(x, y, ts - 1, ts - 1);

    const type = AppState.grid.type[i];
    if (type > 0) {
      ctx.fillStyle = type === 1 ? "#00f2ff" : "#666";
      ctx.fillRect(x + 4, y + 4, ts - 8, ts - 8);
    }
  }
}
