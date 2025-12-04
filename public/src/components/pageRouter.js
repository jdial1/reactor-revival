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
    this.contentAreaSelector = "#page_content_area";
  }

  async loadPage(pageId, force = false) {
    if (!force && this.ui.game.reactor.has_melted_down) {
      console.log("PageRouter: Navigation disabled during meltdown.");
      return;
    }
    if (!force && this.currentPageId === pageId) {
      console.log(`PageRouter: Page "${pageId}" is already loaded, skipping.`);
      return;
    }

    // Handle reactor pause/unpause based on page navigation
    const wasOnReactorPage = this.currentPageId === "reactor_section";
    const goingToReactorPage = pageId === "reactor_section";

    if (this.ui.game.engine) {
      if (wasOnReactorPage && !goingToReactorPage) {
        // Leaving reactor page - if not already paused, pause due to navigation
        const currentlyPaused = this.ui.stateManager.getVar("pause");
        if (!currentlyPaused) {
          this.navigationPaused = true;
          console.log("PageRouter: Pausing reactor (leaving reactor page)");
          this.ui.game.engine.stop();
          this.ui.stateManager.setVar("pause", true);
        } else {
          // Already paused (manual); do not auto-unpause on return
          this.navigationPaused = false;
        }
      } else if (!wasOnReactorPage && goingToReactorPage) {
        // Entering reactor page - only auto-unpause if we paused due to navigation
        if (this.navigationPaused) {
          console.log("PageRouter: Resuming reactor (returning to reactor page)");
          this.navigationPaused = false;
          this.ui.stateManager.setVar("pause", false);
        }
      }
    }

    // Handle grid hiding for smooth transitions from upgrades to reactor
    if (this.currentPageId === "upgrades_section" && goingToReactorPage) {
      console.log("PageRouter: Hiding grid for smooth transition from upgrades to reactor");
      const reactorElement = this.ui.DOMElements.reactor;
      if (reactorElement) {
        reactorElement.style.visibility = "hidden";
        // Ensure the grid stays hidden for the full duration
        setTimeout(() => {
          if (reactorElement) {
            reactorElement.style.visibility = "visible";
            console.log("PageRouter: Grid visibility restored after transition");
          }
        }, 250);
      } else {
        console.warn("PageRouter: Reactor element not found for grid hiding");
      }
    }

    // Ensure game layout is loaded for stateless pages
    const earlyPageDef = this.pages[pageId];
    if (earlyPageDef && earlyPageDef.stateless) {
      const wrapper = document.getElementById("wrapper");
      if (!wrapper || wrapper.classList.contains("hidden")) {
        console.log("PageRouter: Loading game layout for stateless page");
        await this.loadGameLayout();
      }
    }

    const pageContentArea = document.querySelector(this.contentAreaSelector);
    if (!pageContentArea) {
      console.error(
        `PageRouter: Content area "${this.contentAreaSelector}" not found.`
      );
      return;
    }

    // Hide the currently showing page
    if (this.currentPageId && this.pageCache.has(this.currentPageId)) {
      this.pageCache.get(this.currentPageId).classList.add("hidden");
    }

    this.currentPageId = pageId;
    window.location.hash = pageId;
    this.updateNavigation(pageId);

    // Clean up UI for stateless pages (like privacy policy)
    this.cleanupUIForStatelessPage(pageId);

    // If page is already cached, just show it and we're done.
    if (this.pageCache.has(pageId)) {
      const cachedPage = this.pageCache.get(pageId);
      cachedPage.classList.remove("hidden");
      console.log(`PageRouter: Switched to cached page "${pageId}".`);

      // Initialize UI for the cached page to ensure DOM elements are properly cached
      this.ui.initializePage(pageId);

      // Handle page-specific actions for cached pages
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
        this.ui.loadAndSetVersion();
      }

      // Always call showObjectivesForPage when switching pages, even cached ones
      this.ui.showObjectivesForPage(pageId);
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
      console.error(
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
          console.log(
            `PageRouter: Initializing page "${pageId}" for the first time.`
          );
          this.ui.initializePage(pageId);
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
      } else {
        console.warn(
          `PageRouter: No .page element found in loaded content for ${pageId}`
        );
      }
    } catch (error) {
      console.error(
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
        console.error("Failed to load error page:", errorPageError);
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
      console.log(`PageRouter: Cleaning up UI for stateless page "${pageId}"`);

      // Hide splash screen container
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
      console.error("Failed to load version for privacy policy date:", error);
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
      console.log("[DEBUG] PageRouter: Starting to load game layout...");
      const response = await fetch("pages/game.html");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const html = await response.text();
      console.log(
        "[DEBUG] PageRouter: Game layout HTML loaded, length:",
        html.length
      );

      const wrapper = document.getElementById("wrapper");
      if (wrapper) {
        console.log(
          "[DEBUG] PageRouter: Wrapper element found, setting innerHTML..."
        );
        wrapper.innerHTML = html;
        console.log(
          "[DEBUG] PageRouter: Removing hidden class from wrapper..."
        );
        wrapper.classList.remove("hidden");
        console.log(
          "[DEBUG] PageRouter: Wrapper classes are now:",
          wrapper.className
        );
      } else {
        console.error(
          "PageRouter: #wrapper element not found to load game layout."
        );
      }
    } catch (error) {
      console.error("PageRouter: Failed to load game layout:", error);
    }
  }
}
