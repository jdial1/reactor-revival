import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const p = path.join(__dirname, "..", "public", "src", "components", "ui-components.js");
let s = fs.readFileSync(p, "utf8");

const INFOBAR_INSERT = `function resetInfoBarCathodeState(ui) {
  ui._cathodeInfoBarFirst = Object.fromEntries(INFO_BAR_CATHODE_IDS.map((id) => [id, true]));
  ui._cathodeInfoBarLast = {};
  ui._cathodeInfoBarTargets = null;
}

function infoBarCathodeAfterRender(ui) {
  const targets = ui._cathodeInfoBarTargets;
  if (!targets) return;
  for (const id of INFO_BAR_CATHODE_IDS) {
    const el = document.getElementById(id);
    const text = targets[id];
    if (!el || typeof text !== "string") continue;
    if (ui._cathodeInfoBarFirst[id]) {
      ui._cathodeInfoBarFirst[id] = false;
      el.textContent = text;
      ui._cathodeInfoBarLast[id] = text;
      continue;
    }
    if (ui._cathodeInfoBarLast[id] === text) continue;
    ui._cathodeInfoBarLast[id] = text;
    runCathodeScramble(el, text, { durationMs: 150 });
  }
}

function buildInfoBarTemplate(ui, state) {
  const power = toNumber(state.current_power);
  const heat = toNumber(state.current_heat);
  const maxP = toNumber(state.max_power) || 1;
  const maxH = toNumber(state.max_heat) || 1;

  const pBar = getBarVisuals(power, maxP, "--fill-height", "vu");
  const hBar = getBarVisuals(heat, maxH, "--fill-height", "heatVu");

  const meltdown = !!state.melting_down;
  const powerClass = classMap({ "info-item": true, power: true, full: pBar.isFull, meltdown });
  const heatClass = classMap({ "info-item": true, heat: true, full: hBar.isFull, meltdown, "heat-led-warning": hBar.isWarning });
  const moneyDisplay = meltdown ? "\u2622\uFE0F" : \`$\${formatNumberCompactIntl(state.current_money ?? 0)}\`;
  const moneyDisplayMobile = meltdown ? "\u2622\uFE0F" : formatNumberCompactIntl(state.current_money ?? 0);

  const activeBuffs = state.active_buffs ?? [];

  const epVisible = toNumber(state.current_exotic_particles) > 0;
  const epContentStyle = styleMap({ display: epVisible ? "flex" : "none" });
  const epText = formatNumberCompactIntl(state.current_exotic_particles ?? 0);
  ui._cathodeInfoBarTargets = {
    info_money_desktop: moneyDisplay,
    info_money: moneyDisplayMobile,
    info_ep_value_desktop: epText,
    info_ep_value: epText,
  };

  return infoBarTemplate({
    powerClass,
    heatClass,
    powerBarStyle: pBar.style,
    heatBarStyle: hBar.style,
    powerTextDesktop: fmt(power, 2),
    powerTextMobile: fmt(power, 0),
    maxPowerDesktop: fmt(maxP, 2),
    maxPowerMobile: fmt(maxP),
    heatTextDesktop: fmt(heat, 2),
    heatTextMobile: fmt(heat, 0),
    maxHeatDesktop: fmt(maxH, 2),
    maxHeatMobile: fmt(maxH),
    epContentStyle,
    epVisible,
    activeBuffs,
  });
}

export function teardownInfoBar(ui) {
  if (ui._infoBarUnmount) {
    INFO_BAR_CATHODE_IDS.forEach((id) => cancelCathodeScramble(document.getElementById(id)));
    try { ui._infoBarUnmount(); } catch (_) {}
    ui._infoBarUnmount = null;
  }
  if (ui._infoBarAbortController) {
    ui._infoBarAbortController.abort();
    ui._infoBarAbortController = null;
  }
}

export function mountInfoBar(ui) {
  const root = document.getElementById("info_bar_root");
  if (!root || !ui.game?.state) return;

  teardownInfoBar(ui);
  resetInfoBarCathodeState(ui);
  ui._infoBarAbortController = new AbortController();
  const signal = ui._infoBarAbortController.signal;

  const subscriptions = [{
    state: ui.game.state,
    keys: ["current_power", "max_power", "current_heat", "max_heat", "current_money", "current_exotic_particles", "active_buffs", "melting_down", "power_net_change", "heat_net_change", "stats_power", "stats_net_heat"],
  }];
  ui._infoBarUnmount = ReactiveLitComponent.mountMulti(
    subscriptions,
    () => buildInfoBarTemplate(ui, ui.game.state),
    root,
    () => infoBarCathodeAfterRender(ui)
  );

  document.getElementById("control_deck_build_fab")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    togglePartsPanelForBuildButton(ui);
  }, { signal });

  ui._unmounts.push(() => teardownInfoBar(ui));
}

`;

function replaceRange(label, startMarker, endMarker, insert) {
  const start = s.indexOf(startMarker);
  const end = s.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`${label}: markers not found`);
  s = s.slice(0, start) + insert + s.slice(end);
}

replaceRange("infobar", "class InfoBarUI {", "const PERCENT_FULL = 100;", INFOBAR_INSERT);

fs.writeFileSync(p, s);
console.log("patched infobar");
