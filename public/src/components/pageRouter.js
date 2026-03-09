import { html, render } from "lit-html";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
import { logger } from "../utils/logger.js";

export class PageRouter {
  constructor(ui) {
    this.ui = ui;
    this.pages = {
      reactor_section: { path: "pages/reactor.html" },
      upgrades_section: { path: "pages/upgrades.html" },
      experimental_upgrades_section: { path: "pages/research.html" },
      soundboard_section: { path: "pages/debug-soundboard.html" },
      about_section: { path: "pages/about.html" },
      privacy_policy_section: {
        path: "pages/privacy-policy.html",
        stateless: true,
      },
      leaderboard_section: { path: "pages/leaderboard.html" },
    };
    this.pageCache = new Map();
    this.initializedPages = new Set();
    this.currentPageId = null;
    this.navigationPaused = false;
    this.isNavigating = false;
    this.contentAreaSelector = "#page_content_area";
  }

  _applyPauseStateForNavigation(wasOnReactorPage, goingToReactorPage) {
    if (!this.ui.game?.engine) return;
    if (wasOnReactorPage && !goingToReactorPage) {
      const currentlyPaused = this.ui.stateManager.getVar("pause");
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
        const shouldBePaused = !!this.ui.stateManager.getVar("pause");
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
      const reactorElement = this.ui.DOMElements.reactor ?? document.getElementById("reactor");
      if (reactorElement) {
        reactorElement.style.visibility = "hidden";
        setTimeout(() => {
          if (reactorElement) reactorElement.style.visibility = "visible";
        }, 250);
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
      this.pageCache.get(this.currentPageId).classList.add("hidden");
    }

    const hadPreviousPage = this.currentPageId != null;
    this.currentPageId = pageId;
    window.location.hash = pageId;
    this.updateNavigation(pageId);
    this.ui.objectivesUI.showObjectivesForPage(pageId);

    this.cleanupUIForStatelessPage(pageId);

    if (this.pageCache.has(pageId)) {
      const cachedPage = this.pageCache.get(pageId);
      cachedPage.classList.remove("hidden");

      this.ui.pageInitUI.initializePage(pageId);

      if (pageId === "reactor_section" && this.ui.resizeReactor) {
        this.ui.resizeReactor();
        setTimeout(() => {
          this.ui.resizeReactor();
          const reactorElement = this.ui.DOMElements.reactor;
          if (reactorElement) {
            reactorElement.style.visibility = "visible";
          }
        }, 100);
      } else if (pageId === "experimental_upgrades_section") {
        this.ui.pageInitUI.loadAndSetVersion();
      }

      if (hadPreviousPage && this.ui.game?.audio) this.ui.game.audio.play("tab_switch");
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
      const response = await fetch(pageDef.path);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const htmlText = await response.text();
      const tempContainer = document.createElement("div");
      render(html`${unsafeHTML(htmlText)}`, tempContainer);
      const newPageElement = tempContainer.firstElementChild;

      if (newPageElement && newPageElement.classList.contains("page")) {
        pageContentArea.appendChild(newPageElement);
        this.pageCache.set(pageId, newPageElement);
        
        requestAnimationFrame(() => {
             newPageElement.classList.remove("hidden");
        });

        if (!this.initializedPages.has(pageId)) {
          this.ui.pageInitUI.initializePage(pageId);
          this.initializedPages.add(pageId);
        }

        if (pageId === "reactor_section" && this.ui.resizeReactor) {
          setTimeout(() => {
            this.ui.resizeReactor();
            const reactorElement = this.ui.DOMElements.reactor;
            if (reactorElement) {
              reactorElement.style.visibility = "visible";
            }
          }, 100);
        }
        if (hadPreviousPage && this.ui.game?.audio) this.ui.game.audio.play("tab_switch");
        this.ui.objectivesUI.showObjectivesForPage(pageId);
      } else {
        logger.log('warn', 'ui', `PageRouter: No .page element found in loaded content for ${pageId}`);
      }
    } catch (error) {
      logger.error(
        "PageRouter: Failed to load page \"%s\" from \"%s\":",
        pageId,
        pageDef.path,
        error
      );
      try {
        const errorResponse = await fetch("pages/error-page.html");
        if (errorResponse.ok) {
          render(html`${unsafeHTML(await errorResponse.text())}`, pageContentArea);
        } else {
          render(html`<div class="explanitory"><h3>Error</h3><p>Could not load page. Please check your connection and try again.</p></div>`, pageContentArea);
        }
      } catch (errorPageError) {
        logger.log('error', 'ui', 'Failed to load error page:', errorPageError);
        render(html`<div class="explanitory"><h3>Error</h3><p>Could not load page. Please check your connection and try again.</p></div>`, pageContentArea);
      }
      if (this.currentPageId) this.updateNavigation(this.currentPageId);
    }
  }

  updateNavigation(activePageId) {
    const navSelectors = ["#main_top_nav", "#bottom_nav"];
    navSelectors.forEach((selector) => {
      const navContainer = document.querySelector(selector);
      if (navContainer) {
        navContainer.querySelectorAll("button[data-page]").forEach((btn) => {
          btn.classList.toggle("active", btn.dataset.page === activePageId);
        });
      }
    });

    document.body.className = document.body.className.replace(
      /\bpage-\w+\b/g,
      ""
    );
    if (activePageId) {
      document.body.classList.add(
        `page-${activePageId.replace("_section", "")}`
      );
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



  async loadGameLayout() {
    try {
      
      const response = await fetch("pages/game.html");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const htmlText = await response.text();
      const wrapper = document.getElementById("wrapper");
      if (wrapper) {
        render(html`${unsafeHTML(htmlText)}`, wrapper);
        wrapper.classList.remove("hidden");
      } else {
        logger.log('error', 'ui', 'PageRouter: #wrapper element not found to load game layout.');
      }
    } catch (error) {
      logger.log('error', 'ui', 'PageRouter: Failed to load game layout:', error);
    }
  }
}
