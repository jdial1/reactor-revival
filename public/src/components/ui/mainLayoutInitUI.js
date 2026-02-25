export function initMainLayout(ui) {
  ui.coreLoopUI.cacheDOMElements();
  ui.coreLoopUI.initVarObjsConfig();
  ui.setupEventListeners();
  ui.controlDeckUI.initializeToggleButtons();
  ui.partsPanelUI.setupPartsTabs();
  ui.partsPanelUI.initializePartsPanel();
  ui.quickStartUI.addHelpButtonToMainPage();
  ui.userAccountUI.setupUserAccountButton();
  ui.initializeControlDeck();
  ui.tabSetupUI.setupBuildTabButton();
  ui.tabSetupUI.setupMenuTabButton();
  ui.deviceFeatures.setupAppBadgeVisibilityHandler();
  ui.deviceFeatures.updateWakeLockState();
  if (ui.DOMElements.basic_overview_section && ui.help_text?.basic_overview) {
    ui.DOMElements.basic_overview_section.innerHTML = `
        <h3>${ui.help_text.basic_overview.title}</h3>
        <p>${ui.help_text.basic_overview.content}</p>
        `;
  }
  if (ui.gridScaler) ui.gridScaler.init();
  ui.gridScaler.resize();
  ui.particleEffectsUI.initParticleCanvas();
  requestAnimationFrame((ts) => ui.coreLoopUI.runUpdateInterfaceLoop(ts));
  if (ui.game && ui.game.engine) {
    const status = ui.game.paused ? "paused" : (ui.game.engine.running ? "running" : "stopped");
    ui.stateManager.setVar("engine_status", status);
  }
  ui.performanceUI.startPerformanceTracking();
}
