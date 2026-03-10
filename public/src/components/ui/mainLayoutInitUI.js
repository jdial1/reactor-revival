import { html, render } from "lit-html";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";

export function initMainLayout(ui) {
  ui.setupEventListeners();
  ui.controlDeckUI.initializeToggleButtons();
  ui.initializeControlDeck();
  ui.partsPanelUI.setupPartsTabs();
  ui.partsPanelUI.initializePartsPanel();
  ui.coreLoopUI.cacheDOMElements();
  ui.coreLoopUI.initVarObjsConfig();
  ui.quickStartUI.addHelpButtonToMainPage();
  ui.userAccountUI.setupUserAccountButton();
  ui.tabSetupUI.setupBuildTabButton();
  ui.tabSetupUI.setupMenuTabButton();
  ui.deviceFeatures.setupAppBadgeVisibilityHandler();
  ui.deviceFeatures.updateWakeLockState();
  const basicOverview = ui.coreLoopUI?.getElement?.("basic_overview_section") ?? ui.DOMElements?.basic_overview_section;
  if (basicOverview && ui.help_text?.basic_overview) {
    render(html`
      <h3>${ui.help_text.basic_overview.title}</h3>
      <p>${unsafeHTML(ui.help_text.basic_overview.content)}</p>
    `, basicOverview);
  }
  if (ui.gridScaler) ui.gridScaler.init();
  if (document.getElementById("reactor_wrapper")) {
    ui.gridScaler.resize();
  }
  ui.particleEffectsUI.initParticleCanvas();
  requestAnimationFrame((ts) => ui.coreLoopUI.runUpdateInterfaceLoop(ts));
  if (ui.game && ui.game.engine) {
    const status = ui.game.paused ? "paused" : (ui.game.engine.running ? "running" : "stopped");
    ui.stateManager.setVar("engine_status", status);
  }
  ui.performanceUI.startPerformanceTracking();
}
