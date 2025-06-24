export class PageRouter {
  constructor(ui) {
    this.ui = ui;
    this.pages = {
      reactor_section: { path: "pages/reactor.html" },
      upgrades_section: { path: "pages/upgrades.html" },
      experimental_upgrades_section: { path: "pages/research.html" },
      about_section: { path: "pages/about.html" },
    };
    this.pageCache = new Map();
    this.initializedPages = new Set();
    this.currentPageId = null;
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

    const pageContentArea = document.querySelector(this.contentAreaSelector);
    if (!pageContentArea) {
      console.error(
        `PageRouter: Content area "${this.contentAreaSelector}" not found.`
      );
      return;
    }

    // Hide the currently showing page
    if (this.currentPageId && this.pageCache.has(this.currentPageId)) {
      this.pageCache.get(this.currentPageId).classList.remove("showing");
    }

    this.currentPageId = pageId;
    this.updateNavigation(pageId);

    // If page is already cached, just show it and we're done.
    if (this.pageCache.has(pageId)) {
      const cachedPage = this.pageCache.get(pageId);
      cachedPage.classList.add("showing");
      console.log(`PageRouter: Switched to cached page "${pageId}".`);
      if (pageId === "reactor_section" && this.ui.resizeReactor) {
        this.ui.resizeReactor();
      }
      return;
    }

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
        pageContentArea.appendChild(newPageElement);
        this.pageCache.set(pageId, newPageElement);
        newPageElement.classList.add("showing");

        if (!this.initializedPages.has(pageId)) {
          console.log(
            `PageRouter: Initializing page "${pageId}" for the first time.`
          );
          this.ui.initializePage(pageId);
          this.initializedPages.add(pageId);
        }
      } else {
        console.warn(
          `PageRouter: No .page element found in loaded content for ${pageId}`
        );
      }
    } catch (error) {
      console.error(
        `PageRouter: Failed to load page "${pageId}" from "${pageDef.path}":`,
        error
      );
      try {
        const errorResponse = await fetch("pages/error-page.html");
        if (errorResponse.ok) {
          pageContentArea.innerHTML = await errorResponse.text();
        } else {
          pageContentArea.innerHTML = `<div class="pixel-panel explanitory"><h3>Error</h3><p>Could not load page. Please check your connection and try again.</p></div>`;
        }
      } catch (errorPageError) {
        console.error("Failed to load error page:", errorPageError);
        pageContentArea.innerHTML = `<div class="pixel-panel explanitory"><h3>Error</h3><p>Could not load page. Please check your connection and try again.</p></div>`;
      }
      if (this.currentPageId) this.updateNavigation(this.currentPageId);
    }
  }

  updateNavigation(activePageId) {
    const navSelectors = ["#main_top_nav", "#bottom_nav"];
    navSelectors.forEach((selector) => {
      const navContainer = document.querySelector(selector);
      if (navContainer) {
        navContainer
          .querySelectorAll(".pixel-btn[data-page]")
          .forEach((btn) => {
            btn.classList.toggle("active", btn.dataset.page === activePageId);
          });
      }
    });
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
        wrapper.style.display = "";
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
