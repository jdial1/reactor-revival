import { render } from "lit-html";
import { logger } from "./core/logger.js";
import { subscribeKey, actions } from "./store.js";
import { resolveAudioService } from "./services/app-services.js";
import { gameShellTemplate } from "./templates/pageShellTemplates.js";
import { safeCall, teardownAll } from "./core/teardown.js";
import {
  pageSectionTemplates,
  pageLoadErrorTemplate,
} from "./templates/sectionPageTemplates.js";
import {
  setPageReactorVisibility,
  loadAndSetVersionForPage,
  closePartsPanel,
} from "./components/ui-components.js";
import { dispatchToggleIntent } from "./components/grid/ui-intents.js";
import { isShopOverlayPage, isSimVisiblePage, dedupeReactorStatsDom } from "./components/shell/page-dom.js";
import { populatePrivacyPolicyDateElement, fallbackPrivacyPolicyDate } from "./templates/legalPageTemplates.js";

export const PAGE_STATES = {
  reactor_section: { template: pageSectionTemplates.reactor_section },
  upgrades_section: { template: pageSectionTemplates.upgrades_section },
  experimental_upgrades_section: {
    template: pageSectionTemplates.experimental_upgrades_section,
  },
  soundboard_section: { template: pageSectionTemplates.soundboard_section },
  about_section: { template: pageSectionTemplates.about_section },
  privacy_policy_section: {
    template: pageSectionTemplates.privacy_policy_section,
    stateless: true,
  },
  terms_of_service_section: {
    template: pageSectionTemplates.terms_of_service_section,
    stateless: true,
  },
  leaderboard_section: { template: pageSectionTemplates.leaderboard_section },
};

export class PageRouter {
  constructor(ui) {
    this.ui = ui;
    this.pages = { ...PAGE_STATES };
    this.pageCache = new Map();
    this.initializedPages = new Set();
    this.currentPageId = null;
    this.navigationPaused = false;
    this.isNavigating = false;
    this.contentAreaSelector = "#page_content_area";
    this._epHumUnsub = null;
  }

  _triggerCrtFlash() {
    const el = document.querySelector(this.contentAreaSelector);
    if (!el) return;
    el.classList.remove("crt-content-flash");
    void el.offsetWidth;
    el.classList.add("crt-content-flash");
    setTimeout(() => el.classList.remove("crt-content-flash"), 150);
  }

  _playTabNavAudio(pageId) {
    const game = this.ui.game;
    if (!game) return;
    actions.enqueueEffect(game, { kind: "sfx", id: "tab_switch", context: "global" });
    if (pageId === "upgrades_section" || pageId === "experimental_upgrades_section") {
      actions.enqueueEffect(game, { kind: "sfx", id: "tab_relay_thud", context: "global" });
    }
  }

  _teardownEpHumSync() {
    if (this._epHumUnsub) {
      safeCall(() => { this._epHumUnsub(); });
      this._epHumUnsub = null;
    }
    const audio = resolveAudioService(this.ui.game?.audio);
    audio?.stopResearchEpHum?.();
  }

  _syncResearchEpHumPage(pageId) {
    this._teardownEpHumSync();
    const audio = resolveAudioService(this.ui.game?.audio);
    if (!audio) return;
    if (pageId !== "experimental_upgrades_section") return;
    const game = this.ui.game;
    const sync = () => audio.syncResearchEpHum(game);
    sync();
    if (game?.state) {
      const unsubs = [];
      unsubs.push(subscribeKey(game.state, "current_exotic_particles", sync));
      this._epHumUnsub = () => {
        teardownAll(unsubs);
      };
    }
  }

