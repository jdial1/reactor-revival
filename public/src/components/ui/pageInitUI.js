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
      const pauseCfg = this.ui.var_objs_config?.pause;
      const paused = !!this.ui.stateManager?.getVar("pause");
      if (pauseCfg?.onupdate) pauseCfg.onupdate(paused);
    }

    switch (pageId) {
      case "reactor_section":
        logger.log('debug', 'ui', '[PageInit] reactor_section init start', {
          hasGridScaler: !!this.ui.gridScaler,
          hasWrapper: !!this.ui.gridScaler?.wrapper,
          hasReactor: !!this.ui.DOMElements.reactor,
          hasGridRenderer: !!this.ui.gridCanvasRenderer,
          hasGame: !!this.ui.game,
          hasTileset: !!this.ui.game?.tileset
        });
        if (this.ui.gridScaler && !this.ui.gridScaler.wrapper) {
          this.ui.gridScaler.init();
        }
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
        logger.log('debug', 'ui', '[PageInit] reactor_section init done');
        this.ui.initializeCopyPasteUI();
        this.ui.modalOrchestrationUI.initializeSellAllButton();
        this.ui.pageSetupUI.setupMobileTopBar();
        this.ui.pageSetupUI.setupMobileTopBarResizeListener();
        break;
      case "upgrades_section":
        requestAnimationFrame(() => {
          if (
            game.upgradeset &&
            typeof game.upgradeset.populateUpgrades === "function"
          ) {
            game.upgradeset.populateUpgrades();
          } else {
            logger.log('warn', 'ui', 'upgradeset.populateUpgrades is not a function or upgradeset missing');
          }
          this.ui.sandboxUI.initializeSandboxUpgradeButtons();
        });
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
        this.setupResearchCollapsibleSections();
        this.ui.sandboxUI.initializeSandboxUpgradeButtons();
        this.loadAndSetVersion();
        break;
      case "about_section":
        const versionEl = document.getElementById("about_version");
        const appVersionEl = document.getElementById("app_version");
        const versionSource = appVersionEl?.textContent || this._cachedVersion;
        if (versionEl && versionSource) versionEl.textContent = versionSource;
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

  setupResearchCollapsibleSections() {
    if (this._researchCollapsibleSetup) return;
    this._researchCollapsibleSetup = true;
    const section = document.getElementById("experimental_upgrades_section");
    if (!section) return;
    section.addEventListener("click", (e) => {
      const header = e.target.closest(".research-section-header");
      if (!header) return;
      const article = header.closest(".research-collapsible");
      if (!article) return;
      e.preventDefault();
      const collapsed = article.classList.toggle("section-collapsed");
      header.setAttribute("aria-expanded", String(!collapsed));
    });
    section.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const header = e.target.closest(".research-section-header");
      if (!header) return;
      e.preventDefault();
      header.click();
    });
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
        this._cachedVersion = version;
        setTimeout(() => {
          const retryEl = document.getElementById("app_version");
          if (retryEl) retryEl.textContent = version;
        }, 100);
      }
    } catch (error) {
      if (!error.message || !error.message.includes("Expected JSON")) {
        logger.log('warn', 'ui', 'Could not load version info:', error.message || error);
      }
      const appVersionEl = document.getElementById("app_version");
      if (appVersionEl) appVersionEl.textContent = "Unknown";
    }
  }
}
