import { render } from "lit-html";
import { logger } from "./utils.js";
import { subscribeKey, actions } from "./store.js";
import {
  gameShellTemplate,
  pageSectionTemplates,
  pageLoadErrorTemplate,
} from "./templates/pageTemplates.js";
import {
  initializePage,
  setPageReactorVisibility,
  loadAndSetVersionForPage,
  closePartsPanel,
} from "./components/ui-components.js";

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

  _syncResearchEpHumPage(pageId) {
    if (this._epHumUnsub) {
      this._epHumUnsub();
      this._epHumUnsub = null;
    }
    const audio = this.ui.game?.audio;
    if (!audio) return;
    if (pageId !== "experimental_upgrades_section") {
      audio.stopResearchEpHum();
      return;
    }
    const game = this.ui.game;
    const sync = () => audio.syncResearchEpHum(game);
    sync();
    if (game?.state) {
      this._epHumUnsub = subscribeKey(game.state, "current_exotic_particles", sync);
    }
  }

  _applyPauseStateForNavigation(wasOnReactorPage, goingToReactorPage) {
    if (!this.ui.game?.engine) return;
    if (wasOnReactorPage && !goingToReactorPage) {
      closePartsPanel(this.ui);
      const currentlyPaused = !!this.ui.game?.state?.pause;
      if (!currentlyPaused) {
        this.navigationPaused = true;
        this.isNavigating = true;
        this.ui.game.pause();
        this.isNavigating = false;
      } else {
        this.navigationPaused = false;
      }
      return;
    }
    if (!wasOnReactorPage && goingToReactorPage) {
      if (this.navigationPaused) {
        this.navigationPaused = false;
        this.isNavigating = true;
        this.ui.game.resume();
        this.isNavigating = false;
      } else {
        const shouldBePaused = !!this.ui.game?.state?.pause;
        if (shouldBePaused && !this.ui.game.paused) {
          this.ui.game.pause();
        }
      }
    }
  }

  async loadPage(pageId, force = false) {
    if (!force && this.ui.game.reactor.has_melted_down) {
      return;
    }
    if (!force && this.currentPageId === pageId) {
      return;
    }

    const wasOnReactorPage = this.currentPageId === "reactor_section";
    const goingToReactorPage = pageId === "reactor_section";
    this._applyPauseStateForNavigation(wasOnReactorPage, goingToReactorPage);

    if (this.currentPageId === "upgrades_section" && goingToReactorPage) {
      setPageReactorVisibility(this.ui, false);
      setTimeout(() => setPageReactorVisibility(this.ui, true), 250);
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
      this.pageCache.get(this.currentPageId).classList.add("hidden");
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

      initializePage(this.ui, pageId);

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
          initializePage(this.ui, pageId);
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
        this._syncResearchEpHumPage(pageId);
        this.ui.objectivesUI.showObjectivesForPage(pageId);
      } else {
        logger.log("warn", "ui", `PageRouter: No .page element found in loaded content for ${pageId}`);
      }
    } catch (error) {
      logger.error("PageRouter: Failed to render page \"%s\":", pageId, error);
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

      const bodyClasses = document.body.className.split(" ");
      const cleanClasses = bodyClasses.filter(
        (cls) =>
          cls === `page-${pageId.replace("_section", "")}` ||
          (!cls.startsWith("page-") &&
            !cls.includes("panel") &&
            !cls.includes("open"))
      );
      document.body.className = cleanClasses.join(" ");

      if (
        !document.body.classList.contains(
          `page-${pageId.replace("_section", "")}`
        )
      ) {
        document.body.classList.add(`page-${pageId.replace("_section", "")}`);
      }
    }
  }

  async populatePrivacyPolicyDate() {
    try {
      const response = await fetch("version.json");
      if (response.ok) {
        const versionData = await response.json();
        const version = versionData.version;

        const parts = version.split("-")[0].split("_");
        if (parts.length === 3) {
          const day = parts[0];
          const month = parts[1];
          const year = "20" + parts[2];

          const monthNames = [
            "January",
            "February",
            "March",
            "April",
            "May",
            "June",
            "July",
            "August",
            "September",
            "October",
            "November",
            "December",
          ];

          const monthName = monthNames[parseInt(month) - 1];
          const formattedDate = `${monthName} ${day}, ${year}`;

          const dateElement = document.getElementById("privacy-policy-date");
          if (dateElement) {
            dateElement.textContent = formattedDate;
          }
        }
      }
    } catch (error) {
      logger.error("Failed to load version for privacy policy date:", error);
      const dateElement = document.getElementById("privacy-policy-date");
      if (dateElement) {
        dateElement.textContent = new Date().toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        });
      }
    }
  }

  loadGameLayout() {
    try {
      const wrapper = document.getElementById("wrapper");
      if (wrapper) {
        render(gameShellTemplate(), wrapper);
        wrapper.classList.remove("hidden");
      } else {
        logger.log("error", "ui", "PageRouter: #wrapper element not found to load game layout.");
      }
    } catch (error) {
      logger.log("error", "ui", "PageRouter: Failed to render game layout:", error);
    }
  }
}
