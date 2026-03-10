import { html } from "lit-html";
import { logger } from "../../utils/logger.js";
import { mountSectionCountsReactive, updateSectionCountsState } from "./upgrades/sectionCountUpdaterUI.js";
import { ReactiveLitComponent } from "../ReactiveLitComponent.js";

export class PageInitUI {
  constructor(ui) {
    this.ui = ui;
    this.ui.registry.register('PageInit', this);
  }

  clearReactor() {
    const reactor = this.getReactor();
    if (reactor) reactor.innerHTML = "";
  }

  getReactor() {
    return this.ui.coreLoopUI?.getElement?.("reactor") ?? this.ui.DOMElements?.reactor ?? document.getElementById("reactor");
  }

  getReactorWrapper() {
    return this.ui.coreLoopUI?.getElement?.("reactor_wrapper") ?? this.ui.DOMElements?.reactor_wrapper ?? document.getElementById("reactor_wrapper");
  }

  getReactorBackground() {
    return this.ui.coreLoopUI?.getElement?.("reactor_background") ?? this.ui.DOMElements?.reactor_background ?? document.getElementById("reactor_background");
  }

  setGridContainer(container) {
    if (this.ui.gridCanvasRenderer) this.ui.gridCanvasRenderer.setContainer(container);
  }

  setReactorVisibility(visible) {
    const reactor = this.getReactor();
    if (reactor) reactor.style.visibility = visible ? "visible" : "hidden";
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
        const reactor = this.getReactor();
        logger.log('debug', 'ui', '[PageInit] reactor_section init start', {
          hasGridScaler: !!this.ui.gridScaler,
          hasWrapper: !!this.ui.gridScaler?.wrapper,
          hasReactor: !!reactor,
          hasGridRenderer: !!this.ui.gridCanvasRenderer,
          hasGame: !!this.ui.game,
          hasTileset: !!this.ui.game?.tileset
        });
        if (this.ui.gridScaler && !this.ui.gridScaler.wrapper) {
          this.ui.gridScaler.init();
        }
        if (reactor) {
          this.clearReactor();
          if (this.ui.gridCanvasRenderer) {
            this.ui.gridCanvasRenderer.init(reactor);
          }
        }

        this.ui.inputHandler.setupReactorEventListeners();
        this.ui.inputHandler.setupSegmentHighlight();
        this.ui.gridScaler.resize();
        const container = this.getReactorWrapper() || this.getReactorBackground();
        this.setGridContainer(container);
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
        this.ui.pageSetupUI.setupAffordabilityBanners("upgrades_no_affordable_banner");
        if (!this.ui._sectionCountsMountedUpgrades && document.getElementById("upgrades_content_wrapper")) {
          this.ui._sectionCountsUnmountUpgrades = mountSectionCountsReactive(this.ui, "upgrades_content_wrapper");
          this.ui._sectionCountsMountedUpgrades = true;
        }
        if (game?.upgradeset) updateSectionCountsState(this.ui, game);
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
        this.ui.pageSetupUI.setupAffordabilityBanners("research_no_affordable_banner");
        if (!this.ui._sectionCountsMountedResearch && document.getElementById("experimental_upgrades_content_wrapper")) {
          this.ui._sectionCountsUnmountResearch = mountSectionCountsReactive(this.ui, "experimental_upgrades_content_wrapper");
          this.ui._sectionCountsMountedResearch = true;
        }
        if (game?.upgradeset) updateSectionCountsState(this.ui, game);
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
        this.setupVersionDisplay();
        if (!this.ui.uiState?.version_display?.app) this.loadAndSetVersion();
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

  setupVersionDisplay() {
    const ui = this.ui;
    if (!ui?.uiState || ui._versionDisplayMounted) return;
    const aboutEl = document.getElementById("about_version");
    const appEl = document.getElementById("app_version");
    const renderVersion = (el) => {
      if (!el?.isConnected) return;
      ReactiveLitComponent.mountMulti(
        [{ state: ui.uiState, keys: ["version_display"] }],
        () => html`${ui.uiState?.version_display?.app ?? ui.uiState?.version_display?.about ?? ""}`,
        el
      );
    };
    if (aboutEl) renderVersion(aboutEl);
    if (appEl && appEl !== aboutEl) renderVersion(appEl);
    ui._versionDisplayMounted = true;
  }

  async loadAndSetVersion() {
    const ui = this.ui;
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

      if (ui?.uiState) {
        ui.uiState.version_display = { ...ui.uiState.version_display, app: version, about: version };
      }
    } catch (error) {
      if (!error.message || !error.message.includes("Expected JSON")) {
        logger.log('warn', 'ui', 'Could not load version info:', error.message || error);
      }
      if (ui?.uiState) {
        ui.uiState.version_display = { ...ui.uiState.version_display, app: "Unknown", about: "Unknown" };
      }
    }
  }
}
