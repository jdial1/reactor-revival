import { logger } from "../../utils/logger.js";

export class PageInitUI {
  constructor(ui) {
    this.ui = ui;
  }

  initializePage(pageId) {
    const game = this.ui.game;
    this.ui.coreLoopUI.cacheDOMElements(pageId);

    if (pageId === "reactor_section") {
      this.ui.coreLoopUI.initVarObjsConfig();
    }

    switch (pageId) {
      case "reactor_section":
        if (this.ui.DOMElements.reactor) {
          this.ui.DOMElements.reactor.innerHTML = "";
          if (this.ui.gridCanvasRenderer) {
            this.ui.gridCanvasRenderer.init(this.ui.DOMElements.reactor);
          }
        }

        this.ui.inputHandler.setupReactorEventListeners();
        this.ui.inputHandler.setupSegmentHighlight();
        this.ui.gridScaler.resize();
        if (this.ui.gridCanvasRenderer) {
          this.ui.gridCanvasRenderer.setContainer(this.ui.DOMElements.reactor_wrapper || this.ui.DOMElements.reactor_background || null);
        }
        if (this.ui.game?.tileset) {
          this.ui.game.tileset.updateActiveTiles();
        }
        if (this.ui.gridCanvasRenderer && this.ui.game) {
          this.ui.gridCanvasRenderer.render(this.ui.game);
        }
        this.ui.initializeCopyPasteUI();
        this.ui.modalOrchestrationUI.initializeSellAllButton();
        this.ui.pageSetupUI.setupMobileTopBar();
        this.ui.pageSetupUI.setupMobileTopBarResizeListener();
        break;
      case "upgrades_section":
        if (
          game.upgradeset &&
          typeof game.upgradeset.populateUpgrades === "function"
        ) {
          game.upgradeset.populateUpgrades();
        } else {
          logger.log('warn', 'ui', 'upgradeset.populateUpgrades is not a function or upgradeset missing');
        }
        this.ui.sandboxUI.initializeSandboxUpgradeButtons();
        break;
      case "experimental_upgrades_section":
        if (
          game.upgradeset &&
          typeof game.upgradeset.populateExperimentalUpgrades === "function"
        ) {
          game.upgradeset.populateExperimentalUpgrades();
        } else {
          logger.log('warn', 'ui', 'upgradeset.populateExperimentalUpgrades is not a function or upgradeset missing');
        }
        this.ui.userAccountUI.renderDoctrineTreeViewer();
        this.ui.sandboxUI.initializeSandboxUpgradeButtons();
        this.loadAndSetVersion();
        break;
      case "about_section":
        const versionEl = document.getElementById("about_version");
        const appVersionEl = document.getElementById("app_version");
        if (versionEl && appVersionEl) {
          versionEl.textContent = appVersionEl.textContent;
        }
        break;
      case "leaderboard_section":
        this.ui.pageSetupUI.setupLeaderboardPage();
        break;
      case "soundboard_section":
        this.ui.pageSetupUI.setupSoundboardPage();
        break;
      default:
        break;
    }

    this.ui.objectivesUI.showObjectivesForPage(pageId);
  }

  async loadAndSetVersion() {
    try {
      const { getResourceUrl } = await import("../../utils/util.js");
      const response = await fetch(getResourceUrl("version.json"));

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        if (text.trim().startsWith("<!DOCTYPE") || text.trim().startsWith("<html")) {
          throw new Error("HTML response received (likely 404 fallback)");
        }
        throw new Error(`Expected JSON but got ${contentType || "unknown content type"}`);
      }

      const versionData = await response.json();
      const version = versionData.version || "Unknown";

      const appVersionEl = document.getElementById("app_version");
      if (appVersionEl) {
        appVersionEl.textContent = version;
      } else {
        logger.log('warn', 'ui', 'app_version element not found in DOM');
        setTimeout(async () => {
          const retryEl = document.getElementById("app_version");
          if (retryEl) {
            retryEl.textContent = version;
          } else {
            logger.error("[UI] app_version element still not found after retry");
          }
        }, 100);
      }
    } catch (error) {
      if (!error.message || !error.message.includes("Expected JSON")) {
        logger.log('warn', 'ui', 'Could not load version info:', error.message || error);
      }
      const appVersionEl = document.getElementById("app_version");
      if (appVersionEl) {
        appVersionEl.textContent = "Unknown";
      }
    }
  }
}
