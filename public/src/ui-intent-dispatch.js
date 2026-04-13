import { MOBILE_BREAKPOINT_PX } from "./utils.js";

export function dispatchUiIntent(game, ui, intent, e) {
  if (!game || !ui?.stateManager) return;
  const btn = e?.currentTarget;
  if (intent === "SELL_POWER") {
    const moneyBefore = game.state.current_money;
    game.sell_action();
    const moneyAfter = game.state.current_money;
    const moneyGained = moneyAfter?.sub ? moneyAfter.sub(moneyBefore).toNumber() : Number(moneyAfter) - Number(moneyBefore);
    if (moneyGained <= 0) return;
    const isMobile = typeof window !== "undefined" && window.innerWidth <= MOBILE_BREAKPOINT_PX;
    const moneyDisplay = document.getElementById("control_deck_money");
    const moneyTarget = isMobile
      ? document.getElementById("mobile_passive_money_value")?.closest(".passive-top-money") ?? document.getElementById("mobile_passive_top_bar")
      : moneyDisplay;
    if (moneyDisplay) ui.particleEffectsUI.showFloatingText(moneyDisplay, moneyGained);
    if (moneyTarget && btn) {
      ui.particleEffectsUI.createBoltParticle(btn, moneyTarget);
      ui.particleEffectsUI.createSellSparks(btn, moneyTarget);
    }
    return;
  }
  if (intent === "VENT_HEAT") {
    const maxH = ui.stateManager.getVar("max_heat") || 0;
    const curH = ui.stateManager.getVar("current_heat") || 0;
    const heatRatio = maxH > 0 ? curH / maxH : 0;
    game.manual_reduce_heat_action();
    if (btn) {
      ui.particleEffectsUI.createSteamParticles(btn, heatRatio);
      if (btn.hasAttribute("data-vent-animate")) {
        btn.classList.add("venting");
        setTimeout(() => btn.classList.remove("venting"), 400);
      }
    }
    return;
  }
  if (intent === "PAUSE_TOGGLE") {
    const currentState = ui.stateManager.getVar("pause");
    ui.stateManager.setVar("pause", !currentState);
  }
}

export function installAppRootIntentDelegation(game, ui) {
  const root = typeof document !== "undefined" ? document.getElementById("app_root") : null;
  if (!root || root._intentDelegationBound) return () => {};
  const handler = (e) => {
    const t = e.target?.closest?.("[data-intent]");
    if (!t || !root.contains(t)) return;
    const id = t.getAttribute("data-intent");
    if (!id) return;
    dispatchUiIntent(game, ui, id, { currentTarget: t, target: e.target });
  };
  root.addEventListener("click", handler);
  root._intentDelegationBound = true;
  return () => {
    root.removeEventListener("click", handler);
    root._intentDelegationBound = false;
  };
}