  _applyPauseStateForNavigation(wasSimVisible, goingSimVisible) {
    const game = this.ui.game;
    if (!game?.engine) return;
    if (wasSimVisible && !goingSimVisible) {
      closePartsPanel(this.ui);
      const currentlyPaused = !!game?.state?.pause;
      if (!currentlyPaused) {
        this.navigationPaused = true;
        this.isNavigating = true;
        dispatchToggleIntent(game, "pause", true, "navigation");
        this.isNavigating = false;
      } else {
        this.navigationPaused = false;
      }
      return;
    }
    if (!wasSimVisible && goingSimVisible) {
      if (this.navigationPaused) {
        this.navigationPaused = false;
        this.isNavigating = true;
        dispatchToggleIntent(game, "pause", false, "navigation");
        this.isNavigating = false;
      } else {
        const shouldBePaused = !!game?.state?.pause;
        if (shouldBePaused && !game.paused) {
          dispatchToggleIntent(game, "pause", true, "navigation");
        }
      }
    }
  }

  async _ensurePageInCache(pageId) {
    if (this.pageCache.has(pageId)) return this.pageCache.get(pageId);
    const pageDef = this.pages[pageId];
    if (!pageDef) return null;
    const pageContentArea = document.querySelector(this.contentAreaSelector);
    if (!pageContentArea) return null;
    try {
      const tempContainer = document.createElement("div");
      render(pageDef.template(), tempContainer);
      const newPageElement = tempContainer.firstElementChild;
      if (!newPageElement?.classList.contains("page")) return null;
      newPageElement.classList.add("hidden");
      pageContentArea.appendChild(newPageElement);
      this.pageCache.set(pageId, newPageElement);
      if (!this.initializedPages.has(pageId)) {
        this.ui.initializePage(pageId);
        this.initializedPages.add(pageId);
      }
      return newPageElement;
    } catch (error) {
      logger.error(
        "PageRouter: Failed to preload page \"%s\": %s",
        pageId,
        error?.stack || error?.message || String(error)
      );
      return null;
    }
  }

  async loadPage(pageId, force = false) {
    if (!force && this.ui.game.reactor.has_melted_down) {
      return;
    }
    if (!force && this.currentPageId === pageId) {
      return;
    }

    const wasSimVisible = isSimVisiblePage(this.currentPageId);
    const goingSimVisible = isSimVisiblePage(pageId);
    this._applyPauseStateForNavigation(wasSimVisible, goingSimVisible);

    if (isShopOverlayPage(pageId)) {
      await this._ensurePageInCache("reactor_section");
      const reactorPage = this.pageCache.get("reactor_section");
      if (reactorPage) {
        reactorPage.classList.remove("hidden");
        setPageReactorVisibility(this.ui, true);
      }
    }

    const earlyPageDef = this.pages[pageId];
    if (earlyPageDef && earlyPageDef.stateless) {
      const wrapper = document.getElementById("wrapper");
      if (!wrapper || wrapper.classList.contains("hidden")) {
        await this.loadGameLayout();
      }
    }

    const pageContentArea = document.querySelector(this.contentAreaSelector);
    if (!pageContentArea) {
      logger.log('error', 'ui', `PageRouter: Content area "${this.contentAreaSelector}" not found.`);
      return;
    }

    if (this.currentPageId && this.pageCache.has(this.currentPageId)) {
      const hidePrevious = !(this.currentPageId === "reactor_section" && isShopOverlayPage(pageId));
      if (hidePrevious) {
        this.pageCache.get(this.currentPageId).classList.add("hidden");
      }
    }

    if (!goingSimVisible && this.pageCache.has("reactor_section")) {
      this.pageCache.get("reactor_section").classList.add("hidden");
    }

    const hadPreviousPage = this.currentPageId != null;
    this.currentPageId = pageId;
    window.location.hash = pageId;
    if (this.ui?.uiState) {
      this.ui.uiState.active_page = pageId;
      this.ui.uiState.active_route = pageId;
    }

    this.cleanupUIForStatelessPage(pageId);

    if (this.pageCache.has(pageId)) {
      const cachedPage = this.pageCache.get(pageId);
      cachedPage.classList.remove("hidden");

      this.ui.initializePage(pageId);

      if (pageId === "reactor_section" && this.ui.resizeReactor) {
        this.ui.resizeReactor();
        setTimeout(() => {
          this.ui.resizeReactor();
          setPageReactorVisibility(this.ui, true);
        }, 100);
      } else if (pageId === "experimental_upgrades_section") {
        void loadAndSetVersionForPage(this.ui);
      }

      if (hadPreviousPage) this._playTabNavAudio(pageId);
      if (hadPreviousPage) this._triggerCrtFlash();
      this._syncResearchEpHumPage(pageId);
      return;
    }

    const pagesToScroll = [
      "reactor_section",
      "upgrades_section",
      "experimental_upgrades_section",
    ];
    if (pagesToScroll.includes(pageId)) {
      const contentArea = document.querySelector("#main_content_wrapper");
      if (contentArea) {
        contentArea.scrollTop = 0;
      }
    }

    const pageDef = this.pages[pageId];
    if (!pageDef) {
      logger.error(
        `PageRouter: Page definition not found for ID "${pageId}".`
      );
      return;
    }

    try {
      const tempContainer = document.createElement("div");
      render(pageDef.template(), tempContainer);
      const newPageElement = tempContainer.firstElementChild;

      if (newPageElement && newPageElement.classList.contains("page")) {
        pageContentArea.appendChild(newPageElement);
        this.pageCache.set(pageId, newPageElement);

        requestAnimationFrame(() => {
          newPageElement.classList.remove("hidden");
        });

        if (!this.initializedPages.has(pageId)) {
          this.ui.initializePage(pageId);
          this.initializedPages.add(pageId);
        }

        if (pageId === "reactor_section" && this.ui.resizeReactor) {
          setTimeout(() => {
            this.ui.resizeReactor();
            setPageReactorVisibility(this.ui, true);
          }, 100);
        }
        if (hadPreviousPage) this._playTabNavAudio(pageId);
        if (hadPreviousPage) this._triggerCrtFlash();
        this.ui.objectivesUI.showObjectivesForPage(pageId);
        this._syncResearchEpHumPage(pageId);
      } else {
        logger.log("warn", "ui", `PageRouter: No .page element found in loaded content for ${pageId}`);
      }
    } catch (error) {
      logger.error(
        "PageRouter: Failed to render page \"%s\": %s",
        pageId,
        error?.stack || error?.message || String(error)
      );
      render(pageLoadErrorTemplate(), pageContentArea);
      if (this.currentPageId && this.ui?.uiState) {
        this.ui.uiState.active_page = this.currentPageId;
        this.ui.uiState.active_route = this.currentPageId;
      }
    }
  }

