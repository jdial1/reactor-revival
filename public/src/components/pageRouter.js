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
    // Track if pause was applied automatically due to navigation away from reactor
    // so we can safely auto-unpause when returning.
    this.navigationPaused = false;
    // Track if we are currently navigating to prevent clearing navigationPaused during auto-pause
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
    if (!wasOnReactorPage && goingToReactorPage && this.navigationPaused) {
      this.navigationPaused = false;
      this.isNavigating = true;
      this.ui.game.resume();
      this.isNavigating = false;
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

    // Handle grid hiding for smooth transitions from upgrades to reactor
    if (this.currentPageId === "upgrades_section" && goingToReactorPage) {
      const reactorElement = this.ui.DOMElements.reactor;
      if (reactorElement) {
        reactorElement.style.visibility = "hidden";
        setTimeout(() => {
          if (reactorElement) {
            reactorElement.style.visibility = "visible";
          }
        }, 250);
      } else {
        logger.log('warn', 'ui', 'PageRouter: Reactor element not found for grid hiding');
      }
    }

    // Ensure game layout is loaded for stateless pages
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

    // Hide the currently showing page
    if (this.currentPageId && this.pageCache.has(this.currentPageId)) {
      this.pageCache.get(this.currentPageId).classList.add("hidden");
    }

    const hadPreviousPage = this.currentPageId != null;
    this.currentPageId = pageId;
    window.location.hash = pageId;
    this.updateNavigation(pageId);

    // Clean up UI for stateless pages (like privacy policy)
    this.cleanupUIForStatelessPage(pageId);

    // If page is already cached, just show it and we're done.
    if (this.pageCache.has(pageId)) {
      const cachedPage = this.pageCache.get(pageId);
      cachedPage.classList.remove("hidden");

      // Initialize UI for the cached page to ensure DOM elements are properly cached
      this.ui.pageInitUI.initializePage(pageId);

      if (pageId === "reactor_section" && this.ui.resizeReactor) {
        // For reactor page, do an immediate resize and then a delayed resize to handle any layout shifts
        this.ui.resizeReactor();
        // Add a small delay to ensure the page transition is complete before recalculating
        setTimeout(() => {
          this.ui.resizeReactor();
          // Ensure grid is visible after transition
          const reactorElement = this.ui.DOMElements.reactor;
          if (reactorElement) {
            reactorElement.style.visibility = "visible";
          }
        }, 100);
      } else if (pageId === "experimental_upgrades_section") {
        // For research page, always load version when showing the page
        this.ui.pageInitUI.loadAndSetVersion();
      }

      this.ui.objectivesUI.showObjectivesForPage(pageId);
      if (hadPreviousPage && this.ui.game?.audio) this.ui.game.audio.play("tab_switch");
      return;
    }

    // --- START SCROLL TO TOP ---
    // Scroll to top for specific pages
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
    // --- END SCROLL TO TOP ---

    // Page not cached, so load, build, and initialize it.
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
      const html = await response.text();

      const tempContainer = document.createElement("div");
      tempContainer.innerHTML = html;
      const newPageElement = tempContainer.firstElementChild;

      if (newPageElement && newPageElement.classList.contains("page")) {
        // Reset animation state by forcing reflow if needed, but just appending works with css animation
        pageContentArea.appendChild(newPageElement);
        this.pageCache.set(pageId, newPageElement);
        
        // Small delay to allow DOM to register before removing hidden (triggers animation)
        requestAnimationFrame(() => {
             newPageElement.classList.remove("hidden");
        });

        if (!this.initializedPages.has(pageId)) {
          this.ui.pageInitUI.initializePage(pageId);
          this.initializedPages.add(pageId);
        }

        // For reactor page, ensure proper sizing after page load
        if (pageId === "reactor_section" && this.ui.resizeReactor) {
          // Add a small delay to ensure the page transition is complete before recalculating
          setTimeout(() => {
            this.ui.resizeReactor();
            // Ensure grid is visible after transition
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
          pageContentArea.innerHTML = await errorResponse.text();
        } else {
          pageContentArea.innerHTML = `<div class="explanitory"><h3>Error</h3><p>Could not load page. Please check your connection and try again.</p></div>`;
        }
      } catch (errorPageError) {
        logger.log('error', 'ui', 'Failed to load error page:', errorPageError);
        pageContentArea.innerHTML = `<div class="explanitory"><h3>Error</h3><p>Could not load page. Please check your connection and try again.</p></div>`;
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

    // Add page-specific class to body for conditional styling
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

      // Programmatically hide navigation elements as fallback
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

      // Populate privacy policy date if on privacy policy page
      if (pageId === "privacy_policy_section") {
        this.populatePrivacyPolicyDate();
      }

      // Remove game-state classes from body, keep only the page class
      const bodyClasses = document.body.className.split(" ");
      const cleanClasses = bodyClasses.filter(
        (cls) =>
          cls === `page-${pageId.replace("_section", "")}` ||
          (!cls.startsWith("page-") &&
            !cls.includes("panel") &&
            !cls.includes("open"))
      );
      document.body.className = cleanClasses.join(" ");

      // Ensure the page class is present
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

        // Parse version format: "25_06_23-1539" -> "June 25, 2023"
        const parts = version.split("-")[0].split("_");
        if (parts.length === 3) {
          const day = parts[0];
          const month = parts[1];
          const year = "20" + parts[2]; // Convert YY to YYYY

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
      // Fallback to current date if version loading fails
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
      const html = await response.text();
      const wrapper = document.getElementById("wrapper");
      if (wrapper) {
        wrapper.innerHTML = html;
        wrapper.classList.remove("hidden");
      } else {
        logger.log('error', 'ui', 'PageRouter: #wrapper element not found to load game layout.');
      }
    } catch (error) {
      logger.log('error', 'ui', 'PageRouter: Failed to load game layout:', error);
    }
  }
}