  cleanupUIForStatelessPage(pageId) {
    const pageDef = this.pages[pageId];
    if (pageDef && pageDef.stateless) {
      const splashContainer = document.getElementById("splash-container");
      if (splashContainer) {
        splashContainer.style.display = "none";
      }

      const quickStartModal = document.getElementById("quick-start-modal");
      if (quickStartModal) {
        quickStartModal.style.display = "none";
      }

      const navElements = ["main_top_nav", "bottom_nav", "info_bar"];

      navElements.forEach((id) => {
        const element = document.getElementById(id);
        if (element) {
          element.style.display = "none";
          element.style.visibility = "hidden";
          element.style.opacity = "0";
          element.style.height = "0";
          element.style.overflow = "hidden";
        }
      });

      if (pageId === "privacy_policy_section") {
        this.populatePrivacyPolicyDate();
      }
    }
  }

  async populatePrivacyPolicyDate() {
    try {
      await populatePrivacyPolicyDateElement();
    } catch (error) {
      logger.error("Failed to load version for privacy policy date:", error);
      const dateElement = document.getElementById("privacy-policy-date");
      if (dateElement) dateElement.textContent = fallbackPrivacyPolicyDate();
    }
  }

  loadGameLayout() {
    try {
      const wrapper = document.getElementById("wrapper");
      if (wrapper) {
        render(gameShellTemplate(), wrapper);
        dedupeReactorStatsDom();
        wrapper.classList.remove("hidden");
      } else {
        logger.log("error", "ui", "PageRouter: #wrapper element not found to load game layout.");
      }
    } catch (error) {
      logger.log("error", "ui", "PageRouter: Failed to render game layout:", error);
    }
  }

  resetForSplashReturn() {
    this._teardownEpHumSync();
    this.pageCache.clear();
    this.initializedPages.clear();
    this.currentPageId = null;
  }
}
